# Handoff: finish BCK-690 — lazy-build release v1.53.0-v2 (short; we are ~90% done)

Repo: `/home/alek/case/projects/my/Backlog.md`, branch `swimlanes` (fork `alple/Backlog.md`, upstream `MrLesk/Backlog.md`).
Everything below is COMMITTED AND PUSHED to origin/swimlanes unless marked TODO.

## What this session did (do not redo)

1. **Root cause of the original `npx github:` EOF is solved.** npm spawns a nested `npm install`
   (pacote `#prepareDir`) for any git-dep package that has `prepare/postinstall/preinstall/install/build/prepack`
   scripts; that nested install inherits `npm_config_global=true` + `npm_config_prefix` and reifies the staging
   tree **into the outer prefix**, colliding with the outer install's own extraction of the same target dir.
   With the 100 MB dist tarball this produced the original "unexpected EOF"; with small tarballs it produced
   missing files / vanishing cwd. Verified by instrumented in-process arborist repro + debug logs (npm 11.19.1).
   Package scripts cannot opt out — every lifecycle hook npm runs for a dep is also in pacote's trigger list
   (a plain `"build"` script triggers it too!).
2. **Alex approved the fix: lazy build (no install scripts at all).**
   - `prepare`/`postinstall` hooks REMOVED from package.json; husky setup is now `bun run setup` (dev clones).
   - The build script was RENAMED `build` → `compile` (a `scripts.build` entry alone re-triggers the nested
     install). AGENTS.md, completions/README.md, .github/copilot-instructions.md updated.
   - `scripts/build-on-demand.cjs` (new): the launcher (scripts/cli.cjs) calls it when `resolveBinaryPath`
     throws BACKLOG_BUILD_MISSING; it runs `bun install --frozen-lockfile` + `bun run compile` with
     `cwd: PACKAGE_ROOT` (the cwd is load-bearing — a missing one broke the build), hard-fails naming bun,
     handles the Windows .exe rename. No silent upstream fallback anywhere (AC#2 intact).
   - `scripts/prepare-install.cjs` and `scripts/build-install.cjs` are DELETED. No marker files needed.
   - package.json `files` ships: scripts/*.cjs, scripts/build.ts, src, tsconfig.json, bun.lock, README, LICENSE
     (~1.2 MB tarball; no dist entries).
   - CI workflows: dead `BACKLOG_SKIP_PREPARE_BUILD` env lines removed.
3. **E2E ALL GREEN** (npm 11.19.1): 3× `npm i -g --prefix X git+file:///tmp/kilo/local-remote.git#swimlanes`
   and 1× real `github:alple/Backlog.md#swimlanes` → clean 7-entry target, bin linked, install 5–14 s;
   first run builds once (~2 s warm cache, ~1 min cold) → `1.53.0-v1`; re-runs instant WITHOUT bun on PATH;
   `npx -y github:alple/Backlog.md#swimlanes --version` → builds once → `1.53.0-v1`; bun-less first run fails
   with the explicit bun message (exit 1).
4. Full suite ran: 2918 pass / 8 skip / **3 fail** — (a) duplicate-task-repair ENAMETOOLONG (known env fail),
   (b) CLI JSON watch launcher-kill (known flaky, passes alone), (c) **cli-guidance test — see TODO#1**.
   Note: a one-off `server-tasks-spa-fallback > retries a branch scan` flake (git commit env error) appeared in
   one filtered re-run — treat as load-flaky, not a regression.

## TODO (in order)

1. **1-line test fix:** `src/test/cli-guidance.test.ts` ~line 88 asserts `backlog task view BACK-123 --plain`
   but the fork's task prefix is `bck`, so the overview prints `BCK-123`. Make the assertion prefix-agnostic
   (read `backlog/config.yml` task_prefix or assert `task view` + `--plain` without the ID). This failure
   predates this session (prefix migration from the upstream sync); after the fix the suite should be at the
   2 known fails. Commit as BCK-690, push origin swimlanes.
2. **Release:** `bun run bump 1.53.0-v2` (writes package.json, commits, tags `v1.53.0-v2`; refuses existing tag).
   Push: `git push origin swimlanes` then **ONLY** `git push origin refs/tags/v1.53.0-v2` — NEVER `--tags`
   (local repo has upstream tags fetched). Watch `gh run list --repo alple/Backlog.md` / `gh run watch`;
   when green, download the linux-x64 artifact, chmod +x, run `./backlog --version` → expect `1.53.0-v2`.
3. **Finalize BCK-690 via the CLI** (`node_modules/.bin/bun src/cli.ts …`; NEVER edit task files directly):
   - Read `backlog instructions task-finalization` first.
   - `task edit BCK-690 --append-notes` with: root cause (nested global install env leak + prepareDir trigger
     list incl. `build`), Alex's approved decision (lazy build, 2026-09-30), the rename build→compile reason,
     E2E evidence (commands above), suite results, and that the TEMP diag commit da7d7cfa is already in history
     (postinstall-diag.cjs deleted since; harmless).
   - Update the final summary (append) to describe the shipped lazy-build route; verify ACs #1/#2/#4/#5 with
     the evidence above; then set the task back to Done if still not Done.
   - Commit the task file (BCK-690 - ...) and push origin swimlanes.
4. **Cleanup:** `git branch -D swimlanes-backup-pre-rebase`; delete scratch: `/tmp/kilo/{packtest,simtest,
   packsim,e2e-prefix*,gh-e2e,lazy-e2e*,lifetest,locktest,local-remote.git,repro-reify*.js,postinstall-diag.cjs,
   pi-debug.log,full-suite.log,freshcache*,lazydbg}` (keep `/tmp/kilo` itself). Keep local `dist/` (gitignored).
5. Delete this handoff file from the repo root once everything above is done.

## Environment facts

- bun is NOT on global PATH: prefix commands with `PATH="/home/alek/case/projects/my/Backlog.md/node_modules/.bin:$PATH"`
  (bun 1.3.14). node 26.10, npm 11.19.1. E2E installs MUST use `--prefix /tmp/...` so the user's global bins
  are never clobbered (another session on this machine uses npx backlog tooling — don't kill npm/node processes).
- Full suite: `bun test --timeout=10000` (~5 min, run in foreground with a long tool timeout; backgrounded
  nohup dies with the tool shell).
- GitHub E2E needs bun on PATH for the first run; bun-less re-runs prove the standalone binary.
- The bump script plays nice with a dirty worktree (pathspec-commits package.json only).
- Fast repro remote (optional): `git clone --bare <repo> /tmp/kilo/local-remote.git` then
  `npm i -g --prefix … "git+file:///tmp/kilo/local-remote.git#swimlanes"`; must `git push /tmp/kilo/local-remote.git swimlanes`
  after each commit. Real `github:` installs work too and are the authoritative test.
