import fs from "node:fs";
import path from "node:path";
import { requireCloudflareEnv } from "./env-utils.mjs";

const root = process.cwd();
const remote = process.argv.includes("--remote");
const { accountId, databaseId } = requireCloudflareEnv(root);
const sourcePath = path.join(root, "wrangler.jsonc");
const outputPath = path.join(root, ".wrangler.production.jsonc");
const source = fs.readFileSync(sourcePath, "utf8");

let configured = source
  .replace(/"database_id"\s*:\s*"[^"]+"/, `"database_id": "${databaseId}"`)
  .replace(/\n}\s*$/, `,\n  "account_id": "${accountId}"\n}\n`);

if (remote) {
  configured = configured.replace(
    /("database_id"\s*:\s*"[^"]+")/,
    '$1,\n      "remote": true',
  );
}

fs.writeFileSync(outputPath, configured, { mode: 0o600 });
console.log(`Wrote .wrangler.production.jsonc${remote ? " with remote D1 enabled" : ""}.`);
console.log("The API token was not written to the config or application bundle.");
