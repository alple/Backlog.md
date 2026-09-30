import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const packageJsonPath = join(import.meta.dir, "..", "package.json");

function fail(message: string): never {
	console.error(`bump: ${message}`);
	process.exit(1);
}

function git(args: string[]): { status: number; stdout: string; stderr: string } {
	const result = spawnSync("git", args, { encoding: "utf8" });
	return { status: result.status ?? 1, stdout: (result.stdout ?? "").trim(), stderr: (result.stderr ?? "").trim() };
}

function gitError(step: string, result: { stdout: string; stderr: string }): string {
	const output = `${result.stderr}\n${result.stdout}`.trim();
	return `${step} failed${output ? `:\n${output}` : ""}`;
}

function main() {
	const next = process.argv[2];
	if (!next) fail("usage: bun run bump <x.y.z[-vN]>");

	// Fork version scheme: the version encodes the upstream base plus a fork
	// iteration (e.g. 1.53.0-v1), and the tag is the version verbatim.
	if (!/^\d+\.\d+\.\d+(-v\d+)?$/.test(next)) fail(`invalid version '${next}' (expected x.y.z or x.y.z-vN)`);

	const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string };
	const current = packageJson.version ?? "";
	if (next === current) fail(`already at version ${current}`);

	const tag = `v${next}`;
	if (git(["rev-parse", "-q", "--verify", `refs/tags/${tag}`]).status === 0) {
		fail(`tag ${tag} already exists`);
	}

	packageJson.version = next;

	writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

	// Stage first so lint-staged's pre-commit hook has files to operate on.
	const add = git(["add", "package.json"]);
	if (add.status !== 0) fail(gitError("git add package.json", add));
	const commit = git(["commit", "-m", `chore: bump version to ${next}`, "--", "package.json"]);
	if (commit.status !== 0) fail(gitError("git commit of package.json", commit));
	const tagResult = git(["tag", "-a", tag, "-m", `Backlog.md fork ${tag}`]);
	if (tagResult.status !== 0) fail(gitError(`git tag ${tag}`, tagResult));

	const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).stdout;
	console.log(`Version bumped: ${current} -> ${next}, tagged ${tag}.`);
	console.log("Pushing the tag is what starts the release:");
	console.log(`  git push origin ${branch} ${tag}`);
}

main();
