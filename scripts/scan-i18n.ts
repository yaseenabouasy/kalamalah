#!/usr/bin/env bun
/**
 * i18n Text Scanner
 * Scans the codebase for all user-facing text that needs translation.
 * Outputs: file, line, element type, id/class, text content
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, extname } from 'path';

const ROOT = process.cwd();
const EXTENSIONS = ['.ts', '.tsx', '.html', '.js', '.vue', '.svelte'];
const EXCLUDE_DIRS = ['node_modules', 'dist', '.git', 'vendor', 'main', '.cache', 'dist_old'];

interface TextMatch {
  file: string;
  line: number;
  type: string;
  id?: string;
  class?: string;
  'data-i18n'?: string;
  'data-i18n-attr'?: string;
  text: string;
  context: string;
}

// Regex patterns for finding user-facing text
const PATTERNS = [
  // data-i18n attributes (highest priority - already marked for translation)
  { regex: /data-i18n\s*=\s*["']([^"']+)["']/g, type: 'data-i18n', extract: (m: RegExpMatchArray) => m[1] },
  { regex: /data-i18n-attr\s*=\s*["']([^"']+)["']/g, type: 'data-i18n-attr', extract: (m: RegExpMatchArray) => m[1] },
  // data-i18n-title, data-i18n-placeholder, etc.
  { regex: /data-i18n-(title|placeholder|label|alt|aria-label)\s*=\s*["']([^"']+)["']/g, type: 'data-i18n-*', extract: (m: RegExpMatchArray) => m[2] },
  // Text content in JSX/TSX/HTML: >Text<
  { regex: />\s*([A-Za-z][^<>{}\n]{2,200})\s*</g, type: 'jsx-text', extract: (m: RegExpMatchArray) => m[1].trim() },
  // Template literals with text: `Text`
  { regex: /`([A-Za-z][^`\n]{10,200})`/g, type: 'template-literal', extract: (m: RegExpMatchArray) => m[1].trim() },
  // String literals in .textContent = "Text"
  { regex: /\.(textContent|innerText|innerHTML|value|placeholder|title|alt|ariaLabel|aria-label)\s*=\s*["']([^"']{3,200})["']/g, type: 'dom-assign', extract: (m: RegExpMatchArray) => m[2] },
  // String literals in alert/confirm/prompt/console.log
  { regex: /\b(alert|confirm|prompt|console\.(log|warn|error))\s*\(["'`]([^"'`\n]{3,200})["'`]/g, type: 'dialog', extract: (m: RegExpMatchArray) => m[3] },
  // t() or i18n() function calls
  { regex: /\b(t|i18n|translate|__)\s*\(["']([^"']{3,200})["']/g, type: 'i18n-fn', extract: (m: RegExpMatchArray) => m[2] },
];

// Filter out false positives
const BLACKLIST = [
  /^https?:\/\//,
  /^[.#]/,
  /^[a-z-]+:/,
  /^[0-9]+$/,
  /^[A-Z_]+$/,
  /^[a-z]+$/,
  /^[{}[\]]+$/,
  /^\s*$/,
  /^[<>=!&|+\-*/%]+$/,
  /^(true|false|null|undefined)$/,
  /^(className|class|id|style|href|src|alt|title|type|name|value|placeholder|role|aria|data|on|ref|key)$/,
  /^(div|span|button|input|select|option|label|form|img|svg|path|rect|circle|g|defs|use|symbol|viewBox|width|height|fill|stroke|d|M|L|C|Q|Z|A)$/,
  /^(rgba?|hsla?|var|calc|url|linear-gradient|radial-gradient|rotate|translate|scale|matrix)/,
  /^(block|inline|flex|grid|absolute|relative|fixed|sticky|hidden|visible|auto|none|inherit|initial|unset)/,
  /^(center|start|end|space-between|space-around|space-evenly|stretch|baseline)/,
  /^(solid|dashed|dotted|double|groove|ridge|inset|outset|none|hidden)/,
  /^(px|em|rem|vh|vw|%|deg|rad|turn|ms|s|Hz|kHz|dpi|dpcm|dppx)/,
  /^(normal|bold|bolder|lighter|italic|oblique|small-caps|overline|line-through|underline)/,
  /^(uppercase|lowercase|capitalize|none|initial|inherit)/,
  /^(left|right|top|bottom|center|justify|auto)/,
  /^(visible|hidden|collapse|auto|scroll)/,
  /^(ltr|rtl|auto)/,
  /^(content-box|border-box)/,
  /^(separate|collapse)/,
  /^(show|hide|toggle|fade|slide)/,
];

