/** Generate local-only SQL from the original Markdown. No network and no source rewrites. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { splitMarkdownEntries, plainText } from "../app/lib/atlas.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const output = args.includes("--output") ? args[args.indexOf("--output") + 1] : ".local/corpus.sql";
const language = args.includes("--language") ? args[args.indexOf("--language") + 1] : "id";
if (!/^[a-z]{2,8}$/.test(language ?? "")) throw new Error("Invalid language directory.");
if (!output) throw new Error("--output needs a path.");
const quote = (value) => `'${String(value ?? "").replaceAll("'", "''")}'`;
const statements = ["-- Generated from local Markdown. Apply to LOCAL D1 only."];
const counts = { novels: 0, chapters: 0, recaps: 0, characters: 0, glossary: 0, metadata: 0 };
function insert(table, record) {
  const keys = Object.keys(record);
  // Idempotent import; changed records append a new version, matching the existing repository.
  statements.push(`INSERT INTO "${table}" (${keys.map((key) => `"${key}"`).join(", ")}) SELECT ${keys.map((key) => quote(record[key])).join(", ")} WHERE NOT EXISTS (SELECT 1 FROM "${table}" WHERE ${keys.map((key) => `COALESCE("${key}", '') = ${quote(record[key])}`).join(" AND ")});`);
}
function read(dir, name) { const file = path.join(dir, name); return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""; }
function field(source, key) {
  const match = source.match(new RegExp(`^${key}:\\s*(.*?)\\s*$`, "m"));
  if (!match) return "";
  let value = match[1];
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  return value;
}
const languageRoot = path.join(root, language);
if (!fs.existsSync(languageRoot)) throw new Error(`Corpus directory not found: ${language}`);
for (const entry of fs.readdirSync(languageRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  const dir = path.join(languageRoot, entry.name);
  const chaptersDir = path.join(dir, "chapters");
  if (!fs.existsSync(chaptersDir)) continue;
  const files = fs.readdirSync(chaptersDir).filter((file) => file.endsWith(".md")).sort();
  const first = files.length ? read(chaptersDir, files[0]) : "";
  const title = field(first, "novel") || entry.name;
  insert("novel", { novel_id: entry.name, "novel-title": title, lang: language }); counts.novels++;
  for (const file of files) {
    const content = read(chaptersDir, file);
    const recap = read(path.join(dir, "recaps"), file);
    const chapterTitle = field(content, "translated_title") || content.match(/^#\s+(.+)$/m)?.[1] || file;
    insert("novel-content", { path: `${language}/${entry.name}/chapters/${file}`, name: file, type: "chapter", lang: language, "novel-id": entry.name, "novel-title": title, content, "chapter-id": file, "chapter-title": chapterTitle, recap });
    counts.chapters++; if (recap) counts.recaps++;
  }
  for (const line of splitMarkdownEntries(read(dir, "characters.md"))) {
    const divider = line.search(/\s[\u2014\u2013]\s/);
    const prefix = divider >= 0 ? line.slice(0, divider) : line;
    const names = [...prefix.matchAll(/\*\*(.+?)\*\*/g)].map((match) => plainText(match[1]));
    const description = divider >= 0 ? line.slice(divider).replace(/^[\s\u2014\u2013]+/, "") : line;
    for (const name of names.length ? names : [plainText(prefix)]) {
      insert("characters", { "novel-id": entry.name, "character-name": name, "character-description": description }); counts.characters++;
    }
  }
  for (const line of read(dir, "glossarium.md").split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((cell) => cell.trim().replaceAll("\\|", "|"));
    if (cells.length < 5 || cells[0] === "Source Term" || /^:?-+:?$/.test(cells[0])) continue;
    insert("glossariums", { "novel-id": entry.name, "source-term": cells[0], "canonical-translation": cells[1], type: cells[2], "first-seen": cells[3], notes: cells.slice(4).join(" | ") }); counts.glossary++;
  }
  for (const [filename, table, column] of [["locations.md", "locations", "location"], ["terminology.md", "terminologies", "term"], ["continuity.md", "continuities", "content"], ["qa-log.md", "qa-log", "log"]]) {
    for (const text of splitMarkdownEntries(read(dir, filename))) { insert(table, { "novel-id": entry.name, [column]: text }); counts.metadata++; }
  }
}
const destination = path.resolve(root, output);
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, statements.join("\n") + "\n");
console.log(`Local import SQL: ${path.relative(root, destination)}`);
console.log(JSON.stringify(counts));
