import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { atlasFactsInWindow, atlasNeighborhood } from "../app/lib/atlas.ts";
import { listAtlasChapters, loadAtlasData, loadInlineLookup } from "../app/lib/atlas.server.ts";
import { listChapters } from "../app/lib/repository.ts";

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE novel (id INTEGER PRIMARY KEY, novel_id TEXT, "novel-title" TEXT, lang TEXT);
    CREATE TABLE "novel-content" (id INTEGER PRIMARY KEY, path TEXT DEFAULT '', name TEXT DEFAULT '', type TEXT DEFAULT '', lang TEXT DEFAULT '', "novel-id" TEXT, "novel-title" TEXT DEFAULT '', content TEXT, "chapter-id" TEXT, "chapter-title" TEXT, recap TEXT DEFAULT '');
    CREATE TABLE glossariums (id INTEGER PRIMARY KEY, "novel-id" TEXT, "source-term" TEXT, "canonical-translation" TEXT, type TEXT, "first-seen" TEXT, notes TEXT);
    INSERT INTO novel VALUES(1,'a-regressors-tale-of-cultivation','A Regressor''s Tale of Cultivation','id');
    INSERT INTO "novel-content"(id,"novel-id","chapter-id","chapter-title",content,recap) VALUES
      (1,'a-regressors-tale-of-cultivation','001-hari-pertama-regresor.md','Hari Pertama Sang Regresor','Seo Eun-hyun returns to the first day.',''),
      (2,'a-regressors-tale-of-cultivation','002-takdir-yang-tersebar.md','Takdir yang Tersebar (1)','The Yellow Bamboo Root lies near the Ascension Gate.',''),
      (3,'a-regressors-tale-of-cultivation','003-takdir-yang-tersebar.md','Takdir yang Tersebar (2)','Kim Yeon senses several kilometers.',''),
      (4,'a-regressors-tale-of-cultivation','004-belum-direview.md','Bab Belum Direview','This chapter exists in the reader but has no curated atlas facts yet.','# Bab 4 Recap\n\n- A stored recap event exists for chapter four.');
    INSERT INTO glossariums VALUES
      (1,'a-regressors-tale-of-cultivation','Late Character','Late Character','character','Ch. 4','Metadata character first indexed in chapter four.'),
      (2,'a-regressors-tale-of-cultivation','Late Technique','Late Technique','technique','Ch. 4','Metadata technique first indexed in chapter four.');`);
  sqlite.exec(fs.readFileSync(new URL("../migrations/0001_reader_accounts.sql", import.meta.url), "utf8"));
  sqlite.exec(fs.readFileSync(new URL("../migrations/0002_verified_identity_progress_knowledge.sql", import.meta.url), "utf8"));
  sqlite.exec(fs.readFileSync(new URL("../migrations/0003_atlas_full_story_ranges.sql", import.meta.url), "utf8"));
  const db = { prepare(sql) { const statement = sqlite.prepare(sql); let values = []; return { bind(...input) { values = input; return this; }, async first() { return statement.get(...values) ?? null; }, async all() { return { results: statement.all(...values) }; } }; } };
  return { sqlite, db };
}
const NOVEL = "a-regressors-tale-of-cultivation";

test("full imported chapter boundaries are selectable while review state remains explicit", async () => {
  const { db } = setup();
  const coverage = await listAtlasChapters(db, NOVEL);
  assert.equal(coverage.version, 2);
  assert.deepEqual(coverage.chapters.map((row) => row.ordinal), [1, 2, 3, 4]);
  assert.deepEqual(coverage.chapters.map((row) => row.reviewed), [true, true, true, false]);
  assert.match(coverage.coverageNote, /metadata-derived/i);
});

test("reviewed chapter one never serializes later facts", async () => {
  const { db } = setup();
  const atlas = await loadAtlasData(db, NOVEL, "001-hari-pertama-regresor.md");
  assert.equal(atlas.through.ordinal, 1);
  assert.deepEqual(atlas.nodes.map((node) => node.label).sort(), ["Jeon Myeong-hoon", "Kim Young-hoon", "Oh Hyun-seok", "Seo Eun-hyun"].sort());
  assert.equal(atlas.events.length, 1);
  assert.ok(atlas.edges.every((edge) => edge.visibleFrom <= 1 && edge.reviewed));
  assert.ok(!JSON.stringify(atlas).includes("Late Character"));
  assert.ok(!JSON.stringify(atlas).includes("Kim Yeon"));
});

test("safe mode still clamps a later reader boundary to reviewed knowledge", async () => {
  const { db } = setup();
  const three = await loadAtlasData(db, NOVEL, "003-takdir-yang-tersebar.md");
  const four = await loadAtlasData(db, NOVEL, "004-belum-direview.md");
  assert.equal(four.through.ordinal, 4);
  assert.equal(four.reviewedThrough.ordinal, 3);
  assert.equal(four.coverageLimited, true);
  assert.equal(four.unreviewedUnlocked, false);
  assert.deepEqual(four.nodes.map((node) => node.id).sort(), three.nodes.map((node) => node.id).sort());
  assert.ok(!JSON.stringify(four).includes("Late Character"));
  assert.equal(await loadAtlasData(db, NOVEL, "999-unknown.md"), null);
});

test("explicit range unlock returns metadata facts and recap events beyond chapter three", async () => {
  const { db } = setup();
  const atlas = await loadAtlasData(db, NOVEL, {
    fromChapterId: "004-belum-direview.md",
    throughChapterId: "004-belum-direview.md",
    scope: "range",
    includeUnreviewed: true,
  });
  assert.equal(atlas.from.ordinal, 4);
  assert.equal(atlas.through.ordinal, 4);
  assert.equal(atlas.unreviewedUnlocked, true);
  assert.deepEqual(atlasFactsInWindow(atlas).map((node) => node.label).sort(), ["Late Character", "Late Technique"]);
  assert.ok(atlasFactsInWindow(atlas).every((node) => !node.reviewed));
  assert.equal(atlas.events.length, 1);
  assert.equal(atlas.events[0].chapterOrdinal, 4);
  assert.equal(atlas.events[0].reviewed, false);
  assert.match(atlas.events[0].summary, /stored recap event/i);
  assert.ok(atlas.edges.some((edge) => !edge.reviewed && edge.relation === "co-indexed"));
});

test("all-story unlock spans reviewed and metadata-derived knowledge", async () => {
  const { db } = setup();
  const atlas = await loadAtlasData(db, NOVEL, {
    fromChapterId: "001-hari-pertama-regresor.md",
    throughChapterId: "004-belum-direview.md",
    scope: "all",
    includeUnreviewed: true,
  });
  assert.equal(atlas.scope, "all");
  assert.equal(atlas.from.ordinal, 1);
  assert.equal(atlas.through.ordinal, 4);
  assert.ok(atlas.nodes.some((node) => node.reviewed));
  assert.ok(atlas.nodes.some((node) => !node.reviewed && node.label === "Late Character"));
  assert.ok(atlas.events.some((event) => event.reviewed));
  assert.ok(atlas.events.some((event) => !event.reviewed && event.chapterOrdinal === 4));
});

test("inline lookup stays review-only after full-story metadata is installed", async () => {
  const { db } = setup();
  const four = await loadInlineLookup(db, NOVEL, "004-belum-direview.md");
  assert.equal(four.through.ordinal, 4);
  assert.equal(four.reviewedThrough.ordinal, 3);
  assert.equal(four.coverageLimited, true);
  assert.ok(!JSON.stringify(four).includes("Late Character"));
  assert.ok(four.entries.every((entry) => entry.reviewed));
  assert.equal(await loadInlineLookup(db, NOVEL, "999-unknown.md"), null);
});

test("network uses stored edges and context fallback instead of inventing relationships", async () => {
  const { db } = setup();
  const atlas = await loadAtlasData(db, NOVEL, {
    fromChapterId: "004-belum-direview.md",
    throughChapterId: "004-belum-direview.md",
    scope: "range",
    includeUnreviewed: true,
  });
  const focus = atlas.nodes.find((node) => node.label === "Late Character");
  const neighborhood = atlasNeighborhood(atlas, focus.id, 5);
  assert.ok(neighborhood.nodes.some((node) => node.label === "Late Technique"));
  assert.ok(neighborhood.edges.every((edge) => edge.relation === "co-indexed"));
  assert.ok(neighborhood.edges.every((edge) => !edge.reviewed));
});

test("D1 FTS search returns stored excerpts and follows chapter revisions", async () => {
  const { db, sqlite } = setup();
  const first = await listChapters(db, NOVEL, { q: "Ascension Gate", pageSize: 20 });
  assert.equal(first.total, 1);
  assert.equal(first.items[0].chapterId, "002-takdir-yang-tersebar.md");
  assert.match(first.items[0].excerpt, /Ascension Gate/i);
  sqlite.exec(`INSERT INTO "novel-content"(id,"novel-id","chapter-id","chapter-title",content) VALUES(5,'${NOVEL}','002-takdir-yang-tersebar.md','Takdir yang Tersebar (1)','revision-only-token silverphoenix');`);
  assert.equal((await listChapters(db, NOVEL, { q: "Ascension", pageSize: 20 })).total, 0);
  const revised = await listChapters(db, NOVEL, { q: "silverphoenix", pageSize: 20 });
  assert.equal(revised.total, 1);
  assert.equal(revised.items[0].id, 5);
});
