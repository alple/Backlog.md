const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_ROOT = path.join(__dirname, "..");

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
	// Guard against re-entry if a bun version ever runs the root postinstall
	// from the `bun install` below.
	if (process.env.BACKLOG_BUILD_NESTED) return;
	// Git clones (dev checkouts and npm's git-install staging clones) must not
	// build here: dev builds are documented as `bun run build`, and the
	// staging clone's output is never packed. The build belongs to the package
	// extracted from the packed tarball, which has no .git.
	if (fs.existsSync(path.join(PACKAGE_ROOT, ".git"))) return;
	// Stripped package without source: nothing to build; the runtime resolver
	// fails closed with instructions if dist/ is also missing.
	if (!fs.existsSync(path.join(PACKAGE_ROOT, "src", "cli.ts"))) return;
	// Already built (repeated installs): keep installs fast.
	if (hasDistBinary()) return;

	const bunCheck = spawnSync("bun", ["--version"], { encoding: "utf8" });
	if (bunCheck.error || bunCheck.status !== 0) {
		console.error("backlog.md: installing from source requires bun to build the CLI binary.");
		console.error("Install bun first (https://bun.sh), then re-run the install.");
		console.error("Alternatively, download a prebuilt binary from the GitHub Releases page.");
		process.exit(1);
	}

	// npm installs a git dep's package without its devDependencies, so the
	// build's imports (bun-plugin-tailwind etc.) are missing until this runs.
	// bun install is idempotent; BACKLOG_BUILD_NESTED keeps a re-entrant root
	// postinstall from recursing.
	console.log("backlog.md: installing build dependencies with bun...");
	const install = spawnSync("bun", ["install", "--frozen-lockfile"], {
		stdio: "inherit",
		cwd: PACKAGE_ROOT,
		env: { ...process.env, BACKLOG_BUILD_NESTED: "1" },
	});
	if (install.error || install.status !== 0) {
		fail("dependency installation with bun failed; fix the error above and re-run the install.");
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

main();
