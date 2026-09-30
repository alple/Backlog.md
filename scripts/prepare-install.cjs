const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_ROOT = path.join(__dirname, "..");

/**
 * Prepare must never build: npm runs a git dep's prepare inside pacote's
 * staging tree, before its devDependencies are extracted, and the staging
 * tree's output is never packed. The install-time build lives in the
 * postinstall hook (scripts/build-install.cjs), which npm runs in the
 * package extracted from the packed tarball.
 *
 * Prepare's only jobs: set up git hooks in real dev checkouts (husky may
 * not be resolvable in staging trees, so failure is ignored), and mark
 * source trees that are being prepared for packing rather than installed
 * for use. The marker lives under node_modules (never packed, gitignored)
 * and the postinstall hook removes it.
 */
spawnSync("husky", { stdio: "ignore" });

if (fs.existsSync(path.join(PACKAGE_ROOT, "src", "cli.ts"))) {
	fs.mkdirSync(path.join(PACKAGE_ROOT, "node_modules"), { recursive: true });
	fs.writeFileSync(path.join(PACKAGE_ROOT, "node_modules", ".backlog-prepare-marker"), "");
}
