#!/usr/bin/env python3
"""Parse OpenAPI v2/v3 specs and output structured JSON for AI consumption.

Usage: python parse_openapi_spec.py <spec_file_path>
Output: JSON to stdout with endpoints grouped by resource, sorted by CRUD order.
Dependencies: pyyaml (pip install pyyaml)
"""

import json
import sys
from typing import Optional
from pathlib import Path

try:
    import yaml
except ImportError:
    print("Error: PyYAML required. Install with: pip install pyyaml", file=sys.stderr)
    sys.exit(1)

# CRUD lifecycle ordering for consistent test execution
CRUD_ORDER = {"post": 0, "get": 1, "put": 2, "patch": 3, "delete": 4, "head": 5, "options": 6}
MAX_REF_DEPTH = 50


def load_spec(path: str) -> dict:
    """Load OpenAPI spec from YAML or JSON file."""
    p = Path(path)
    if not p.exists():
        print(f"Error: File not found: {path}", file=sys.stderr)
        sys.exit(1)
    content = p.read_text(encoding="utf-8")
    if p.suffix in (".yaml", ".yml"):
        return yaml.safe_load(content) or {}
    return json.loads(content)


def detect_version(spec: dict) -> str:
    """Detect OpenAPI version: 'v2' (Swagger) or 'v3'."""
    if "swagger" in spec:
        return "v2"
    if "openapi" in spec:
        return "v3"
    print("Warning: Cannot detect version, assuming v3", file=sys.stderr)
    return "v3"


def resolve_ref(spec: dict, ref_str: str, depth: int = 0, visited: set = None) -> dict:
    """Resolve a $ref string to its target object within the spec."""
    if visited is None:
        visited = set()
    if depth > MAX_REF_DEPTH:
        return {"$error": f"Max ref depth ({MAX_REF_DEPTH}) exceeded: {ref_str}"}
    if ref_str in visited:
        return {"$circular_ref": ref_str}

    # Only support internal refs
    if not ref_str.startswith("#/"):
        return {"$error": f"External $ref not supported in MVP: {ref_str}"}

    visited.add(ref_str)
    parts = ref_str.lstrip("#/").split("/")
    node = spec
    for part in parts:
        if isinstance(node, dict) and part in node:
            node = node[part]
        else:
            return {"$error": f"Ref path not found: {ref_str}"}

    # Recursively resolve if target also has $ref
    if isinstance(node, dict) and "$ref" in node:
        return resolve_ref(spec, node["$ref"], depth + 1, visited)
    return node


def resolve_all_refs(spec: dict, obj, depth: int = 0, visited: set = None) -> any:
    """Recursively resolve all $ref in an object tree."""
    if visited is None:
        visited = set()
    if depth > MAX_REF_DEPTH:
        return obj

    if isinstance(obj, dict):
        if "$ref" in obj:
            resolved = resolve_ref(spec, obj["$ref"], depth, visited.copy())
            return resolve_all_refs(spec, resolved, depth + 1, visited)
        # Handle allOf composition
        if "allOf" in obj:
            merged = {}
            merged_props = {}
            for item in obj["allOf"]:
                resolved_item = resolve_all_refs(spec, item, depth + 1, visited.copy())
                if isinstance(resolved_item, dict):
                    merged_props.update(resolved_item.get("properties", {}))
                    merged.update(resolved_item)
            if merged_props:
                merged["properties"] = merged_props
            merged.pop("allOf", None)
            return merged
        # Log warning for oneOf/anyOf (skip for MVP)
        for combo in ("oneOf", "anyOf"):
            if combo in obj:
                print(f"Warning: {combo} skipped in MVP — using first option", file=sys.stderr)
                first = obj[combo][0] if obj[combo] else {}
                return resolve_all_refs(spec, first, depth + 1, visited)
        return {k: resolve_all_refs(spec, v, depth + 1, visited) for k, v in obj.items()}
    if isinstance(obj, list):
        return [resolve_all_refs(spec, item, depth + 1, visited) for item in obj]
    return obj


def extract_auth(spec: dict, version: str) -> dict:
    """Extract auth schemes from spec."""
    if version == "v2":
        return spec.get("securityDefinitions", {})
    return spec.get("components", {}).get("securitySchemes", {})