function isBlacklisted(text: string): boolean {
  const t = text.trim();
  if (t.length < 3 || t.length > 200) return true;
  if (!/[A-Za-z]/.test(t)) return true;
  if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(t)) return false; // Arabic text - keep
  if (/[A-Z][a-z]/.test(t)) return false; // Looks like a sentence
  return BLACKLIST.some(r => r.test(t));
}

function extractIdAndClass(line: string): { id?: string; class?: string } {
  const idMatch = line.match(/id\s*=\s*["']([^"']+)["']/);
  const classMatch = line.match(/class\s*=\s*["']([^"']+)["']/);
  return {
    id: idMatch?.[1],
    class: classMatch?.[1],
  };
}

function scanDir(dir: string, files: string[] = []): string[] {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    const relPath = relative(ROOT, fullPath);

    // Skip excluded directories
    if (stat.isDirectory()) {
      if (EXCLUDE_DIRS.some(ex => entry === ex || relPath.startsWith(ex + '/'))) continue;
      scanDir(fullPath, files);
    } else if (stat.isFile()) {
      const ext = extname(entry);
      if (EXTENSIONS.includes(ext)) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

function scanFile(filepath: string): TextMatch[] {
  const content = readFileSync(filepath, 'utf-8');
  const lines = content.split('\n');
  const matches: TextMatch[] = [];
  const relPath = relative(ROOT, filepath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Skip comments
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;

    for (const pattern of PATTERNS) {
      let match;
      while ((match = pattern.regex.exec(line)) !== null) {
        const text = pattern.extract(match);
        if (!text || isBlacklisted(text)) continue;

        const { id, class: cls } = extractIdAndClass(line);
        const dataI18n = line.match(/data-i18n\s*=\s*["']([^"']+)["']/)?.[1];
        const dataI18nAttr = line.match(/data-i18n-attr\s*=\s*["']([^"']+)["']/)?.[1];

        matches.push({
          file: relPath,
          line: lineNum,
          type: pattern.type,
          id,
          class: cls,
          'data-i18n': dataI18n,
          'data-i18n-attr': dataI18nAttr,
          text,
          context: line.trim().slice(0, 120),
        });
      }
    }
  }

  return matches;
}

async function main() {
  console.log('🔍 Scanning codebase for translatable text...\n');

  const files = scanDir(ROOT);
  console.log(`📁 Scanning ${files.length} files...\n`);

  const allMatches: TextMatch[] = [];
  for (const file of files) {
    const matches = scanFile(file);
    allMatches.push(...matches);
  }

  // Deduplicate by text + file + line
  const seen = new Set<string>();
  const unique = allMatches.filter(m => {
    const key = `${m.file}:${m.line}:${m.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by file, then line
  unique.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  // Output as CSV for easy import to spreadsheets
  console.log('FILE,LINE,TYPE,ID,CLASS,DATA-I18N,DATA-I18N-ATTR,TEXT,CONTEXT');
  for (const m of unique) {
    const escape = (s: string | undefined) => `"${(s || '').replace(/"/g, '""')}"`;
    console.log([
      escape(m.file),
      m.line,
      escape(m.type),
      escape(m.id),
      escape(m.class),
      escape(m['data-i18n']),
      escape(m['data-i18n-attr']),
      escape(m.text),
      escape(m.context),
    ].join(','));
  }

  console.log(`\n✅ Found ${unique.length} unique translatable strings`);
  console.log(`📄 Output CSV above - redirect to file: bun run scan-i18n > i18n-report.csv`);

  // Also output grouped by file for easier review
  const byFile = new Map<string, TextMatch[]>();
  for (const m of unique) {
    if (!byFile.has(m.file)) byFile.set(m.file, []);
    byFile.get(m.file)!.push(m);
  }

  console.log('\n📋 SUMMARY BY FILE:');
  for (const [file, matches] of byFile) {
    console.log(`  ${file}: ${matches.length} strings`);
  }
}

main().catch(console.error);