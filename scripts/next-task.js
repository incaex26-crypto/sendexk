// Prints the first backlog section whose "status:" is "todo". Exit 1 if none.
// Usage: node scripts/next-task.js [path-to-backlog]
const fs = require('node:fs');

function parseBacklog(text) {
  const parts = text.split(/^(?=## T\d+)/m).filter((p) => /^## T\d+/.test(p));
  return parts.map((body) => {
    const id = body.match(/^## (T\d+)/)[1];
    const status = (body.match(/^status:\s*(\w+)/m) || [])[1] || 'todo';
    const risk = (body.match(/^risk:\s*(\w+)/m) || [])[1] || 'high';
    return { id, status, risk, body: body.trim() };
  });
}

// skip: array of task ids to ignore (tasks already attempted or sitting in an open branch/PR)
function nextTask(text, skip = []) {
  const skipSet = new Set(skip.map((s) => s.trim().toUpperCase()).filter(Boolean));
  return parseBacklog(text).find((t) => t.status === 'todo' && !skipSet.has(t.id)) || null;
}

module.exports = { parseBacklog, nextTask };

if (require.main === module) {
  const file = process.argv[2] || 'docs/BACKLOG.md';
  const skip = (process.env.SKIP || '').split(',');
  const t = nextTask(fs.readFileSync(file, 'utf8'), skip);
  if (!t) { console.error('No todo tasks left.'); process.exit(1); }
  console.log(JSON.stringify({ id: t.id, risk: t.risk }));
  console.log(t.body);
}
