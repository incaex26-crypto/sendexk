# Start here: set-up guide for a beginner

Goal of this guide: by the end you have (1) your own GitHub repository, (2) Claude working on it from claude.ai/code, (3) a plan for maps. **We only plan now. Nothing here costs money except your Claude plan.**
Do one step, then tell Claude "done" or paste what you see. Do not skip ahead.

## Words you will hear
- **Repository (repo):** a folder of your project kept on GitHub, with its full history.
- **Commit:** a saved snapshot with a note. **Branch:** a safe copy where Claude works. **Pull request (PR):** "please review my branch and merge it into main".
- **Main:** the official, working version. Claude never works on it directly.

## Step 1. Accounts (15 minutes)
1. Make a free GitHub account at github.com. Turn on two-factor sign-in.
2. Check your Claude plan. Cloud coding sessions work on Pro, Max or Team plans (not the free plan).
3. Write down: your GitHub username. Do not share passwords or tokens with anyone, including Claude.

## Step 2. Create the empty repository (5 minutes)
1. On GitHub press **New repository**.
2. Name: `sendexk` (or `sendexk`; either works, you can rename later) (placeholder, you can rename later). Choose **Private**. Tick **Add a README**. Create.
3. A private repo means only you can see it. Use private while the idea is still yours alone.

## Step 3. Put the project files in (pick ONE path)
**Path A, no installs (easiest to start):**
1. Unzip `dispatch-platform.zip` on your computer.
2. In your new repo press **Add file > Upload files**. Drag the **contents** of the folder in, including the hidden folders `.claude` and `.github` if your computer shows them.
3. Press **Commit changes**.
4. If `.claude` or `.github` did not upload, do Path B instead.

**Path B, GitHub Desktop (best long-term, still point-and-click):**
1. Install GitHub Desktop (desktop.github.com) and sign in.
2. File > Add local repository: choose the unzipped folder. Choose "create a repository" if asked.
3. Press **Publish repository**, keep **Private** ticked.

## Working on a locked-down work laptop (what Dumisani is doing)
If your laptop will not let you install Node or Python, use **GitHub Codespaces**: a cloud computer you open from the repo page (green **Code** button, then **Codespaces**, then **Create codespace**). It already has Node and Git. VS Code on your laptop (or in the browser) connects to it. Nothing is installed on the laptop except VS Code extensions. Check your employer's rules before using a work laptop for a personal business project.
Steps in order, one at a time: create repo > open Codespace > check `node --version` > upload this zip into the Codespace > unzip > `npm test` > install Claude Code extension and sign in > plugins one by one.

## Step 4. Connect Claude to GitHub (10 minutes)
1. Go to claude.ai/code and sign in.
2. Press **Sign in with GitHub** and approve.
3. Install the **Claude GitHub App** on your account and give it access to the `sendexk` repository only. (Needed for private repos. It also lets Claude fix failing checks on pull requests later.)
4. Accept the **Default** environment Claude creates for you.

## Step 5. Your first Claude session (10 minutes)
1. At claude.ai/code pick the repository `sendexk`.
2. Choose **Plan** mode (Claude proposes, you approve).
3. Type: `Run /pickup. Read CLAUDE.md and docs/PROGRESS.md, run the tests, and tell me in plain words where we are.`
4. Claude should report that 35 tests pass. If not, paste what it says to me.
5. Each task you give gets its own branch. When it is done, press **Create PR**, read the summary, then **Merge** on GitHub.

## Step 6. Add the helper plugins (15 minutes, see `07_PLUGINS_AND_TOOLS.md`)
Plugins do not load inside cloud sessions, so install them on your own computer later (Claude Code desktop app or terminal). For now only read that file and pick which you want.

## Step 7. Maps (planning only, see `05_MAPS_GUIDE.md`)
Read it once. The agent does the downloading in Phase 2. Your job is to decide the service area and tell Claude.

## Step 8. Working rhythm
- One task at a time, in plain words: "Add phone-login for drivers" not "improve the app".
- Always start with `/pickup` and end with `/handoff`. This is what lets another agent continue if Claude runs out.
- Merge only when the tests are green (a green tick on the pull request).

## If you get stuck
Paste the exact message you see. Say which step you are on. That is enough.
