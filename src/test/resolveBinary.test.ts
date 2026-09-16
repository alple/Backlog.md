import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
	getPackageName,
	getCandidatePackageNames,
	getSourceBinaryPath,
	isRosettaTranslated,
	resolveBinaryPath,
} = require("../../scripts/resolveBinary.cjs");

const tempDirs: string[] = [];

/** Fresh empty dir standing in for an installed package root (registry mode). */
function emptyPackageRoot() {
	const dir = mkdtempSync(join(tmpdir(), "backlog-resolver-"));
	tempDirs.push(dir);
	return dir;
}

/** Package root fixture with optional dist/ binary and src/cli.ts marker. */
function fixturePackageRoot({ dist, src }: { dist?: string; src?: boolean }) {
	const dir = emptyPackageRoot();
	if (dist !== undefined) {
		mkdirSync(join(dir, "dist"), { recursive: true });
		writeFileSync(join(dir, "dist", dist), "");
	}
	if (src) {
		mkdirSync(join(dir, "src"), { recursive: true });
		writeFileSync(join(dir, "src", "cli.ts"), "");
	}
	return dir;
}

afterAll(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("getPackageName", () => {
	it("maps win32 platform to windows package", () => {
		expect(getPackageName("win32", "x64")).toBe("backlog.md-windows-x64");
	});

	it("maps win32 arm64 to windows-arm64 package", () => {
		expect(getPackageName("win32", "arm64")).toBe("backlog.md-windows-arm64");
	});

	it("returns linux name unchanged", () => {
		expect(getPackageName("linux", "arm64")).toBe("backlog.md-linux-arm64");
	});

	it("maps darwin arches to darwin packages", () => {
		expect(getPackageName("darwin", "arm64")).toBe("backlog.md-darwin-arm64");
		expect(getPackageName("darwin", "x64")).toBe("backlog.md-darwin-x64");
	});
});

describe("getCandidatePackageNames", () => {
	it("tries the sibling darwin arch after the native one on macOS", () => {
		expect(getCandidatePackageNames("darwin", "arm64", false)).toEqual([
			"backlog.md-darwin-arm64",
			"backlog.md-darwin-x64",
		]);
		expect(getCandidatePackageNames("darwin", "x64", false)).toEqual([
			"backlog.md-darwin-x64",
			"backlog.md-darwin-arm64",
		]);
	});

	it("prefers the arm64 hardware arch when the process runs under Rosetta", () => {
		expect(getCandidatePackageNames("darwin", "x64", true)).toEqual([
			"backlog.md-darwin-arm64",
			"backlog.md-darwin-x64",
		]);
	});

	it("does not add fallbacks on other platforms", () => {
		expect(getCandidatePackageNames("linux", "x64")).toEqual(["backlog.md-linux-x64"]);
		expect(getCandidatePackageNames("linux", "arm64")).toEqual(["backlog.md-linux-arm64"]);
		expect(getCandidatePackageNames("win32", "x64")).toEqual(["backlog.md-windows-x64"]);
	});

	it("does not add fallbacks for unknown darwin arches", () => {
		expect(getCandidatePackageNames("darwin", "ppc64")).toEqual(["backlog.md-darwin-ppc64"]);
	});
});

describe("resolveBinaryPath", () => {
	it("resolves a dist build regardless of installed registry packages", () => {
		const root = fixturePackageRoot({ dist: "backlog" });
		expect(resolveBinaryPath("linux", root)).toBe(join(root, "dist", "backlog"));
	});

	it("fails hard for an unbuilt source checkout", () => {
		const root = fixturePackageRoot({ src: true });
		expect(() => resolveBinaryPath("linux", root)).toThrow("bun install && bun run build");
		expectCode("BACKLOG_BUILD_MISSING", () => resolveBinaryPath("linux", root));
	});

	it("fails hard for an install whose lifecycle scripts were skipped", () => {
		const root = emptyPackageRoot();
		expect(() => resolveBinaryPath("linux", root)).toThrow("--allow-scripts=backlog.md");
		expectCode("BACKLOG_BUILD_MISSING", () => resolveBinaryPath("linux", root));
	});

	it("falls back to the extensionless dist build on windows", () => {
		const root = fixturePackageRoot({ dist: "backlog" });
		expect(resolveBinaryPath("win32", root)).toBe(join(root, "dist", "backlog"));
	});
});

function expectCode(code: string, fn: () => unknown) {
	try {
		fn();
		throw new Error(`expected ${fn} to throw`);
	} catch (error) {
		expect((error as { code?: string }).code).toBe(code);
	}
}

describe("getSourceBinaryPath", () => {
	it("prefers backlog.exe on windows", () => {
		const root = fixturePackageRoot({ dist: "backlog.exe" });
		expect(getSourceBinaryPath("win32", root)).toBe(join(root, "dist", "backlog.exe"));
	});

	it("returns null when dist has no binary", () => {
		expect(getSourceBinaryPath("linux", emptyPackageRoot())).toBeNull();
	});
});

type ExecCall = { file: string; args: string[]; options: { encoding?: string; stdio?: unknown } };

function execStub(result: string | (() => never)) {
	const calls: ExecCall[] = [];
	const exec = (file: string, args: string[], options: ExecCall["options"]) => {
		calls.push({ file, args, options });
		if (typeof result === "function") return result();
		return result;
	};
	return { calls, exec };
}

describe("isRosettaTranslated", () => {
	it("is false off macOS without shelling out", () => {
		const { calls, exec } = execStub("1\n");
		expect(isRosettaTranslated("linux", exec)).toBe(false);
		expect(isRosettaTranslated("win32", exec)).toBe(false);
		expect(calls).toHaveLength(0);
	});

	it("returns a boolean on the current platform", () => {
		expect(typeof isRosettaTranslated()).toBe("boolean");
	});

	it("ignores the child's stderr so a denied sysctl cannot leak into our output", () => {
		const { calls, exec } = execStub("0\n");
		isRosettaTranslated("darwin", exec);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.options.stdio).toEqual(["ignore", "pipe", "ignore"]);
	});

	it("probes sysctl for proc_translated with utf8 output", () => {
		const { calls, exec } = execStub("0\n");
		isRosettaTranslated("darwin", exec);
		expect(calls[0]?.file).toBe("/usr/sbin/sysctl");
		expect(calls[0]?.args).toEqual(["-in", "sysctl.proc_translated"]);
		expect(calls[0]?.options.encoding).toBe("utf8");
	});

	it("reports translation only when sysctl returns 1", () => {
		expect(isRosettaTranslated("darwin", execStub("1\n").exec)).toBe(true);
		expect(isRosettaTranslated("darwin", execStub("0\n").exec)).toBe(false);
		expect(isRosettaTranslated("darwin", execStub("").exec)).toBe(false);
	});

	it("falls back to false when the probe throws", () => {
		const throwing = execStub(() => {
			throw new Error("Operation not permitted");
		});
		expect(isRosettaTranslated("darwin", throwing.exec)).toBe(false);
		expect(throwing.calls).toHaveLength(1);
	});
});
