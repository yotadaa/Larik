import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  getCatalogStats,
  getReferenceCounts,
  getChapter,
  getNovel,
  listCharacters,
  listChapters,
  listGlossary,
  listLanguages,
  listLocations,
  listTerminologies,
  listContinuities,
  listQaLogs,
  listNovels,
} from "../app/lib/repository.ts";

class SqliteStatementAdapter {
  constructor(statement) {
    this.statement = statement;
    this.values = [];
  }
  bind(...values) {
    this.values = values;
    return this;
  }
  async all() {
    return { results: this.statement.all(...this.values) };
  }
  async first() {
    return this.statement.get(...this.values) ?? null;
  }
}

class SqliteD1Adapter {
  constructor(database) {
    this.database = database;
  }
  prepare(sql) {
    return new SqliteStatementAdapter(this.database.prepare(sql));
  }
}

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(fs.readFileSync(new URL("../scripts/local-d1.sql", import.meta.url), "utf8"));
const db = new SqliteD1Adapter(sqlite);

const stats = await getCatalogStats(db);
assert.deepEqual(stats, { novels: 2, chapters: 3, languages: 2 });

const languages = await listLanguages(db);
assert.deepEqual(languages, [{ lang: "en", count: 1 }, { lang: "id", count: 1 }]);

const allNovels = await listNovels(db, { pageSize: 10 });
assert.equal(allNovels.total, 2);
assert.equal(allNovels.items[0].title, "A Regressor's Tale of Cultivation");
assert.equal(allNovels.items[0].chapterCount, 2);

const injection = await listNovels(db, { q: "\' OR 1=1 --" });
assert.equal(injection.total, 0);

const filtered = await listNovels(db, { q: "regressor", lang: "id" });
assert.equal(filtered.total, 1);
assert.equal(filtered.items[0].novelId, "a-regressors-tale-of-cultivation");

const novel = await getNovel(db, "a-regressors-tale-of-cultivation");
assert.equal(novel?.chapterCount, 2);

const chapters = await listChapters(db, "a-regressors-tale-of-cultivation", { pageSize: 10 });
assert.deepEqual(chapters.items.map((item) => item.chapterId), ["001-prologue!.md", "002-rain & iron.md"]);
assert.equal(chapters.items[0].recapAvailable, true);
assert.equal(chapters.items[1].recapAvailable, false);

const chapter = await getChapter(db, "a-regressors-tale-of-cultivation", "001-prologue!.md");
assert.ok(chapter);
assert.match(chapter.current.content, /Versi terbaru/);
assert.equal(chapter.previous, null);
assert.equal(chapter.next?.chapterId, "002-rain & iron.md");

const second = await getChapter(db, "a-regressors-tale-of-cultivation", "002-rain & iron.md");
assert.equal(second?.previous?.chapterId, "001-prologue!.md");
assert.equal(second?.next, null);

const characters = await listCharacters(db, "a-regressors-tale-of-cultivation");
assert.equal(characters.length, 1);
assert.match(characters[0].description, /terbaru/);

const glossary = await listGlossary(db, "a-regressors-tale-of-cultivation");
assert.deepEqual(glossary, []);
assert.equal((await listLocations(db, "a-regressors-tale-of-cultivation")).length, 1);
assert.equal((await listTerminologies(db, "a-regressors-tale-of-cultivation")).length, 1);
assert.equal((await listContinuities(db, "a-regressors-tale-of-cultivation")).length, 1);
assert.equal((await listQaLogs(db, "a-regressors-tale-of-cultivation")).length, 1);

const counts = await getReferenceCounts(db, "a-regressors-tale-of-cultivation");
assert.deepEqual(counts, { characters: 2, locations: 1, terminology: 1, glossary: 0, continuity: 1, qa: 1 });

console.log("repository integration tests: PASS");
