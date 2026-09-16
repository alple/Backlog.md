const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_ROOT = path.join(__dirname, "..");

function getSourceBinaryPath(platform = process.platform, root = PACKAGE_ROOT) {
	const distDir = path.join(root, "dist");
	const binary = `backlog${platform === "win32" ? ".exe" : ""}`;
	// On Windows prefer the .exe spelling (required for spawn), then a bare
	// extensionless build as a safety net.
	const candidates = platform === "win32" ? [binary, "backlog"] : [binary];
	for (const name of candidates) {
		const candidate = path.join(distDir, name);
		if (fs.existsSync(candidate)) return candidate;
	}
	return null;
}

function getPackageName(platform = process.platform, arch = process.arch) {
	return `backlog.md-${platform === "win32" ? "windows" : platform}-${arch}`;
}

/**
 * Package names to try, in order. On macOS both darwin variants are candidates
 * because the OS can run whichever one is actually installed (natively or via
 * Rosetta 2). A Rosetta-translated process reports x64 while the hardware is
 * arm64, so under Rosetta the arm64 (hardware) package comes first.
 */
function getCandidatePackageNames(
	platform = process.platform,
	arch = process.arch,
	rosetta = isRosettaTranslated(platform),
) {
	if (platform !== "darwin" || (arch !== "arm64" && arch !== "x64")) {
		return [getPackageName(platform, arch)];
	}
	const primary = rosetta ? "arm64" : arch;
	return [getPackageName(platform, primary), getPackageName(platform, primary === "arm64" ? "x64" : "arm64")];
}

/**
 * True when the current process runs under Rosetta 2 translation on macOS.
 * stdio ignores the child's stdin and stderr so restricted shells, where sysctl
 * is not permitted, cannot leak "Operation not permitted" into our own stderr.
 */
function isRosettaTranslated(platform = process.platform, exec = execFileSync) {
	if (platform !== "darwin") return false;
	try {
		return (
			exec("/usr/sbin/sysctl", ["-in", "sysctl.proc_translated"], {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			}).trim() === "1"
		);
	} catch {
		return false;
	}
}

/**
 * The fork never resolves the npm registry platform packages: a source
 * checkout or a git install must only ever run a fork build. Falling back to
 * the registry here would silently execute upstream code.
 */
function resolveBinaryPath(platform = process.platform, root = PACKAGE_ROOT) {
	const built = getSourceBinaryPath(platform, root);
	if (built) return built;
	const error = new Error(
		fs.existsSync(path.join(root, "src", "cli.ts"))
			? "This is a source checkout of Backlog.md but no built binary was found in dist/. Build it with: bun install && bun run build"
			: "This Backlog.md install has no built binary. The install ran with lifecycle scripts skipped (npm blocks install scripts by default). Reinstall allowing scripts, e.g.: npm i -g --allow-scripts=backlog.md github:alple/Backlog.md#swimlanes",
	);
	error.code = "BACKLOG_BUILD_MISSING";
	throw error;
}

module.exports = {
	getPackageName,
	getCandidatePackageNames,
	getSourceBinaryPath,
	isRosettaTranslated,
	resolveBinaryPath,
};
