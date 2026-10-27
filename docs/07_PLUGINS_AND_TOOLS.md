# Plugins and external tools

This file records tools that were evaluated but not installed, so the reasoning is not lost.

## Ponytail (claude plugin marketplace — DietrichGebert/ponytail)

**Decision: skipped.**

Publisher: Dietrich Gebert (MIT, 2026). Latest commit signed "OhMyCode <ohmycodedev@gmail.com>" — different name, unverified.

What its hooks do:
- At every session start: injects "write the least code possible" instructions and a map of the repo into Claude's context.
- At every message: reads all saved Claude transcripts (`~/.claude/projects/*/*.jsonl`) to compute cost and token totals, and writes a CSV to `~/.config/ponytail/band/`.
- An optional webhook URL (off by default) would POST task names and prompts to an external server.

Why skipped: reading every saved chat transcript is a wide footprint. The "least code possible" instruction conflicts with this project's tests-first rule. No hidden network calls were found, but the transcript access is enough to skip for now.

## OmniRoute (npm — diegosouzapw/omniroute, v3.8.52)

**Decision: skipped for now.**

Publisher: `diegosouzapw` on npm, last published 2026-10-19. MIT licence. A self-hosted AI-model gateway that lets you switch models when credits run low.

Why skipped: the `postinstall` script (`scripts/build/postinstall.mjs`) writes to `~/.cache/node-gyp/` in the user's home directory, and calls two helper scripts (`sync-env.mjs` and `../postinstall.mjs`) that were not read before this decision was recorded. Until those are read and understood, the install is deferred.

To revisit: read `/tmp/omni/package/scripts/build/sync-env.mjs` and `/tmp/omni/package/scripts/build/postinstall.mjs` (parent), confirm they do not touch tokens or network, then decide.
