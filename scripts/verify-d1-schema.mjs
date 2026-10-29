import fs from "node:fs";
import { spawnSync } from "node:child_process";
const required = JSON.parse(fs.readFileSync("scripts/schema-contract.json", "utf8"));
const local = process.argv.includes("--local");
const executable = process.platform === "win32" ? "npx.cmd" : "npx";
// One query per table: D1 rejects a 13-term compound SELECT with SQLITE_ERROR 7500
// ("too many terms in compound SELECT"), which used to abort every deploy.
const rows = [];
for (const table of Object.keys(required)) {
  const query = `SELECT '${table}' AS table_name, name AS column_name FROM pragma_table_info('${table}')`;
  const result = spawnSync(executable, ["--no-install", "wrangler", "d1", "execute", "novel", local ? "--local" : "--remote", "--command", query, "--json"], { encoding: "utf8" });
  if (result.status !== 0) { console.error(result.stdout || result.stderr || "Wrangler schema query failed. Check authentication and DB binding."); process.exit(1); }
  rows.push(...JSON.parse(result.stdout).flatMap((item) => item.results ?? []));
}
const missing = [];
for (const [table, columns] of Object.entries(required)) for (const column of columns) {
  if (!rows.some((row) => row.table_name === table && row.column_name === column)) missing.push(`${table}.${column}`);
}
if (missing.length) { console.error(`Missing required columns: ${missing.join(", ")}`); process.exit(1); }
console.log(`${local ? "Local" : "Remote"} D1 required columns verified. Extra legacy columns are allowed.`);
