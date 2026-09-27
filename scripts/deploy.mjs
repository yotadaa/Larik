import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./configure-cloudflare.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = path.join(root, ".wrangler.production.jsonc");
const env = {
  ...process.env,
  CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH: config,
};

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["wrangler", "deploy", "-c", config], {
  cwd: root,
  env,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
