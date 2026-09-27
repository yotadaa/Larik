import { requireCloudflareEnv } from "./env-utils.mjs";

const EXPECTED = {
  "novel": ["id", "novel-title", "novel_id", "lang"],
  "novel-content": ["id", "path", "name", "type", "lang", "novel-id", "novel-title", "content", "chapter-id", "chapter-title", "recap"],
  "characters": ["id", "character-name", "character-description", "novel-id"],
  "continuities": ["id", "content", "novel-id"],
  "glossariums": ["id", "source-term", "canonical-translation", "type", "first-seen", "notes", "novel-id"],
  "locations": ["id", "location", "novel-id"],
  "terminologies": ["id", "term", "novel-id"],
  "qa-log": ["id", "log", "novel-id"],
};

const { accountId, databaseId, apiToken } = requireCloudflareEnv();
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

async function query(sql, params = []) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });
  if (!response.ok) throw new Error(`Cloudflare D1 schema query failed with HTTP ${response.status}.`);
  const payload = await response.json();
  if (!payload.success) throw new Error("Cloudflare D1 schema query returned success=false.");
  const first = Array.isArray(payload.result) ? payload.result[0] : payload.result;
  return first?.results ?? [];
}

let mismatch = false;
for (const [table, expectedColumns] of Object.entries(EXPECTED)) {
  const rows = await query(`SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ? LIMIT 1`, [table]);
  const ddl = String(rows[0]?.sql ?? "");
  const actual = [...ddl.matchAll(/"([^"]+)"\s+(?:INTEGER|TEXT|REAL|BLOB|NUMERIC)/gi)].map((match) => match[1]);
  const missing = expectedColumns.filter((column) => !actual.includes(column));
  const extra = actual.filter((column) => !expectedColumns.includes(column));
  if (!ddl) {
    mismatch = true;
    console.error(`MISSING TABLE: ${table}`);
  } else if (missing.length || extra.length) {
    mismatch = true;
    console.error(`SCHEMA MISMATCH: ${table}`);
    if (missing.length) console.error(`  missing columns: ${missing.join(", ")}`);
    if (extra.length) console.error(`  extra columns: ${extra.join(", ")}`);
  } else {
    console.log(`OK: ${table} (${actual.length} columns)`);
  }
}

if (mismatch) {
  console.error("Remote D1 does not match scripts/sqilte-migration/DATABASE.md. Stop and migrate deliberately before deploying.");
  process.exit(1);
}
console.log("Remote D1 schema matches the documented application schema.");
