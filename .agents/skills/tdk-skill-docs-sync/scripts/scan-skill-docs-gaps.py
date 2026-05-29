"""
Scan tdk-speckit marketplace skills against docs and report documentation gaps.

Usage:
    python scan-skill-docs-gaps.py <skill-name> [--plugin <plugin>] [--all]

Output: JSON gap report to stdout.

Arguments:
    <skill-name>    Name of skill to check (e.g., tdk-ut-auto)
    --plugin <name> Limit search to specific plugin
    --all           Scan ALL skills across all marketplace plugins
"""

import argparse
import json
import re
import sys
from pathlib import Path

# Resolve paths relative to this script
SCRIPT_DIR = Path(__file__).resolve().parent
# scripts/ -> tdk-skill-docs-sync/ -> skills/ -> .claude/ -> <project-root>/
SPECIFY_ROOT = SCRIPT_DIR.parents[3] / ".specify"
PLUGINS_DIR = SPECIFY_ROOT / "plugins"
MANIFEST_PATH = PLUGINS_DIR / "manifest.json"
GUIDES_DIR = SPECIFY_ROOT / "docs" / "guides"
CMD_REF_PATH = GUIDES_DIR / "command-reference.md"
README_PATH = GUIDES_DIR / "README.md"
SCENARIOS_DIR = GUIDES_DIR / "scenarios"


def find_skill(skill_name: str, plugin_filter: str | None = None) -> dict | None:
    """Find a skill's SKILL.md in the marketplace. Returns dict with path, plugin, metadata."""
    search_dirs = (
        [PLUGINS_DIR / plugin_filter]
        if plugin_filter
        else sorted(PLUGINS_DIR.iterdir())
    )

    for plugin_dir in search_dirs:
        if not plugin_dir.is_dir():
            continue
        skill_path = plugin_dir / "skills" / skill_name / "SKILL.md"
        if skill_path.exists():
            text = skill_path.read_text(encoding="utf-8")
            name, desc = parse_frontmatter(text)
            return {
                "path": str(skill_path.relative_to(SPECIFY_ROOT)),
                "plugin": plugin_dir.name,
                "name": name or skill_name,
                "description": desc or "",
                "skill_dir": str(
                    (plugin_dir / "skills" / skill_name).relative_to(SPECIFY_ROOT)
                ),
            }
    return None


