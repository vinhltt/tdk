"""Rewriter: summary extraction, wikilink rewrite, index generation.

Rewrites original markdown with wikilinks after sharding.
Generates index.md in output directory.
"""
import shutil
from datetime import date
from pathlib import Path, PurePosixPath


def extract_summary(content: str) -> str:
    """Extract first paragraph after heading as summary (max 200 chars).

    Uses character-based truncation (not sentence regex) to avoid
    breaking on abbreviations, URLs, version numbers.
    """
    lines = content.split('\n')

    # Skip heading line and collect body
    body_lines = []
    past_heading = False
    for line in lines:
        if not past_heading:
            if line.strip().startswith('# ') or line.strip().startswith('## '):
                past_heading = True
            continue
        body_lines.append(line)

    body = '\n'.join(body_lines).strip()
    if not body:
        return ''

    # Take first paragraph (up to first blank line)
    first_para = body.split('\n\n')[0].replace('\n', ' ').strip()

    # Truncate at 200 chars on word boundary
    if len(first_para) <= 200:
        return first_para
    truncated = first_para[:200].rsplit(' ', 1)[0]
    return truncated + '...'


def rewrite_original_with_wikilinks(
    original_path: Path,
    preamble: str,
    sections: list,
    file_map: list,
    output_dir: Path,
    create_backup: bool = False,
    dry_run: bool = False
) -> dict:
    """Rewrite original file: replace section bodies with summary + wikilinks.

    If dry_run=True, prints rewritten content to stdout without any file writes.
    """
    # Backup if requested (and not dry run)
    if create_backup and not dry_run:
        shutil.copy2(original_path, f'{original_path}.bak')

    # Compute relative path from original's dir to output dir (forward slashes for wikilinks)
    try:
        rel_dir = PurePosixPath(output_dir.relative_to(original_path.parent))
    except ValueError:
        # output_dir not under original's parent — fallback to dir name (lossy for cross-drive)
        rel_dir = PurePosixPath(output_dir.name)

    parts = []

    # 1. Preamble (unchanged)
    if preamble.strip():
        parts.append(preamble.rstrip())

    # 2. For each section: heading + summary + wikilink
    for section, file_entry in zip(sections, file_map):
        hashes = '#' * section['depth']
        heading_line = f"{hashes} {section['heading']}"

        summary = extract_summary(section['content'])

        # Wikilink: omit .md extension (Obsidian standard)
        wiki_target = f"{rel_dir}/{file_entry['filename'].removesuffix('.md')}"
        wikilink = f"[[{wiki_target}|{section['heading']}]]"

        block = f"{heading_line}\n"
        if summary:
            block += f"\n{summary}\n"
        block += f"\n> Full details: {wikilink}\n"

        parts.append(block)

    output = '\n\n'.join(parts) + '\n'

    if dry_run:
        print(output)
        return {'original_path': str(original_path), 'sections_replaced': len(sections), 'dry_run': True}

    original_path.write_text(output, encoding='utf-8')
    return {'original_path': str(original_path), 'sections_replaced': len(sections)}


def generate_section_index(
    output_dir: Path,
    original_path: Path,
    file_map: list,
    document_title: str | None = None,
    dry_run: bool = False
) -> Path | None:
    """Generate index.md with TOC linking to all section files.

    If dry_run=True, returns None without writing.
    """
    if dry_run:
        return None

    today = date.today().isoformat()
    original_name = original_path.stem

    # Backlink: assumes output_dir is 1 level below original's parent
    rel_to_original = PurePosixPath('..') / original_name

    title = document_title or original_name

    lines = [
        f'# {title} - Sections',
        '',
        f'> Sharded from [[{rel_to_original}|{original_name}.md]]',
        f'> Generated: {today}',
        '',
        '## Table of Contents',
        '',
    ]

    for entry in file_map:
        target = entry['filename'].removesuffix('.md')
        lines.append(f"{entry['index']}. [[{target}|{entry['heading']}]]")

    lines.extend([
        '',
        '---',
        '',
        f"*{len(file_map)} sections extracted from original document.*",
        '',
    ])

    index_path = output_dir / 'index.md'
    index_path.write_text('\n'.join(lines), encoding='utf-8')

    return index_path
