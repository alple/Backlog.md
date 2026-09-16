import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const packageJsonPath = join(import.meta.dir, "..", "package.json");

function fail(message: string): never {
	console.error(`bump: ${message}`);
	process.exit(1);
}

function git(args: string[]): { status: number; stdout: string } {
	const result = spawnSync("git", args, { encoding: "utf8" });
	return { status: result.status ?? 1, stdout: (result.stdout ?? "").trim() };
}

function main() {
	const input = process.argv[2];
	if (!input) fail("usage: bun run bump <major|minor|patch|x.y[.z]>");

	const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string };
	const current = packageJson.version ?? "0.0.0";
	const [major = 0, minor = 0, patch = 0] = current.split(".").map((part) => Number.parseInt(part, 10) || 0);

	let next: [number, number, number];
	if (input === "major") {
		next = [major + 1, 0, 0];
	} else if (input === "minor") {
		next = [major, minor + 1, 0];
	} else if (input === "patch") {
		next = [major, minor, patch + 1];
	} else {
		const [first = 0, second = 0, third = 0] = input.split(".").map((part) => Number.parseInt(part, 10));
		const valid =
			input.split(".").length >= 2 &&
			input.split(".").length <= 3 &&
			[first, second, third].every((part) => Number.isInteger(part) && part >= 0);
		if (!valid) fail(`invalid version '${input}' (expected major|minor|patch or x.y[.z])`);
		next = [first, second, third];
	}

	const nextVersion = next.join(".");
	if (nextVersion === current) fail(`already at version ${current}`);

	// Fork tag scheme: x.y.0 tags as vX.Y, anything else keeps its patch digit.
	const tag = `v${nextVersion.replace(/\.0$/, "")}`;
	if (git(["rev-parse", "-q", "--verify", `refs/tags/${tag}`]).status === 0) {
		fail(`tag ${tag} already exists`);
	}

	writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

	const commit = git(["commit", "-m", `chore: bump version to ${nextVersion}`, "--", "package.json"]);
	if (commit.status !== 0) fail("git commit of package.json failed");
	const tagResult = git(["tag", "-a", tag, "-m", `Backlog.md fork ${tag}`]);
	if (tagResult.status !== 0) fail(`git tag ${tag} failed`);

	const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).stdout;
	console.log(`Version bumped: ${current} -> ${nextVersion}, tagged ${tag}.`);
	console.log("Pushing the tag is what starts the release:");
	console.log(`  git push origin ${branch} ${tag}`);
}

main();
