// PreToolUse hook: keep Claude out of files that hold real secrets (CLAUDE.md: no secrets in the
// repo, never print tokens). Covers file tools and shell commands that name such a file.
// Exit code 2 tells Claude Code to block the action and show the message to Claude.
const path = require('node:path');

const SECRET_NAME = [
  /^\.env(\..+)?$/i,                                   // .env, .env.local, .env.production
  /\.(pem|key|p12|pfx|keystore|jks)$/i,                // private keys and certificates
  /^(secrets?|credentials?)(\.(json|ya?ml|txt|env))?$/i, // secrets.json, credentials.yml
  /^id_(rsa|ecdsa|ed25519|dsa)$/i,                     // SSH private keys
  /^service-account.*\.json$/i,                        // cloud service account keys
];
// Templates hold setting names, never real values, so they stay editable.
const TEMPLATE = /\.(example|sample|template)$/i;

function isSecretPath(p) {
  const name = path.basename(String(p || ''));
  return !!name && !TEMPLATE.test(name) && SECRET_NAME.some((re) => re.test(name));
}

function check(toolName, toolInput = {}) {
  let hit;
  if (toolName === 'Bash') hit = (toolInput.command || '').split(/[\s'"`<>|;&=(),]+/).find(isSecretPath);
  else hit = [toolInput.file_path, toolInput.notebook_path, toolInput.path].find(isSecretPath);
  if (!hit) return null;
  return `Blocked: "${hit}" may hold secrets, so Claude must not read or change it. ` +
    'Ask the user to set the value themselves; to show which settings exist, use a .env.example file with no real values. ' +
    'If the name only appeared in message text, write the text to a file and pass it with `git commit -F <file>` or `gh pr create --body-file <file>`.';
}

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (c) => (raw += c)).on('end', () => {
    const input = JSON.parse(raw || '{}');
    const reason = check(input.tool_name, input.tool_input);
    if (reason) { process.stderr.write(reason + '\n'); process.exit(2); }
  });
}
module.exports = { check, isSecretPath };
