import { afterAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCandidatePackageNames } = require("../../scripts/resolveBinary.cjs");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getSignalExitCode, isArchitectureSignal, isBinaryInstallError } = require("../../scripts/cli.cjs");

const isWindows = process.platform === "win32";
const scriptsDir = join(import.meta.dir, "..", "..", "scripts");
const tempDirs: string[] = [];

/** Copy the launcher scripts into a package-layout temp dir with an optional fixture platform binary. */
async function createLauncherDir(binaryContent?: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "backlog-launcher-"));
	tempDirs.push(dir);
	// Mirror the real package layout: launcher scripts live in scripts/, one level below the package root.
	await mkdir(join(dir, "scripts"), { recursive: true });
	await cp(join(scriptsDir, "cli.cjs"), join(dir, "scripts", "cli.cjs"));
	await cp(join(scriptsDir, "resolveBinary.cjs"), join(dir, "scripts", "resolveBinary.cjs"));
	// A package.json and node_modules dir keep Bun's auto-install from resolving real packages
	await writeFile(join(dir, "package.json"), "{}");
	await mkdir(join(dir, "node_modules"), { recursive: true });
	if (binaryContent !== undefined) {
		const [packageName] = getCandidatePackageNames();
		const packageDir = join(dir, "node_modules", packageName);
		await mkdir(packageDir, { recursive: true });
		const binaryPath = join(packageDir, isWindows ? "backlog.exe" : "backlog");
		await writeFile(binaryPath, binaryContent);
		await chmod(binaryPath, 0o755);
	}
	return dir;
}

function runLauncher(dir: string, args: string[] = []) {
	// The published launcher has a Node shebang. Running it through the Bun test
	// process can deadlock when a fixture executable exits via a Unix signal.
	return spawnSync("node", [join(dir, "scripts", "cli.cjs"), ...args], { encoding: "utf8" });
}

afterAll(async () => {
	await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("cli launcher", () => {
	it("fails closed with fix instructions when an install has no built binary", async () => {
		const dir = await createLauncherDir();
		const result = runLauncher(dir, ["--version"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("--allow-scripts=backlog.md");
		expect(result.stderr).toContain("GitHub Releases");
		expect(result.stderr).not.toContain("Binary package not installed");
	});

	it("tells source checkouts to build instead of falling back to registry packages", async () => {
		const dir = await createLauncherDir();
		await mkdir(join(dir, "src"), { recursive: true });
		await writeFile(join(dir, "src", "cli.ts"), "");
		const result = runLauncher(dir, ["--version"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("bun install && bun run build");
		expect(result.stderr).not.toContain("Binary package not installed");
	});

	it.skipIf(isWindows)("prefers a local dist build over the installed platform package", async () => {
		const dir = await createLauncherDir('#!/bin/sh\necho "from platform package"\n');
		await mkdir(join(dir, "dist"), { recursive: true });
		const distBinary = join(dir, "dist", isWindows ? "backlog.exe" : "backlog");
		await writeFile(distBinary, '#!/bin/sh\necho "from dist"\n');
		await chmod(distBinary, 0o755);
		const result = runLauncher(dir, ["--version"]);
		expect(result.status).toBe(0);
		expect(result.stdout).toContain("from dist");
	});

	it.skipIf(isWindows)("spawns the dist build, forwarding args and exit code", async () => {
		const dir = await createLauncherDir('#!/bin/sh\necho "from platform package"\n');
		await mkdir(join(dir, "dist"), { recursive: true });
		const distBinary = join(dir, "dist", isWindows ? "backlog.exe" : "backlog");
		await writeFile(distBinary, '#!/bin/sh\necho "args: $@"\nexit 7\n');
		await chmod(distBinary, 0o755);
		const result = runLauncher(dir, ["task", "list"]);
		expect(result.status).toBe(7);
		expect(result.stdout).toContain("args: task list");
	});
});

describe("launcher error and signal mapping", () => {
	it("matches missing and wrong-architecture spawn failures", () => {
		expect(isBinaryInstallError({ errno: -86, code: "Unknown system error -86" })).toBe(true);
		expect(isBinaryInstallError({ code: "EBADARCH" })).toBe(true);
		expect(isBinaryInstallError({ code: "ENOEXEC", errno: -8 })).toBe(true);
		expect(isBinaryInstallError({ code: "ENOENT", errno: -2 })).toBe(true);
	});

	it("does not match unrelated spawn failures", () => {
		expect(isBinaryInstallError({ code: "EACCES", errno: -13 })).toBe(false);
		expect(isBinaryInstallError({})).toBe(false);
	});

	it("classifies architecture signals", () => {
		expect(isArchitectureSignal("SIGILL")).toBe(true);
		expect(isArchitectureSignal("SIGTRAP")).toBe(true);
		expect(isArchitectureSignal("SIGTERM")).toBe(false);
	});

	it.skipIf(isWindows)("maps Unix signals to conventional process exit codes", () => {
		expect(getSignalExitCode("SIGTERM")).toBe(128 + 15);
		expect(getSignalExitCode("UNKNOWN")).toBe(1);
	});
});