def get_endpoint_auth(operation: dict, path_item: dict, spec: dict) -> tuple:
    """Determine auth requirements for an endpoint."""
    security = operation.get("security", path_item.get("security", spec.get("security", [])))
    if not security:
        return False, []
    schemes = []
    for sec in security:
        if isinstance(sec, dict):
            schemes.extend(sec.keys())
    return bool(schemes), list(set(schemes))


def extract_request_body(operation: dict, version: str) -> Optional[dict]:
    """Extract request body schema, normalizing v2 vs v3."""
    if version == "v3":
        rb = operation.get("requestBody", {})
        content = rb.get("content", {})
        for ct in ("application/json", "multipart/form-data", "application/x-www-form-urlencoded"):
            if ct in content:
                return content[ct].get("schema", {})
        return None
    # v2: body parameter
    for param in operation.get("parameters", []):
        if param.get("in") == "body":
            return param.get("schema", {})
    return None


def extract_endpoints(spec: dict, version: str) -> list:
    """Extract all endpoints with normalized structure."""
    endpoints = []
    paths = spec.get("paths", {})
    for path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue
        for method in ("get", "post", "put", "patch", "delete", "head", "options"):
            if method not in path_item:
                continue
            op = path_item[method]
            if not isinstance(op, dict):
                continue
            auth_required, auth_schemes = get_endpoint_auth(op, path_item, spec)
            params = [p for p in op.get("parameters", []) if p.get("in") != "body"]
            # Also include path-level parameters
            for p in path_item.get("parameters", []):
                if p.get("in") != "body" and p not in params:
                    params.append(p)
            endpoints.append({
                "path": path,
                "method": method.upper(),
                "operation_id": op.get("operationId", ""),
                "summary": op.get("summary", ""),
                "tags": op.get("tags", []),
                "auth_required": auth_required,
                "auth_schemes": auth_schemes,
                "request_body": extract_request_body(op, version),
                "parameters": params,
                "responses": op.get("responses", {}),
            })
    return endpoints


def group_by_resource(endpoints: list) -> dict:
    """Group endpoints by resource name extracted from path."""
    groups = {}
    for ep in endpoints:
        parts = [p for p in ep["path"].split("/") if p and not p.startswith("{")]
        # Skip version segments like 'v1', 'v2', 'api'
        resource_parts = [p for p in parts if p not in ("api", "v1", "v2", "v3")]
        resource = resource_parts[0] if resource_parts else "root"
        if resource not in groups:
            groups[resource] = {"base_path": "", "endpoints": []}
        groups[resource]["endpoints"].append(ep)
    # Set base_path from first endpoint
    for resource, group in groups.items():
        if group["endpoints"]:
            group["base_path"] = group["endpoints"][0]["path"].rsplit("/", 1)[0] or "/"
    return groups


def sort_crud_order(groups: dict) -> dict:
    """Sort endpoints within each group by CRUD lifecycle order."""
    for resource in groups.values():
        resource["endpoints"].sort(key=lambda ep: (
            CRUD_ORDER.get(ep["method"].lower(), 99),
            # GET list before GET detail (shorter path first)
            len(ep["path"]),
        ))
    return groups


def get_base_url(spec: dict, version: str) -> str:
    """Extract base URL from spec."""
    if version == "v2":
        host = spec.get("host", "")
        base = spec.get("basePath", "/")
        schemes = spec.get("schemes", ["https"])
        return f"{schemes[0]}://{host}{base}" if host else base
    servers = spec.get("servers", [])
    return servers[0].get("url", "/") if servers else "/"


def main():
    if len(sys.argv) < 2:
        print("Usage: python parse_openapi_spec.py <spec_file_path>", file=sys.stderr)
        sys.exit(1)

    spec_path = sys.argv[1]
    raw_spec = load_spec(spec_path)
    version = detect_version(raw_spec)

    # Resolve all $ref before extraction
    spec = resolve_all_refs(raw_spec, raw_spec)

    auth_schemes = extract_auth(spec, version)
    endpoints = extract_endpoints(spec, version)
    groups = group_by_resource(endpoints)
    groups = sort_crud_order(groups)

    output = {
        "version": version,
        "title": spec.get("info", {}).get("title", "Unknown API"),
        "base_url": get_base_url(spec, version),
        "auth_schemes": auth_schemes,
        "resources": groups,
        "endpoint_count": len(endpoints),
        "resource_count": len(groups),
    }
    print(json.dumps(output, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
