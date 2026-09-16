---
id: BACK-690
title: >-
  Distribution: make the fork runnable outside this machine (npx github /
  releases) - decision pending
status: In Progress
assignee:
  - '@kilo'
created_date: '2026-09-16 10:34'
updated_date: '2026-09-16 12:05'
labels: []
dependencies: []
ordinal: 321000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decision ticket spun off 2026-09-16 after investigating how to run the fork (branch swimlanes, features BACK-687/688/689) outside this machine. Alex asked for npx-from-repository and npx github:<user>/<repository> support. Verified facts: (1) bun run build produces a working standalone executable dist/backlog (v1.52.0, ~102 MB, current platform) - running it directly or via PATH symlink works today; (2) npm/git installs pack only 6 files / 28.4 kB (package.json + scripts/*.cjs) - src/ is never shipped and nothing compiles on install (prepare = husky only); (3) scripts/cli.cjs + scripts/resolveBinary.cjs resolve the runtime binary ONLY from the npm-registry optionalDependencies backlog.md-<platform>-<arch>: * - therefore npx github:alple/Backlog.md (and npm i -g github:...) runs UPSTREAM's published binary (1.47.1 observed), never the fork's src, no matter which branch/ref is given; (4) committing the 102 MB binary is impossible (GitHub 100 MB file limit); (5) verified local workaround: overwrite node_modules/backlog.md-linux-x64/backlog with the fork build, after which npx -y . and npx -y <repo-path> run the fork - but a later bun install restores upstream's binary. Goal: choose and implement one distribution route so other machines run fork code, never the upstream registry binary. Alex's recorded prior lean: option 2 (build-on-install) with a hard failure when bun is absent - explicitly NO silent fallback to the upstream package - and noted 'we can do github releases' as acceptable; final choice deferred to the next session. IMPORTANT: re-ask the decision question (see comment) before implementing anything.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The chosen route is implemented so that installing/running the fork via the chosen channel executes fork code and never the upstream registry binary
- [ ] #2 If the chosen route requires bun at install time, a missing bun fails with an explicit error naming bun as required (per Alex's amendment); no silent fallback to the upstream package in any path
- [ ] #3 The immediate local workflow is documented in the fork README or task notes: bun install && bun run build, then dist/backlog on PATH or symlink; node_modules overwrite trick documented as a temporary hack that bun install reverts
- [ ] #4 Existing-file edits stay minimal and additive where possible (package.json and scripts/resolveBinary.cjs or scripts/cli.cjs are the allowed touch points for options 2-3; CI workflow file for option 1)
- [ ] #5 bunx tsc --noEmit passes; biome passes on touched files; scoped tests pass
- [ ] #6 Fork version bumping: bun run bump bumps package.json, commits it, and tags v<X> per the scheme (start v0.1); release workflow triggers on v* tags
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. package.json: change prepare to "husky && node scripts/prepare-install.cjs" (husky behavior preserved; build hook only runs where prepare runs - git installs like npx github:, local dev installs; registry installs never run prepare).
2. New scripts/prepare-install.cjs (install-time build hook): (a) exit 0 if src/cli.ts is absent (registry-style context, nothing to build); (b) exit 0 if dist/backlog(.exe) already exists (keeps repeated local bun install fast; delete dist to force rebuild); (c) check bun via spawnSync(bun --version) - if absent, print explicit error naming bun (with bun.sh install hint and Releases pointer) and exit 1 = HARD FAIL, no fallback; (d) run bun run build with inherited stdio; fail the install if the build fails.
3. scripts/resolveBinary.cjs: when src/cli.ts exists next to the package root (git checkout / npx github: context), resolve ONLY <root>/dist/backlog(.exe); never fall through to the upstream registry platform packages (Alex's no-silent-fallback amendment). If dist binary is missing, throw an error with a distinct code (e.g. BACKLOG_BUILD_MISSING). Registry installs (no src/) keep today's behavior exactly.
4. scripts/cli.cjs: on BACKLOG_BUILD_MISSING, print a short error: fork source detected but dist/backlog missing - run bun install && bun run build, or grab a prebuilt binary from GitHub Releases. Existing printInstallHelp path unchanged for registry mode.
5. Trim .github/workflows/release.yml to: tag trigger (v*.*.*), the 6-platform build matrix job (unchanged), and the github-release job (softprops action). Remove npm-publish, publish-binaries, verify-platform-packages, install-sanity, sync-version jobs and the id-token permission (npm-only). Result: Alex tags any chosen commit -> binaries land on a GitHub Release; free public-repo Actions/Releases, no secrets needed.
6. README: short fork section - npx github:alple/Backlog.md#swimlanes (needs bun, hard-fails without), releases channel (tag -> download binary -> PATH/symlink), local bun install && bun run build -> dist/backlog, node_modules overwrite trick documented as temporary hack reverted by bun install. Note default branch is main until swimlanes merges.
7. Tests: extend src/test/resolveBinary.test.ts - source-checkout mode prefers dist, never falls back to optionalDeps, coded error when dist missing; registry-mode cases unchanged.
8. Verify: bunx tsc --noEmit; biome on touched files; scoped tests. E2E proxy for the github install in /tmp: npm install <repo-copy-without-node_modules> (runs prepare like a git dep) -> expect dist built and fork version; re-run with bun hidden from PATH -> expect hard failure naming bun. Release workflow itself gets validated on the first real tag push.

9. Fork version scheme (added by Alex): new scripts/bump-version.ts + package.json alias bun run bump <major|minor|patch|x.y[.z]> - writes x.y.z to package.json, commits ONLY package.json (pathspec commit, plays nice with dirty worktree), creates annotated tag vX.Y (trailing .0 stripped, e.g. 0.1.0 -> v0.1); refuses if the tag already exists; never pushes - prints the push command (pushing the tag is what triggers the release). Fork starts at 0.1 via explicit first run: bun run bump 0.1.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
E2E verification (npm 11.19.1, local git+file remote as github: proxy): (1) git install with scripts allowed -> prepare built the binary in npm's staging clone, packed via new files entries, installed package runs fork code (task list responds; upstream binary absent). (2) dist-less install -> CLI fails closed with allow-scripts/Releases instructions, never touches upstream packages (BACKLOG_BUILD_MISSING). (3) Direct prepare without bun -> hard failure naming bun, exit 1 (AC#2). Nuance discovered: npm git installs also install devDependencies, and npm prepends node_modules/.bin to lifecycle PATH, so bun can be self-provisioned during installs; the hard-fail manifests when neither user PATH nor devDeps provide bun. Also: npm 11.19 blocks dependency lifecycle scripts by default (allowScripts/ npx --allow-scripts=backlog.md needed) - documented in README. Full test suite: 2911 pass, 8 skip; 1 consistent pre-existing failure (duplicate-task-repair ENAMETOOLONG - reproduces without these changes, environmental NAME_MAX issue, unrelated); 2 flaky PTY/server tests passed on re-run.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @kilo
created: 2026-09-16 10:34
---
OPEN QUESTION FOR ALEX (answer at the start of the next session, before implementing): Which distribution route should we build? Option 1 - GitHub Releases artifacts: enable/adapt the fork's inherited release CI to attach compiled dist/backlog per platform on push/tag; machines download once and put it on PATH; zero code changes, no npm semantics, but no npx. Option 2 - Build-on-install hook: package.json prepare/postinstall compiles via bun and the resolver prefers dist/backlog, with a HARD FAILURE naming bun when bun is missing (Alex's amendment: no silent upstream fallback); makes npx github:alple/Backlog.md compile and run the fork on machines with bun; touches package.json + scripts/resolveBinary.cjs (and the cli.cjs error path). Option 3 - Publish fork platform packages to npm under a namespace (e.g. @alple/backlog.md-linux-x64) and repoint optionalDependencies + resolveBinary.cjs candidate names; full upstream-style pipeline, real npx-github support everywhere; needs npm publishing + CI work. Options 1 and 2 combine well. Prior lean: option 2 with the no-fallback amendment; releases mentioned as acceptable.
---

author: @kilo
created: 2026-09-16 10:35
---
Verification commands recorded 2026-09-16 (all executed on this machine): bun run build; ./dist/backlog --version -> 1.52.0; npm pack --dry-run -> 6 files 28.4 kB (package.json, scripts/cli.cjs, scripts/postuninstall.cjs, scripts/resolveBinary.cjs); node_modules/backlog.md-linux-x64/backlog --version -> 1.47.1 (upstream); after cp dist/backlog node_modules/backlog.md-linux-x64/backlog: npx -y . --version and npx -y /abs/path --version -> 1.52.0.
---
<!-- COMMENTS:END -->
