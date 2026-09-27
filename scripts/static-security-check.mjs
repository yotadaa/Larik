import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const files = [];
function visit(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) visit(file); else if (/\.tsx?$/.test(file)) files.push(file); } }
visit("app"); visit("workers");
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  assert.ok(!/CLOUDFLARE_API_TOKEN|AKIA[0-9A-Z]{16}|sk-[a-zA-Z0-9]{20,}/.test(text), `${file}: secret marker`);
  assert.ok(!/dangerouslySetInnerHTML|eval\(/.test(text), `${file}: unsafe rendering/execution`);
  if (file.endsWith(".tsx")) assert.ok(!/[\u2190-\u21ff\u2605\u2606]/u.test(text), `${file}: use Heroicons, not decorative Unicode glyphs`);
}
const worker = fs.readFileSync("workers/app.ts", "utf8");
assert.match(worker, /private, no-store/);
const auth = fs.readFileSync("app/lib/auth.server.ts", "utf8");
assert.match(auth, /getRandomValues\(new Uint8Array\(32\)\)/);
assert.match(auth, /HttpOnly; SameSite=Lax/);
assert.match(auth, /expires_at > \?/);
const bookmarks = fs.readFileSync("app/lib/bookmarks.server.ts", "utf8");
assert.match(bookmarks, /assertSameOriginPost\(request\)/);
assert.match(bookmarks, /requireUser\(db, request\)/);
assert.match(bookmarks, /removeBookmark\(db, user.id/);
const atlas = fs.readFileSync("app/routes/atlas.tsx", "utf8");
assert.match(atlas, /sources: revealed \? await loadAtlasSources\(db, novelId\) : null/);
assert.ok(!fs.readFileSync("app/lib/atlas.server.ts", "utf8").includes("buildAtlas("));
assert.ok(!fs.readFileSync("app/routes/chapter.tsx", "utf8").includes("slice(11)"));
console.log(`Static source/security/icon checks: PASS (${files.length} modules). Not a penetration test.`);
