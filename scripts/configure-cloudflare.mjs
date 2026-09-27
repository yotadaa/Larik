import fs from "node:fs";
const config = JSON.parse(fs.readFileSync("wrangler.jsonc", "utf8"));
if (!config.d1_databases?.some((binding) => binding.binding === "DB")) throw new Error("DB binding is missing.");
if (process.argv.includes("--remote")) {
  for (const binding of config.d1_databases) binding.remote = true;
  fs.writeFileSync(".wrangler.production.jsonc", JSON.stringify(config, null, 2) + "\n");
  console.log("Generated ignored remote development config. Wrangler authentication is required. This command does not run migrations.");
} else {
  console.log("Local D1 binding configured. Run npm run db:local:setup before first development start.");
}