def parse_frontmatter(text: str) -> tuple[str, str]:
    """Extract name and description from YAML frontmatter."""
    match = re.match(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
    if not match:
        return ("", "")
    fm = match.group(1)
    name = ""
    desc = ""
    for line in fm.splitlines():
        if line.startswith("name:"):
            name = line.split(":", 1)[1].strip().strip("\"'")
        elif line.startswith("description:"):
            desc = line.split(":", 1)[1].strip().strip("\"'")
    return (name, desc)


def parse_cheat_sheet(text: str) -> list[dict]:
    """Parse cheat sheet table rows from command-reference.md."""
    entries = []
    in_table = False
    for line in text.splitlines():
        if "| # | Command | Description |" in line:
            in_table = True
            continue
        if in_table and line.startswith("|---"):
            continue
        if in_table and line.startswith("|"):
            cols = [c.strip() for c in line.split("|")[1:-1]]
            if len(cols) >= 3:
                num = cols[0].strip()
                cmd = cols[1].strip()
                desc = cols[2].strip()
                entries.append({"num": num, "command": cmd, "description": desc})
        elif in_table and line.strip() == "---":
            break
        elif in_table and not line.startswith("|"):
            break
    return entries


def check_cheat_sheet(skill_name: str) -> dict:
    """Check if skill exists in cheat sheet table."""
    if not CMD_REF_PATH.exists():
        return {"status": "ERROR", "detail": "command-reference.md not found"}

    text = CMD_REF_PATH.read_text(encoding="utf-8")
    entries = parse_cheat_sheet(text)

    # Count actual numbered entries (exclude category separator rows)
    numbered = [e for e in entries if e["num"] not in ("—", "")]
    total = len(numbered)

    # Search for skill
    skill_cmd = f"/{skill_name}"
    for entry in entries:
        if skill_cmd in entry["command"] or skill_name in entry["command"]:
            return {
                "status": "OK",
                "detail": f"Found as #{entry['num']}: {entry['description']}",
                "entry": entry,
                "total_commands": total,
            }

    return {
        "status": "GAP",
        "detail": f"Not found in cheat sheet ({total} commands listed)",
        "total_commands": total,
        "next_number": total + 1,
    }


def check_detailed_section(skill_name: str) -> dict:
    """Check if skill has a detailed section in command-reference.md."""
    if not CMD_REF_PATH.exists():
        return {"status": "ERROR", "detail": "command-reference.md not found"}

    text = CMD_REF_PATH.read_text(encoding="utf-8")
    skill_cmd = f"/{skill_name}"

    # Look for heading containing skill name
    heading_pattern = re.compile(
        rf"^###?\s+.*{re.escape(skill_cmd)}|^###?\s+.*{re.escape(skill_name)}",
        re.MULTILINE,
    )
    match = heading_pattern.search(text)

    if match:
        return {"status": "OK", "detail": f"Detailed section found: {match.group(0).strip()}"}

    # Check if mentioned anywhere (not just headings)
    if skill_name in text or skill_cmd in text:
        return {
            "status": "INFO",
            "detail": "Mentioned in text but no dedicated section",
        }

    # Non-tdk skills don't need detailed section
    if not skill_name.startswith("tdk-"):
        return {
            "status": "INFO",
            "detail": "Non-tdk skill — detailed section optional",
        }

    return {"status": "GAP", "detail": "No detailed section found"}


def check_readme(skill_name: str) -> dict:
    """Check README.md for stale skill counts or missing references."""
    if not README_PATH.exists():
        return {"status": "ERROR", "detail": "README.md not found"}

    text = README_PATH.read_text(encoding="utf-8")

    # Check for explicit skill count mentions
    count_matches = re.findall(r"(\d+)\s*(?:skills|commands)", text, re.IGNORECASE)

    result = {"status": "OK", "detail": "No stale counts detected", "counts_found": []}

    if count_matches:
        result["counts_found"] = count_matches

    # Check if skill is mentioned
    if skill_name in text:
        result["mentioned"] = True
    else:
        result["mentioned"] = False

    return result


def check_scenarios(skill_name: str) -> dict:
    """Check if any scenario references this skill."""
    if not SCENARIOS_DIR.exists():
        return {"status": "INFO", "detail": "Scenarios directory not found"}

    mentions = []
    for f in sorted(SCENARIOS_DIR.glob("*.md")):
        text = f.read_text(encoding="utf-8")
        if skill_name in text or f"/{skill_name}" in text:
            mentions.append(f.name)

    if mentions:
        return {
            "status": "OK",
            "detail": f"Referenced in {len(mentions)} scenario(s): {', '.join(mentions)}",
        }

    return {"status": "INFO", "detail": "No scenario references this skill"}


def check_plugin_json(skill_name: str, plugin_name: str) -> dict:
    """Check if skill is registered in manifest.json."""
    if not MANIFEST_PATH.exists():
        return {"status": "ERROR", "detail": "manifest.json not found"}

    data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    plugin = data.get("plugins", {}).get(plugin_name, {})
    skills = plugin.get("components", {}).get("skills", {})

    if skill_name in skills:
        info = skills[skill_name]
        return {
            "status": "OK",
            "detail": f"Registered — v{info.get('version', '?')}",
        }

    return {
        "status": "WARNING",
        "detail": "Not registered in manifest.json",
    }


def list_all_skills() -> list[dict]:
    """List all skills across marketplace."""
    skills = []
    for plugin_dir in sorted(PLUGINS_DIR.iterdir()):
        if not plugin_dir.is_dir():
            continue
        skills_dir = plugin_dir / "skills"
        if not skills_dir.exists():
            continue
        for skill_dir in sorted(skills_dir.iterdir()):
            skill_md = skill_dir / "SKILL.md"
            if skill_md.exists():
                name, desc = parse_frontmatter(
                    skill_md.read_text(encoding="utf-8")
                )
                skills.append(
                    {
                        "name": name or skill_dir.name,
                        "plugin": plugin_dir.name,
                        "description": desc or "",
                    }
                )
    return skills


def scan_skill(skill_name: str, plugin_filter: str | None = None) -> dict:
    """Run all checks for a single skill and return gap report."""
    skill = find_skill(skill_name, plugin_filter)
    if not skill:
        return {
            "error": f"Skill '{skill_name}' not found in marketplace"
            + (f" (plugin: {plugin_filter})" if plugin_filter else ""),
            "suggestion": "Check spelling or use --plugin to specify plugin",
        }

    report = {
        "skill": skill,
        "checks": {
            "cheat_sheet": check_cheat_sheet(skill_name),
            "detailed_section": check_detailed_section(skill_name),
            "readme": check_readme(skill_name),
            "scenarios": check_scenarios(skill_name),
            "plugin_json": check_plugin_json(skill_name, skill["plugin"]),
        },
        "summary": {},
    }

    # Compute summary
    gaps = []
    warnings = []
    infos = []
    for check_name, result in report["checks"].items():
        status = result.get("status", "")
        if status == "GAP":
            gaps.append(check_name)
        elif status == "WARNING":
            warnings.append(check_name)
        elif status == "INFO":
            infos.append(check_name)

    report["summary"] = {
        "total_checks": len(report["checks"]),
        "gaps": gaps,
        "warnings": warnings,
        "infos": infos,
        "ok_count": len(report["checks"]) - len(gaps) - len(warnings) - len(infos),
        "needs_action": len(gaps) > 0,
    }

    return report


def scan_all(plugin_filter: str | None = None) -> dict:
    """Scan all skills and return aggregated report."""
    all_skills = list_all_skills()
    if plugin_filter:
        all_skills = [s for s in all_skills if s["plugin"] == plugin_filter]

    results = []
    for skill in all_skills:
        report = scan_skill(skill["name"], skill["plugin"])
        if "error" not in report:
            results.append(
                {
                    "name": skill["name"],
                    "plugin": skill["plugin"],
                    "gaps": report["summary"]["gaps"],
                    "warnings": report["summary"]["warnings"],
                }
            )

    with_gaps = [r for r in results if r["gaps"]]
    with_warnings = [r for r in results if r["warnings"]]

    return {
        "total_skills": len(results),
        "skills_with_gaps": len(with_gaps),
        "skills_with_warnings": len(with_warnings),
        "details": results,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Scan skill documentation gaps in tdk-speckit marketplace"
    )
    parser.add_argument("skill_name", nargs="?", help="Skill name to check")
    parser.add_argument("--plugin", help="Limit to specific plugin")
    parser.add_argument(
        "--all", action="store_true", help="Scan all skills"
    )

    args = parser.parse_args()

    if args.all:
        result = scan_all(args.plugin)
    elif args.skill_name:
        result = scan_skill(args.skill_name, args.plugin)
    else:
        parser.error("Provide <skill-name> or --all")
        return

    json.dump(result, sys.stdout, indent=2, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main()
