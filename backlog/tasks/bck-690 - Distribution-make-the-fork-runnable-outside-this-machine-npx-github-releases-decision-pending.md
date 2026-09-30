---
id: BCK-690
title: >-
  Distribution: make the fork runnable outside this machine (npx github /
  releases) - decision pending
status: Done
assignee:
  - '@kilo'
created_date: '2026-09-16 10:34'
updated_date: '2026-09-30 18:41'
labels: []
dependencies: []
ordinal: 321000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decision ticket spun off 2026-09-16 after investigating how to run the fork (branch swimlanes, features BCK-687/688/689) outside this machine. Alex asked for npx-from-repository and npx github:<user>/<repository> support. Verified facts: (1) bun run build produces a working standalone executable dist/backlog (v1.52.0, ~102 MB, current platform) - running it directly or via PATH symlink works today; (2) npm/git installs pack only 6 files / 28.4 kB (package.json + scripts/*.cjs) - src/ is never shipped and nothing compiles on install (prepare = husky only); (3) scripts/cli.cjs + scripts/resolveBinary.cjs resolve the runtime binary ONLY from the npm-registry optionalDependencies backlog.md-<platform>-<arch>: * - therefore npx github:alple/Backlog.md (and npm i -g github:...) runs UPSTREAM's published binary (1.47.1 observed), never the fork's src, no matter which branch/ref is given; (4) committing the 102 MB binary is impossible (GitHub 100 MB file limit); (5) verified local workaround: overwrite node_modules/backlog.md-linux-x64/backlog with the fork build, after which npx -y . and npx -y <repo-path> run the fork - but a later bun install restores upstream's binary. Goal: choose and implement one distribution route so other machines run fork code, never the upstream registry binary. Alex's recorded prior lean: option 2 (build-on-install) with a hard failure when bun is absent - explicitly NO silent fallback to the upstream package - and noted 'we can do github releases' as acceptable; final choice deferred to the next session. IMPORTANT: re-ask the decision question (see comment) before implementing anything.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The chosen route is implemented so that installing/running the fork via the chosen channel executes fork code and never the upstream registry binary
- [x] #2 If the chosen route requires bun at install time, a missing bun fails with an explicit error naming bun as required (per Alex's amendment); no silent fallback to the upstream package in any path
- [x] #3 The immediate local workflow is documented in the fork README or task notes: bun install && bun run build, then dist/backlog on PATH or symlink; node_modules overwrite trick documented as a temporary hack that bun install reverts
- [x] #4 Existing-file edits stay minimal and additive where possible (package.json and scripts/resolveBinary.cjs or scripts/cli.cjs are the allowed touch points for options 2-3; CI workflow file for option 1)
- [x] #5 bunx tsc --noEmit passes; biome passes on touched files; scoped tests pass
- [x] #6 Fork version bumping: bun run bump bumps package.json, commits it, and tags v<X> per the scheme (start v0.1); release workflow triggers on v* tags
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
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

Upstream sync 2026-09-30: rebased swimlanes onto MrLesk/Backlog.md main (69e7b153, upstream v1.53.0 + 11 unreleased commits; 18 upstream commits absorbed, conflicts only in package.json version line and src/test/cli-launcher.test.ts). Fork task IDs moved out of the upstream ID space: task_prefix is now bck (config.yml) and the four fork tasks are bck-687..bck-690, so upstream keeps minting back-* IDs with no duplicate-ID collisions on future syncs. Fork version scheme replaced: versions are x.y.z-vN encoding the upstream base plus a fork iteration (bump accepts explicit versions only, tags are verbatim); first release under the new scheme is 1.53.0-v1.

2026-09-30 session 2 status: rebase to upstream v1.53.0+11 done and pushed; BCK prefix migration done; version scheme x.y.z-vN done; release v1.53.0-v1 published and linux-x64 binary verified (reports 1.53.0-v1). Two git-install bugs fixed on origin/swimlanes after the tag: 60e57671 (prepare now runs bun install --frozen-lockfile before building; npm runs git-dep prepare before devDeps extract) and ca2ea6c1 (symlinked src/guidelines/project-manager-backlog.md replaced with a real file; pacote tar filter drops all *Link entries from github tarballs). Clean clone + prepare verified 1.53.0-v1. OPEN: npm install -g github:alple/Backlog.md#swimlanes fails with tar EOF (code EOF, syscall read, path <staging-clone>/dist/backlog) during outer reify:unpack even though the inner staging prepare succeeds; pack+extract verified OK in isolation. Next: fix the live tar.c->tar.x pipe path (likely move the build from prepare-in-staging to postinstall-in-installed-package so dist/backlog never travels through the packed git tarball), E2E again, then release 1.53.0-v2. Full handoff: /tmp/kilo/HANDOFF-npx-install-EOF.md

2026-09-30 session 3: original github: EOF root-caused and fixed with the approved lazy-build route. Root cause: npm (pacote prepareDir) spawns a nested git-install reify for any git-dep package with prepare/postinstall/preinstall/install/build/prepack scripts; the nested install inherits npm_config_global+npm_config_prefix and reifies the staging tree into the outer prefix, colliding with the outer install's extraction of the same target (with the 100MB dist tarball this was the unexpected EOF; verified via instrumented in-process arborist repro + debug logs, npm 11.19.1). Package scripts cannot opt out (a plain scripts.build entry triggers it too). Decision approved by Alex 2026-09-30: no lifecycle scripts; prepare/postinstall removed (husky now via bun run setup); build script renamed build->compile because scripts.build alone re-triggers the nested install; launcher (scripts/cli.cjs) builds on demand via scripts/build-on-demand.cjs (bun install --frozen-lockfile + bun run compile, cwd pinned to the package root, hard fail naming bun, no upstream fallback). Tarball ships src + scripts/build.ts + tsconfig.json + bun.lock (~1.2MB). E2E green: 3x git+file installs + real github:alple/Backlog.md#swimlanes install (clean target, bin linked, 5-14s), first run builds once then reports 1.53.0-v1, re-runs instant WITHOUT bun on PATH, npx -y github:alple/Backlog.md#swimlanes --version builds once and reports 1.53.0-v1, bun-less first run fails with the explicit bun message. Suite: 2918 pass / 8 skip / 3 fail (ENAMETOOLONG env fail; CLI JSON watch flake; cli-guidance BACK-123 vs BCK-123 prefix assertion - pre-existing from the prefix migration, fix is a 1-line test update). Remaining: guidance test fix, release 1.53.0-v2, task finalization, cleanup. Handoff in repo root: HANDOFF-BCK-690-lazy-build-release.md

2026-09-30 session 4 (finalization): remaining handoff items closed. (1) cli-guidance test fixed: the guide-rendering test hardcoded the upstream BACK-123 example ID; guidance text renders the configured task prefix (bck since the upstream sync), so all ID assertions were made prefix-agnostic (regex /[A-Z]+-123/, commit cb151630) - file now 16/16 pass. (2) Release v1.53.0-v2 shipped: bun run bump 1.53.0-v2 (commit cb2d6fed, tag v1.53.0-v2), branch + tag pushed individually (never --tags), release workflow run 36759754460 green (6 platform builds + github-release), downloaded backlog-bun-linux-x64-baseline artifact runs and reports 1.53.0-v2. (3) TEMP diag commit da7d7cfa (postinstall-diag.cjs, local-remote-only diagnostic) is already in history; the diag script was deleted in 3fb28a87 and is not shipped - harmless. Note: the shipped distribution route is lazy build (no install lifecycle scripts), superseding the build-at-install prepare hook described in earlier notes.
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

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented the combined distribution route for the fork. (1) Build-on-install: prepare hook (husky && scripts/prepare-install.cjs) builds dist/backlog with bun on git installs (npx/npm i github:alple/Backlog.md#swimlanes); hard failure naming bun when bun is absent; npm's new allow-scripts gate documented in README. (2) No silent fallback: optionalDependencies removed; the resolver uses only the local dist build and fails closed (BACKLOG_BUILD_MISSING) with fix instructions otherwise - it can never execute the upstream registry binary; registry-mode code removed. (3) Releases: release.yml trimmed to the 6-platform build matrix + GitHub release job, triggered by v* tags on any commit Alex chooses. (4) Fork version scheme: bun run bump <major|minor|patch|x.y[.z]> writes the version, commits, and tags (0.1.0 -> v0.1); release builds report the tag via BACKLOG_BUILD_VERSION. First release published: v0.1 with all 6 platform binaries, workflow run 35094301136 green; downloaded linux-x64 artifact runs and reports version 0.1. Verified with: bunx tsc --noEmit, biome (434 files), scoped tests 28/28, full suite 2911 pass / 1 pre-existing environmental failure (duplicate-task-repair ENAMETOOLONG, reproduces without these changes), and E2E git-install simulations covering the happy path, blocked-scripts fail-closed, and no-bun hard failure.

Final route as shipped (2026-09-30, v1.53.0-v2): lazy build. npm's pacote spawns a nested install for any git-dep package with lifecycle scripts (prepare/postinstall/preinstall/install/build/prepack - a plain build script triggers it too), and that nested install reifies into the outer global prefix and collides with the outer extraction (the original unexpected EOF). The shipped fix therefore ships NO lifecycle scripts at all: prepare/postinstall removed (husky via bun run setup for dev clones), build renamed compile (scripts.build alone re-triggers the nested install), and scripts/cli.cjs builds on demand through scripts/build-on-demand.cjs (bun install --frozen-lockfile + bun run compile, cwd pinned to the package root, hard failure naming bun, no upstream fallback anywhere). The npm tarball (~1.2 MB) ships src + scripts/build.ts + tsconfig.json + bun.lock. AC verification: #1 - E2E green on npm 11.19.1: 3x git+file installs + a real github:alple/Backlog.md#swimlanes install (clean target, bin linked, 5-14 s), first run builds once and reports the fork version, re-runs instant without bun on PATH; the upstream registry binary is never in the dependency graph (optionalDependencies gone). #2 - bun-less first run fails with an explicit message naming bun, exit 1, no fallback path exists in the code. #4 - touch points stayed within the allowed set plus the approved deviation: package.json, scripts/cli.cjs, new scripts/build-on-demand.cjs, CI env cleanup, README/completions/copilot docs for the rename. #5 - bunx tsc --noEmit clean, biome clean, full suite 2918 pass / 8 skip / 2 known-fail (ENAMETOOLONG env fail, CLI JSON watch flake) after the cli-guidance prefix fix. #6 - release channel proven: v1.53.0-v2 tag -> run 36759754460 green -> linux-x64 artifact reports 1.53.0-v2. #3 remains satisfied by the README lazy-build section. Residual risk: first run on a machine without bun fails closed by design; bun is the only build prerequisite.
<!-- SECTION:FINAL_SUMMARY:END -->
