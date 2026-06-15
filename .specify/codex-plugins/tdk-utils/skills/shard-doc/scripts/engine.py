"""Engine: parse, split, and write markdown sections by heading level.

Pure regex with code-block awareness (``` and ~~~). Zero external deps.
"""
import re
import unicodedata
from pathlib import Path


def read_file(file_path: Path) -> str:
    """Read markdown file as raw string."""
    return file_path.read_text(encoding='utf-8')


def slugify(text: str) -> str:
    """Convert heading text to kebab-case slug, Unicode-safe.

    Strips diacritics (English, accented chars), keeps alphanumeric + hyphens.
    Returns empty string if all chars stripped (caller handles fallback).
    """
    normalized = unicodedata.normalize('NFD', text)
    ascii_text = ''.join(c for c in normalized if unicodedata.category(c) != 'Mn')
    slug = re.sub(r'[^a-z0-9]+', '-', ascii_text.lower()).strip('-')
    return slug


def get_document_title(preamble: str) -> str | None:
    """Extract H1 heading text from preamble."""
    match = re.search(r'^# (.+)$', preamble, re.MULTILINE)
    return match.group(1).strip() if match else None


def split_sections_by_heading(content: str, split_depth: int = 2) -> dict:
    """Split markdown content into preamble + sections at specified heading depth.

    Uses line-by-line parsing with code-block awareness to avoid
    false positives on headings inside fenced code blocks (``` and ~~~).
    """
    heading_pattern = re.compile(r'^(#{1,6})\s+(.+)$')
    fence_pattern = re.compile(r'^(`{3,}|~{3,})')
    lines = content.split('\n')
    preamble_lines = []
    sections = []
    current_section = None
    in_code_block = False
    fence_char = None
    fence_len = 0
    used_slugs = set()

    for line in lines:
        # Track fenced code blocks (``` or ~~~)
        fence_match = fence_pattern.match(line.strip())
        if fence_match:
            marker = fence_match.group(1)[0]  # '`' or '~'
            marker_len = len(fence_match.group(1))
            if not in_code_block:
                in_code_block = True
                fence_char = marker
                fence_len = marker_len
            elif marker == fence_char and marker_len >= fence_len:
                in_code_block = False
                fence_char = None
                fence_len = 0

        match = heading_pattern.match(line) if not in_code_block else None

        if match and len(match.group(1)) == split_depth:
            if current_section:
                sections.append(current_section)

            heading_text = match.group(2).strip()
            slug = slugify(heading_text)

            # Fallback for empty slugs (CJK, emoji-only headings)
            if not slug:
                slug = f'section-{len(sections) + 1}'

            # Dedup slug (collision-safe: checks against all used slugs including natural ones)
            original_slug = slug
            counter = 2
            while slug in used_slugs:
                slug = f'{original_slug}-{counter}'
                counter += 1
            used_slugs.add(slug)

            current_section = {
                'heading': heading_text,
                'depth': split_depth,
                'slug': slug,
                'index': len(sections) + 1,
                'lines': [line]
            }
        elif current_section:
            current_section['lines'].append(line)
        else:
            preamble_lines.append(line)

    if current_section:
        sections.append(current_section)

    # Convert line arrays to content strings
    for section in sections:
        section['content'] = '\n'.join(section.pop('lines'))

    return {
        'preamble': '\n'.join(preamble_lines),
        'sections': sections
    }


def write_section_files(
    sections: list,
    output_dir: Path,
    original_name: str,
    dry_run: bool = False
) -> list:
    """Write each section to a numbered kebab-case file.

    Each shard includes a backlink to the original (hub) document.
    If dry_run=True, returns file_map without writing any files.

    Constraint: backlink assumes output_dir is 1 level below original's parent.
    """
    file_map = []

    for section in sections:
        padded = str(section['index']).zfill(2)
        filename = f"{padded}-{section['slug']}.md"
        file_map.append({
            'index': section['index'],
            'slug': section['slug'],
            'filename': filename,
            'heading': section['heading']
        })

    if dry_run:
        return file_map

    output_dir.mkdir(parents=True, exist_ok=True)
    for section, entry in zip(sections, file_map):
        filepath = output_dir / entry['filename']
        backlink = f"> Parent: [[../{original_name}|{original_name}]]\n\n"
        content = backlink + section['content']
        filepath.write_text(content, encoding='utf-8')

    return file_map


def implode_shards(shard_dir: Path) -> dict:
    """Reconstruct original markdown by concatenating shard files in order.

    Strips backlink headers (> Parent: [[...]]) from each shard.
    Returns dict with 'content' (reconstructed markdown) and 'shards_read' count.
    """
    backlink_pattern = re.compile(r'^> Parent: \[\[.*?\]\]\n\n', re.MULTILINE)

    shard_files = sorted(shard_dir.glob('[0-9][0-9]-*.md'))
    if not shard_files:
        return {'content': '', 'shards_read': 0, 'files': []}

    parts = []
    for f in shard_files:
        text = f.read_text(encoding='utf-8')
        text = backlink_pattern.sub('', text, count=1)
        parts.append(text.strip())

    return {
        'content': '\n\n'.join(parts) + '\n',
        'shards_read': len(shard_files),
        'files': [f.name for f in shard_files]
    }
