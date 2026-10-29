// Scans public/*.html for banned on-screen words from docs/DESIGN.md.
// Code comments and server-only code are exempt; only visible text content counts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Words that must never appear on screen (wording rules from docs/DESIGN.md).
const BANNED = [
  { word: 'demo',       re: /\bdemo\b/i },
  { word: 'starter',    re: /\bstarter\b/i },
  { word: 'escrow',     re: /\bescrow\b/i },
  { word: 'hotspot',    re: /\bhotspot\b/i },
  { word: 'dispatch',   re: /\bdispatch\b/i },
  { word: 'ledger',     re: /\bledger\b/i },
  { word: 'payout',     re: /\bpayout\b/i },
  { word: 'firm price', re: /firm price/i },
];

// Strip script blocks, HTML comments, style attributes, and tags to extract visible text.
function extractVisibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/style="[^"]*"/gi, '')
    .replace(/href="[^"]*"/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ');
}

const htmlFiles = fs.readdirSync(PUBLIC_DIR)
  .filter(f => f.endsWith('.html'))
  .map(f => ({ name: f, fullPath: path.join(PUBLIC_DIR, f) }));

assert.ok(htmlFiles.length > 0, 'No HTML files found in public/');

for (const file of htmlFiles) {
  const raw = fs.readFileSync(file.fullPath, 'utf8');
  const visible = extractVisibleText(raw);

  for (const banned of BANNED) {
    test(`${file.name} must not show "${banned.word}"`, () => {
      const m = banned.re.exec(visible);
      if (m) {
        const excerpt = visible.slice(Math.max(0, m.index - 30), m.index + 60).replace(/\s+/g, ' ').trim();
        assert.fail(`"${banned.word}" found in ${file.name}: …${excerpt}…`);
      }
    });
  }
}
