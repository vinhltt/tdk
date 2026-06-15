#!/usr/bin/env python3
"""Shard-doc: Split markdown documents by heading level with wikilink integration.

CLI entry point. Orchestrates engine (parse/split/write) and rewriter (summary/wikilinks/index).
All user interaction handled by Claude agent — this script is headless.
"""
import argparse
import json
import sys
from pathlib import Path

# Add scripts dir to path for sibling imports
sys.path.insert(0, str(Path(__file__).parent))

from engine import read_file, split_sections_by_heading, write_section_files, get_document_title, implode_shards
from rewriter import rewrite_original_with_wikilinks, generate_section_index


def main():
    parser = argparse.ArgumentParser(
        description='Split markdown by headings, replace with wikilinks'
    )
    parser.add_argument('input', type=Path, help='Source markdown file')
    parser.add_argument('output', type=Path, help='Output directory (required)')
    parser.add_argument(
        '--depth', type=int, default=2, choices=range(1, 7),
        help='Heading level to split on (default: 2)'
    )
    parser.add_argument('--backup', action='store_true', help='Create .bak before rewriting original')
    parser.add_argument('--no-rewrite', action='store_true', help='Skip wikilink replacement in original')
    parser.add_argument('--dry-run', action='store_true', help='Zero file writes, print report')
    parser.add_argument('--json', action='store_true', help='Output report as JSON')
    parser.add_argument('--implode', action='store_true',
        help='Reverse: reconstruct original from shard folder (input=dir, output=file)')
    args = parser.parse_args()

    input_path = args.input.resolve()

    # --- Implode mode: reconstruct original from shard folder ---
    if args.implode:
        if not input_path.is_dir():
            print(f'Error: {input_path} is not a directory', file=sys.stderr)
            raise SystemExit(1)

        result = implode_shards(input_path)
        if result['shards_read'] == 0:
            print(f'Error: No shard files (XX-*.md) found in {input_path}', file=sys.stderr)
            raise SystemExit(1)

        target = args.output.resolve()
        if args.dry_run:
            print(result['content'])
        else:
            target.write_text(result['content'], encoding='utf-8')

        report = {
            'success': True,
            'mode': 'implode',
            'shard_dir': str(input_path),
            'output_file': str(target),
            'shards_read': result['shards_read'],
            'files_read': result['files'],
            'dry_run': args.dry_run
        }
        if args.json:
            print(json.dumps(report, indent=2))
        else:
            print(f'Imploded: {input_path}')
            print(f'Output:   {target}')
            print(f'Shards:   {result["shards_read"]}')
            if args.dry_run:
                print('(dry run - no files written)')
        return

    # --- Normal shard mode ---
    if not input_path.exists() or input_path.suffix != '.md':
        print(f'Error: {input_path} not found or not a .md file', file=sys.stderr)
        raise SystemExit(1)

    # Warn on conflicting flags
    if args.no_rewrite and args.backup:
        print('Warning: --backup ignored when --no-rewrite is set (original not modified)', file=sys.stderr)

    output_dir = args.output.resolve()
    original_size = input_path.stat().st_size

    # 1. Parse
    content = read_file(input_path)

    # 2. Split
    result = split_sections_by_heading(content, args.depth)
    if not result['sections']:
        print(f'Error: No H{args.depth} headings found in {input_path}', file=sys.stderr)
        raise SystemExit(1)

    # 3. Write section files
    file_map = write_section_files(
        result['sections'], output_dir, input_path.stem, dry_run=args.dry_run
    )

    # 4. Rewrite original with wikilinks
    if not args.no_rewrite:
        rewrite_original_with_wikilinks(
            input_path, result['preamble'], result['sections'], file_map, output_dir,
            create_backup=args.backup, dry_run=args.dry_run
        )

    # 5. Generate index
    title = get_document_title(result['preamble'])
    index_path = generate_section_index(
        output_dir, input_path, file_map, title, dry_run=args.dry_run
    )

    # Report
    new_size = input_path.stat().st_size if not args.dry_run and not args.no_rewrite else original_size
    reduction = ((original_size - new_size) / original_size * 100) if original_size > 0 else 0

    report = {
        'success': True,
        'source': str(input_path),
        'output_dir': str(output_dir),
        'split_depth': args.depth,
        'sections_created': len(result['sections']),
        'files_created': [e['filename'] for e in file_map],
        'index_created': str(index_path) if index_path else None,
        'original_rewritten': not args.no_rewrite and not args.dry_run,
        'backup_created': args.backup and not args.dry_run and not args.no_rewrite,
        'original_size_before': original_size,
        'original_size_after': new_size,
        'size_reduction': f'{reduction:.1f}%',
        'dry_run': args.dry_run
    }

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(f'Sharded: {input_path}')
        print(f'Output:  {output_dir}')
        print(f'Sections: {len(result["sections"])}')
        if not args.dry_run:
            print(f'Reduction: {reduction:.1f}%')
            if index_path:
                print(f'Index: {index_path}')
        else:
            print('(dry run - no files written)')


if __name__ == '__main__':
    main()
