const { spawnSync } = require("node:child_process");

/**
 * Prepare must never build: npm runs a git dep's prepare inside pacote's
 * staging clone, before its devDependencies are extracted, and the staging
 * clone's output is never packed. The install-time build lives in the
 * postinstall hook (scripts/build-install.cjs), which npm runs in the
 * package extracted from the packed tarball.
 *
 * Prepare's only job is setting up git hooks in real dev checkouts; in
 * staging clones husky may not be resolvable, and that failure is fine to
 * ignore.
 */
spawnSync("husky", { stdio: "ignore" });
