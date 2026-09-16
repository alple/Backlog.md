const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_ROOT = path.join(__dirname, "..");
const SOURCE_ENTRY = path.join(PACKAGE_ROOT, "src", "cli.ts");

/**
 * True when this checkout contains source (git installs like `npx github:...`,
 * local dev clones). The npm registry tarball ships only the launcher scripts,
 * so installs from the registry never see src/ and must not try to build.
 */
function isSourceCheckout() {
	return fs.existsSync(SOURCE_ENTRY);
}

function distBinaryPath(platform = process.platform) {
	const binary = `backlog${platform === "win32" ? ".exe" : ""}`;
	return path.join(PACKAGE_ROOT, "dist", binary);
}

function hasDistBinary(platform = process.platform) {
	if (fs.existsSync(distBinaryPath(platform))) return true;
	// Bun compile may emit an extensionless file on Windows; both spellings count.
	return platform === "win32" && fs.existsSync(path.join(PACKAGE_ROOT, "dist", "backlog"));
}

function fail(message) {
	console.error(`backlog.md: ${message}`);
	process.exit(1);
}

function main() {
	// Escape hatch for workflows that build the binary themselves (release CI).
	if (process.env.BACKLOG_SKIP_PREPARE_BUILD) return;
	// Registry-style context: nothing to build, the platform packages ship the binary.
	if (!isSourceCheckout()) return;
	// Already built (e.g. repeated local `bun install`): keep installs fast.
	if (hasDistBinary()) return;

	const bunCheck = spawnSync("bun", ["--version"], { encoding: "utf8" });
	if (bunCheck.error || bunCheck.status !== 0) {
		console.error("backlog.md: installing from source requires bun to build the CLI binary.");
		console.error("Install bun first (https://bun.sh), then re-run the install.");
		console.error("Alternatively, download a prebuilt binary from the GitHub Releases page.");
		process.exit(1);
	}

	console.log("backlog.md: building the CLI from source with bun (one-time)...");
	const build = spawnSync("bun", ["run", "build"], { stdio: "inherit" });
	if (build.error || build.status !== 0) {
		fail("the source build failed; fix the error above and re-run the install.");
	}

	// Windows needs the .exe extension for the binary to be spawnable.
	if (process.platform === "win32" && !fs.existsSync(distBinaryPath())) {
		const extensionless = path.join(PACKAGE_ROOT, "dist", "backlog");
		if (fs.existsSync(extensionless)) {
			fs.renameSync(extensionless, distBinaryPath());
		}
	}
}

if (require.main === module) main();

module.exports = { isSourceCheckout, hasDistBinary };
