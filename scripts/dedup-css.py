#!/usr/bin/env python3
"""
CSS Deduplication Script
Removes duplicate rule blocks from app.css, keeping only the first occurrence.
Run: python scripts/dedup-css.py
"""

import re
import sys

CSS_FILE = "public/css/app.css"

def deduplicate_css(css_text: str) -> tuple[str, dict]:
    """
    Split CSS into blocks (selector { ... }) and keep only first occurrence
    of each unique block. Returns (deduped_css, stats).
    """
    # Pattern to match CSS blocks: selector { ... }
    # Handles nested braces in @media, @keyframes, etc.
    def split_blocks(text):
        blocks = []
        i = 0
        while i < len(text):
            # Skip whitespace/comments between blocks
            if text[i] in ' \t\n\r':
                i += 1
                continue
            if text[i:i+2] == '/*':
                # Skip comment
                end = text.find('*/', i + 2)
                if end == -1:
                    i = len(text)
                else:
                    i = end + 2
                continue
            
            # Find selector start
            selector_start = i
            # Find opening brace
            brace_depth = 0
            in_string = False
            string_char = None
            brace_start = -1
            
            for j in range(i, len(text)):
                ch = text[j]
                if in_string:
                    if ch == string_char:
                        in_string = False
                    elif ch == '\\' and j + 1 < len(text):
                        j += 1  # skip escaped char
                    continue
                
                if ch in ('"', "'"):
                    in_string = True
                    string_char = ch
                    continue
                
                if ch == '{':
                    if brace_depth == 0:
                        brace_start = j
                    brace_depth += 1
                elif ch == '}':
                    brace_depth -= 1
                    if brace_depth == 0 and brace_start != -1:
                        # Complete block found
                        block = text[selector_start:j+1]
                        blocks.append(block)
                        i = j + 1
                        break
            else:
                # No closing brace found, rest is trailing
                break
        
        return blocks
    
    blocks = split_blocks(css_text)
    
    seen = {}
    unique_blocks = []
    duplicates_removed = 0
    dup_details = {}
    
    for block in blocks:
        # Normalize: strip whitespace for comparison
        normalized = block.strip()
        if normalized in seen:
            duplicates_removed += 1
            # Get first 60 chars for reporting
            first_line = normalized.split('\n')[0][:60]
            dup_details[first_line] = dup_details.get(first_line, 0) + 1
        else:
            seen[normalized] = True
            unique_blocks.append(block)
    
    stats = {
        'total_blocks': len(blocks),
        'unique_blocks': len(unique_blocks),
        'duplicates_removed': duplicates_removed,
        'dup_details': dup_details,
    }
    
    return '\n\n'.join(unique_blocks) + '\n', stats


def main():
    try:
        with open(CSS_FILE, 'r', encoding='utf-8') as f:
            css_text = f.read()
    except FileNotFoundError:
        print(f"Error: {CSS_FILE} not found")
        sys.exit(1)
    
    original_size = len(css_text)
    deduped_css, stats = deduplicate_css(css_text)
    new_size = len(deduped_css)
    
    savings = original_size - new_size
    savings_pct = (savings / original_size * 100) if original_size > 0 else 0
    
    print(f"=== CSS Deduplication Results ===")
    print(f"Original size:  {original_size:,} bytes ({original_size/1024:.1f} KB)")
    print(f"New size:       {new_size:,} bytes ({new_size/1024:.1f} KB)")
    print(f"Savings:        {savings:,} bytes ({savings_pct:.1f}%)")
    print(f"Total blocks:   {stats['total_blocks']}")
    print(f"Unique blocks:  {stats['unique_blocks']}")
    print(f"Duplicates:     {stats['duplicates_removed']}")
    print()
    
    if stats['dup_details']:
        print("Most duplicated blocks:")
        for line, count in sorted(stats['dup_details'].items(), key=lambda x: -x[1])[:15]:
            print(f"  {count}x: {line}")
    
    # Write backup
    backup_file = CSS_FILE + '.bak'
    with open(backup_file, 'w', encoding='utf-8') as f:
        f.write(css_text)
    print(f"\nBackup saved to {backup_file}")
    
    # Write deduped CSS
    with open(CSS_FILE, 'w', encoding='utf-8') as f:
        f.write(deduped_css)
    print(f"Deduped CSS written to {CSS_FILE}")
    
    # Verify no syntax was broken (basic check)
    open_braces = deduped_css.count('{')
    close_braces = deduped_css.count('}')
    if open_braces != close_braces:
        print(f"\nWARNING: Brace mismatch! Open: {open_braces}, Close: {close_braces}")
        print("Restoring backup...")
        with open(CSS_FILE, 'w', encoding='utf-8') as f:
            f.write(css_text)
        sys.exit(1)
    
    print("CSS structure valid (brace count matches).")


if __name__ == '__main__':
    main()
