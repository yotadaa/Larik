import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const protectedRoots = [path.join(root, "app"), path.join(root, "workers")];
const forbidden = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ID", "DATABASE_ID", "api.cloudflare.com/client/v4"];
const extensions = new Set([".ts", ".tsx", ".js", ".mjs"]);
const forbiddenIconGlyphs = ["←", "→", "↗", "↘", "↙", "↖", "☰", "★", "☆"];
let failures = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (extensions.has(path.extname(entry.name))) inspect(full);
  }
}

function inspect(file) {
  const source = fs.readFileSync(file, "utf8");
  for (const token of forbidden) {
    if (source.includes(token)) {
      console.error(`Forbidden credential/API token reference ${token} in ${path.relative(root, file)}`);
      failures++;
    }
  }
  if (file.endsWith(".tsx")) {
    for (const glyph of forbiddenIconGlyphs) {
      if (source.includes(glyph)) {
        console.error(`Use Heroicons instead of decorative glyph ${glyph} in ${path.relative(root, file)}`);
        failures++;
      }
    }
  }
}

for (const dir of protectedRoots) walk(dir);
if (failures) process.exit(1);
console.log("static security checks: PASS");
