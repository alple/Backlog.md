const fs = require("node:fs");
const path = require("node:path");

function dump() {
	try {
		const lines = [];
		lines.push(`=== diag ${new Date().toISOString()} pid=${process.pid} ppid=${process.ppid}`);
		let cwd = "<FAILED>";
		try {
			cwd = process.cwd();
		} catch (e) {
			cwd = `<CWD FAILED: ${e.code || e.message}>`;
		}
		lines.push(`cwd=${cwd}`);
		lines.push(`npm_lifecycle_event=${process.env.npm_lifecycle_event}`);
		lines.push(`npm_package_json=${process.env.npm_package_json}`);
		lines.push(`npm_config_global=${process.env.npm_config_global}`);
		lines.push(`npm_config_prefix=${process.env.npm_config_prefix}`);
		lines.push(`PACOTE_NO_PREPARE=${process.env._PACOTE_NO_PREPARE_}`);
		const root = path.join(__dirname, "..");
		lines.push(`root=${root}`);
		for (const p of [root, path.join(root, "scripts"), path.join(root, "src", "cli.ts"), path.join(root, ".git"), path.join(root, "node_modules", ".backlog-prepare-marker"), path.join(root, "dist")]) {
			lines.push(`exists ${p}: ${fs.existsSync(p)}`);
		}
		try {
			lines.push(`ls root: ${fs.readdirSync(root).join(",")}`);
		} catch (e) {
			lines.push(`ls root FAILED: ${e.code}`);
		}
		fs.appendFileSync("/tmp/kilo/pi-debug.log", lines.join("\n") + "\n");
	} catch (e) {
		try {
			fs.appendFileSync("/tmp/kilo/pi-debug.log", `diag itself failed: ${e.message}\n`);
		} catch {}
	}
}

dump();
require("./build-install.cjs");
