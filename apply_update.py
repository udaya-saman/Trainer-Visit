#!/usr/bin/env python3
"""Safely patch the existing Trainer-Visit index.html without replacing its app code."""
from __future__ import annotations
import re
import sys
from pathlib import Path

SCRIPT_TAG = '<script src="trainer-visit-enhancements.js" defer></script>'
VIEWPORT = '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'


def main() -> int:
    folder = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) > 1 else Path.cwd().resolve()
    index_path = folder / 'index.html'
    if not index_path.is_file():
        print(f'ERROR: {index_path} does not exist. Run this script against your local Trainer-Visit repository folder.')
        return 2
    source = index_path.read_text(encoding='utf-8')
    if '</body>' not in source.lower():
        print('ERROR: index.html has no closing </body> tag; no files were changed.')
        return 2
    if 'trainer-visit-enhancements.js' in source:
        print('ERROR: The enhancement script is already referenced in index.html; no files were changed.')
        return 2

    viewport_pattern = re.compile(r'<meta\b(?=[^>]*\bname\s*=\s*["\']viewport["\'])[^>]*>', re.I)
    matches = list(viewport_pattern.finditer(source))
    if len(matches) != 1:
        print(f'ERROR: Expected exactly one viewport meta tag, found {len(matches)}; no files were changed.')
        return 2

    updated = viewport_pattern.sub(VIEWPORT, source, count=1)
    body_match = re.search(r'</body\s*>', updated, re.I)
    if not body_match:
        print('ERROR: Could not locate closing </body> tag; no files were changed.')
        return 2
    updated = updated[:body_match.start()] + SCRIPT_TAG + '\n' + updated[body_match.start():]

    backup = folder / 'index.html.pre-trainer-visit-update.bak'
    if backup.exists():
        print(f'ERROR: Backup already exists at {backup}; move it aside first. No files were changed.')
        return 2

    backup.write_text(source, encoding='utf-8')
    temp_path = folder / 'index.html.update-tmp'
    temp_path.write_text(updated, encoding='utf-8')
    temp_path.replace(index_path)
    print('Updated index.html successfully.')
    print(f'Original preserved at: {backup}')
    print('Required: place trainer-visit-enhancements.js in the same folder and replace sw.js with the supplied file.')
    print('No browser storage, saved reports, or drafts were intentionally cleared or migrated.')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
