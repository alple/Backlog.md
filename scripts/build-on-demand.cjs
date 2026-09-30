const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_ROOT = path.join(__dirname, "..");
const SOURCE_ENTRY = path.join(PACKAGE_ROOT, "src", "cli.ts");

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

/**
 * Build the CLI binary on demand when a run finds no dist build. Installs ship
 * the source without any lifecycle scripts (npm spawns a nested git-install
 * reify for packages with scripts, which corrupts the install target), so the
 * one-time build happens here instead: on the first CLI run. Exits the process
 * with an explicit bun requirement when bun is absent; returns true when a
 * binary is present after the call.
 */
function buildOnDemand() {
	if (hasDistBinary()) return true;
	// Stripped install without source: nothing to build; the caller reports.
	if (!fs.existsSync(SOURCE_ENTRY)) return false;

	const bunCheck = spawnSync("bun", ["--version"], { encoding: "utf8" });
	if (bunCheck.error || bunCheck.status !== 0) {
		console.error("backlog.md: this install has no prebuilt binary and building it requires bun.");
		console.error("Install bun first (https://bun.sh), then re-run the command.");
		console.error("Alternatively, download a prebuilt binary from the GitHub Releases page.");
		process.exit(1);
	}

	// npm installs a git dep's package without its devDependencies, so the
	// build's imports (bun-plugin-tailwind etc.) are missing until this runs.
	console.log("backlog.md: no prebuilt binary found; building it from source with bun (one-time)...");
	console.log("backlog.md: installing dependencies with bun...");
	const install = spawnSync("bun", ["install", "--frozen-lockfile"], {
		stdio: "inherit",
		cwd: PACKAGE_ROOT,
	});
	if (install.error || install.status !== 0) {
		fail("dependency installation with bun failed; fix the error above and re-run the command.");
	}

	console.log("backlog.md: building the CLI from source with bun (one-time)...");
	// The script is named "compile" on purpose: a scripts entry named "build"
	// makes npm spawn its nested git-install reify, which corrupts installs.
	const build = spawnSync("bun", ["run", "compile"], { stdio: "inherit", cwd: PACKAGE_ROOT });
	if (build.error || build.status !== 0) {
		fail("the source build failed; fix the error above and re-run the command.");
	}

	// Windows needs the .exe extension for the binary to be spawnable.
	if (process.platform === "win32" && !fs.existsSync(distBinaryPath())) {
		const extensionless = path.join(PACKAGE_ROOT, "dist", "backlog");
		if (fs.existsSync(extensionless)) {
			fs.renameSync(extensionless, distBinaryPath());
		}
	}

	return hasDistBinary();
}

module.exports = { buildOnDemand, hasDistBinary };

if (require.main === module) {
	if (!buildOnDemand()) {
		fail("no prebuilt binary was found and there is no source to build one from.");
	}
}
