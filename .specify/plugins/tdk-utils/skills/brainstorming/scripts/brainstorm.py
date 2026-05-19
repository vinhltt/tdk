#!/usr/bin/env python3
"""
Brainstorm Script - Enforce output path convention for brainstorming reports.

Usage:
    python brainstorm.py {task_id}         # Task-specific brainstorm
    python brainstorm.py                   # General brainstorm

Outputs:
    - Task-specific: .specify/{domain}/{task_id}/brainstorm/{timestamp-slug}.md
    - General: .specify/brainstorm/{timestamp-slug}.md
"""

import sys
import os
import json
from pathlib import Path
from datetime import datetime


def load_specify_config():
    """Load prefixList from .specify/.specify.json"""
    json_file = Path.cwd() / ".specify" / ".specify.json"
    if not json_file.exists():
        yaml_file = Path.cwd() / ".specify" / ".specify.yaml"
        if yaml_file.exists():
            print("speckit: found .specify.yaml but .specify.json is required. Run:\n  bash .specify/scripts/bash/migrate-yaml-to-json.sh", file=sys.stderr)
        else:
            print("speckit: .specify/.specify.json not found.", file=sys.stderr)
        sys.exit(1)
    with open(json_file, 'r', encoding='utf-8') as f:
        config = json.load(f)
    return config.get("prefixList", "MRR")


def find_task_directory(task_id):
    """
    Search for task_id directory in .specify/*/
    Returns: (domain, task_path) or (None, None)
    """
    specify_root = Path.cwd() / ".specify"
    if not specify_root.exists():
        return None, None
    
    # Search in all subdirectories
    for domain_dir in specify_root.iterdir():
        if domain_dir.is_dir() and not domain_dir.name.startswith('.'):
            task_dir = domain_dir / task_id
            if task_dir.exists() and task_dir.is_dir():
                return domain_dir.name, task_dir
    
    return None, None


def detect_task_from_conversation():
    """
    Try to detect task_id from conversation history.
    This is a placeholder - in real implementation, would need access to conversation.
    """
    # Placeholder: Cannot access conversation from Python script
    # Agent must pass task_id explicitly
    return None


def generate_filename(slug=None):
    """Generate filename with convention: {YYMMDD-HHmm-slug}.md"""
    now = datetime.now()
    timestamp = now.strftime("%y%m%d-%H%M")
    
    if slug:
        # Clean slug: lowercase, replace spaces with hyphens
        clean_slug = slug.lower().replace(' ', '-').replace('_', '-')
        # Remove invalid characters
        clean_slug = ''.join(c for c in clean_slug if c.isalnum() or c == '-')
        return f"{timestamp}-{clean_slug}.md"
    else:
        return f"{timestamp}-brainstorm.md"


def create_output_path(domain=None, task_id=None, slug=None):
    """
    Create and return the correct output path.
    
    Returns:
        dict: {
            "output_path": str,
            "filename": str,
            "full_path": str,
            "domain": str or None,
            "task_id": str or None,
            "mode": "task-specific" or "general"
        }
    """
    filename = generate_filename(slug)
    
    if domain and task_id:
        # Task-specific mode
        output_dir = Path.cwd() / ".specify" / domain / task_id / "brainstorm"
        mode = "task-specific"
    else:
        # General mode
        output_dir = Path.cwd() / ".specify" / "brainstorm"
        mode = "general"
    
    # Create directory if not exists
    output_dir.mkdir(parents=True, exist_ok=True)
    
    full_path = output_dir / filename
    
    return {
        "output_path": str(output_dir),
        "filename": filename,
        "full_path": str(full_path),
        "domain": domain,
        "task_id": task_id,
        "mode": mode
    }


def check_task_state(task_path):
    """Check task artifact state.

    - has_spec: spec.md present
    - has_plan: plan.md present
    - has_plan_phases: plan.md contains `## Phases` heading (primary SoT)
    - has_tasks: tasks.md present (DEPRECATED — legacy path, prefer has_plan_phases)
    """
    if not task_path:
        return {}

    task_dir = Path(task_path)
    plan_md = task_dir / "plan.md"
    has_plan_phases = False
    if plan_md.exists():
        try:
            has_plan_phases = "## Phases" in plan_md.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            has_plan_phases = False

    return {
        "has_spec": (task_dir / "spec.md").exists(),
        "has_plan": plan_md.exists(),
        "has_plan_phases": has_plan_phases,
        "has_tasks": (task_dir / "tasks.md").exists(),  # deprecated
    }


def main():
    """Main entry point"""
    # Parse arguments
    task_id = None
    slug = None
    prefix = load_specify_config()
    
    if len(sys.argv) > 1:
        arg1 = sys.argv[1].strip()
        
        # Check if arg1 looks like a task_id
        # Task ID format: {PREFIX}-{NUMBER} or just {NUMBER}
        is_task_id = False
        
        if arg1.isdigit():
            # Pure number → task_id
            is_task_id = True
            task_id = f"{prefix}-{arg1}"
        elif arg1.upper().startswith(f"{prefix}-"):
            # Already has prefix → task_id
            is_task_id = True
            # Normalize case
            parts = arg1.split('-', 1)
            if len(parts) == 2:
                task_id = f"{prefix}-{parts[1]}"
            else:
                task_id = arg1.upper()
        elif '-' in arg1:
            # Has dash - check if format is PREFIX-NUMBER
            parts = arg1.split('-')
            if len(parts) >= 2 and parts[0].upper() == prefix.upper() and parts[1].isdigit():
                # Looks like task_id with wrong case
                is_task_id = True
                task_id = f"{prefix}-{parts[1]}"
        
        if not is_task_id:
            # Not a task_id → treat as slug
            slug = arg1
    
    if len(sys.argv) > 2:
        slug = sys.argv[2].strip()
    
    # Find task directory if task_id provided
    domain = None
    task_path = None
    task_state = {}
    
    if task_id:
        domain, task_path = find_task_directory(task_id)
        if not domain:
            # Task not found - ask user
            print(json.dumps({
                "success": False,
                "error": "task_not_found",
                "message": f"Task '{task_id}' not found in .specify/*/. Use General mode?",
                "task_id": task_id
            }), file=sys.stderr)
            sys.exit(1)
        
        task_state = check_task_state(task_path)
    
    # Create output path
    result = create_output_path(domain, task_id, slug)
    result["task_state"] = task_state
    result["success"] = True
    
    # Output as JSON for agent consumption
    print(json.dumps(result, indent=2))
    
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": "script_error",
            "message": str(e)
        }), file=sys.stderr)
        sys.exit(1)
