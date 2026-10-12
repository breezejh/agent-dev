import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

const app = fileURLToPath(new URL("..", import.meta.url));
const pi = resolve(app, "../pi");
const out = join(pi, ".artifacts", `my-agent-${Date.now()}`);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.signal})`);
}

// Bootstrap: npm ci --ignore-scripts in ../pi, then hydrate:model-data once.
// Use a fresh artifact directory so existing lockfiles never point at deleted tarballs.
run(process.execPath, ["scripts/pack-packages.mjs", "--out", out, "--offline-model-data"], pi);
run(process.execPath, [
  "scripts/use-local-packages.mjs", "--manifest", join(out, "manifest.json"),
  "--consumer", app,
  "--package", "@earendil-works/pi-coding-agent",
  "--package", "@earendil-works/pi-agent-core",
  "--package", "@earendil-works/pi-ai",
], pi);
run(npm, ["install", "--ignore-scripts", "--no-audit", "--no-fund"], app);
run(npm, ["run", "check"], app);
