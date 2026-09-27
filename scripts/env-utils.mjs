import fs from "node:fs";
import path from "node:path";

function parseDotenv(source) {
  const result = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value;
  }
  return result;
}

export function loadProjectEnv(root = process.cwd()) {
  const candidates = [
    path.join(root, ".env"),
    path.join(root, "scripts", "sqilte-migration", ".env"),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const parsed = parseDotenv(fs.readFileSync(file, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (!process.env[key]) process.env[key] = value;
    }
  }
  return process.env;
}

export function requireCloudflareEnv(root = process.cwd()) {
  const env = loadProjectEnv(root);
  const names = ["CLOUDFLARE_ID", "DATABASE_ID", "CLOUDFLARE_API_TOKEN"];
  const missing = names.filter((name) => !env[name]);
  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
  }
  return {
    accountId: env.CLOUDFLARE_ID,
    databaseId: env.DATABASE_ID,
    apiToken: env.CLOUDFLARE_API_TOKEN,
  };
}
