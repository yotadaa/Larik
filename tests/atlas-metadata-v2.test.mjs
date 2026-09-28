import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { listAtlasChapters, loadAtlasData, loadInlineLookup } from "../app/lib/atlas.server.ts";

const NOVEL = "a-regressors-tale-of-cultivation";
const SNAPSHOT = "snapshot-v2-test";

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(fs.readFileSync(new URL("../database/migrations/0004_markdown_metadata_v2.sql", import.meta.url), "utf8"));
  sqlite.exec(`
    INSERT INTO metadata_sync_runs
      (novel_id, source_hash, source_file_count, chapter_count, reviewed_through, issue_count, status, coverage_note)
    VALUES ('${NOVEL}', '${SNAPSHOT}', 23, 2, 1, 1, 'complete', 'Metadata v2 canonical snapshot');

    INSERT INTO metadata_chapters
      (novel_id, snapshot_id, chapter_number, chapter_id, title, metadata_status, content_exists, recap_exists)
    VALUES
      ('${NOVEL}', '${SNAPSHOT}', 1, '001-one.md', 'One', 'reviewed', 1, 1),
      ('${NOVEL}', '${SNAPSHOT}', 2, '002-two.md', 'Two', 'unreviewed', 1, 1);

    INSERT INTO metadata_entities
      (novel_id, snapshot_id, entity_id, entity_type, canonical_name, first_seen_chapter, reveal_chapter, status, description, source_chapter_id, reviewed)
    VALUES
      ('${NOVEL}', '${SNAPSHOT}', 'char:hero', 'character', 'Hero', 1, 1, 'active', 'Reviewed hero', '001-one.md', 1),
      ('${NOVEL}', '${SNAPSHOT}', 'org:hidden-order', 'organization', 'Hidden Order', 2, 2, 'active', 'Late organization', '002-two.md', 0);

    INSERT INTO metadata_aliases
      (novel_id, snapshot_id, alias_id, alias, entity_id, alias_kind, valid_from_chapter, reveal_chapter, status, source_chapter_id, reviewed)
    VALUES
      ('${NOVEL}', '${SNAPSHOT}', 'alias:hero-secret', 'Secret Hero Name', 'char:hero', 'identity', 1, 2, 'active', '002-two.md', 0);

    INSERT INTO metadata_relationships
      (novel_id, snapshot_id, relationship_id, source_entity_id, relation_type, target_entity_id, valid_from_chapter, reveal_chapter, status, certainty, evidence, source_chapter_id, reviewed)
    VALUES
      ('${NOVEL}', '${SNAPSHOT}', 'rel:hero-order', 'char:hero', 'member_of', 'org:hidden-order', 2, 2, 'confirmed', 'high', 'Chapter two evidence', '002-two.md', 0);

    INSERT INTO metadata_facts
      (novel_id, snapshot_id, fact_id, subject_id, predicate, object_value, value_type, reveal_chapter, epistemic_status, source_type, evidence, source_chapter_id, reviewed)
    VALUES
      ('${NOVEL}', '${SNAPSHOT}', 'fact:hero-awake', 'char:hero', 'is_awake', 'true', 'boolean', 1, 'confirmed', 'narrator', 'Chapter one evidence', '001-one.md', 1),
      ('${NOVEL}', '${SNAPSHOT}', 'fact:hero-member', 'char:hero', 'member_of', 'org:hidden-order', 'entity', 2, 'confirmed', 'narrator', 'Chapter two evidence', '002-two.md', 0);

    INSERT INTO metadata_states
      (novel_id, snapshot_id, state_id, entity_id, property, value, value_type, valid_from_chapter, reveal_chapter, certainty, evidence, source_chapter_id, reviewed)
    VALUES
      ('${NOVEL}', '${SNAPSHOT}', 'state:hero-place', 'char:hero', 'location', 'loc:hidden', 'entity', 2, 2, 'confirmed', 'Chapter two state', '002-two.md', 0);

    INSERT INTO metadata_events
      (novel_id, snapshot_id, event_id, chapter_number, scene_id, scene_order, event_type, summary, participant_ids_json, source_chapter_id, reviewed)
    VALUES
      ('${NOVEL}', '${SNAPSHOT}', 'event:ch2-1', 2, 'scene:ch2-1', 1, 'discovery', 'The hidden order is revealed.', '["char:hero","org:hidden-order"]', '002-two.md', 0);

    INSERT INTO metadata_scenes
      (novel_id, snapshot_id, scene_id, chapter_number, scene_order, location_ids_json, pov_entity_id, participant_ids_json, event_ids_json, summary, source_chapter_id, reviewed)
    VALUES
      ('${NOVEL}', '${SNAPSHOT}', 'scene:ch2-1', 2, 1, '["loc:hidden"]', 'char:hero', '["char:hero","org:hidden-order"]', '["event:ch2-1"]', 'A reveal scene.', '002-two.md', 0);

    INSERT INTO metadata_arcs
      (novel_id, snapshot_id, arc_id, title, start_chapter, end_chapter, reveal_chapter, status, summary, key_entity_ids_json, key_event_ids_json, source_chapter_id, reviewed)
    VALUES
      ('${NOVEL}', '${SNAPSHOT}', 'arc:intro', 'Intro Arc', 1, 2, 1, 'active', 'Intro arc summary.', '["char:hero"]', '["event:ch2-1"]', '001-one.md', 1);

    INSERT INTO metadata_cycles
      (novel_id, snapshot_id, cycle_id, cycle_number, start_chapter, end_chapter, reveal_chapter, status, source_chapter_id, reviewed)
    VALUES
      ('${NOVEL}', '${SNAPSHOT}', 'cycle:1', 1, 1, 2, 1, 'known', '001-one.md', 1);

    INSERT INTO metadata_integrity_issues
      (novel_id, snapshot_id, issue_id, severity, code, source_file, record_id, detail)
    VALUES ('${NOVEL}', '${SNAPSHOT}', 'issue:1', 'warning', 'test_warning', 'facts.md', 'fact:hero-member', 'Test warning');
  `);
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let values = [];
      return {
        bind(...input) { values = input; return this; },
        async first() { return statement.get(...values) ?? null; },
        async all() { return { results: statement.all(...values) }; },
      };
    },
  };
  return { sqlite, db };
}

test("metadata v2 chapter coverage is sourced from the latest completed snapshot", async () => {
  const { db } = setup();
  const coverage = await listAtlasChapters(db, NOVEL);
  assert.equal(coverage.version, 1);
  assert.deepEqual(coverage.chapters.map((row) => [row.ordinal, row.reviewed]), [[1, true], [2, false]]);
  assert.match(coverage.coverageNote, /canonical snapshot/i);
});

test("metadata v2 safe mode filters future aliases, facts, states and relations before serialization", async () => {
  const { db } = setup();
  const atlas = await loadAtlasData(db, NOVEL, { throughChapterId: "002-two.md", scope: "through", includeUnreviewed: false });
  assert.equal(atlas.through.ordinal, 2);
  assert.equal(atlas.reviewedThrough.ordinal, 1);
  assert.equal(atlas.coverageLimited, true);
  assert.deepEqual(atlas.nodes.map((node) => node.id), ["char:hero"]);
  assert.deepEqual(atlas.nodes[0].aliases, []);
  assert.deepEqual(atlas.facts.map((fact) => fact.id), ["fact:hero-awake"]);
  assert.equal(atlas.edges.length, 0);
  assert.equal(atlas.states.length, 0);
  assert.equal(atlas.events.length, 0);
  assert.equal(atlas.scenes.length, 0);
  assert.ok(atlas.arcs.some((arc) => arc.id === "arc:intro"));
  assert.ok(atlas.cycles.some((cycle) => cycle.id === "cycle:1"));
  assert.equal(atlas.integrityIssueCount, 1);
  assert.ok(!JSON.stringify(atlas).includes("Secret Hero Name"));
  assert.ok(!JSON.stringify(atlas).includes("Hidden Order"));
});

test("metadata v2 explicit unlock exposes only rows at or before the selected reveal boundary", async () => {
  const { db } = setup();
  const atlas = await loadAtlasData(db, NOVEL, { fromChapterId: "001-one.md", throughChapterId: "002-two.md", scope: "all", includeUnreviewed: true });
  assert.equal(atlas.unreviewedUnlocked, true);
  assert.ok(atlas.nodes.some((node) => node.id === "org:hidden-order"));
  assert.deepEqual(atlas.nodes.find((node) => node.id === "char:hero")?.aliases, ["Secret Hero Name"]);
  assert.ok(atlas.edges.some((edge) => edge.id === "rel:hero-order"));
  assert.ok(atlas.facts.some((fact) => fact.id === "fact:hero-member"));
  assert.ok(atlas.states.some((state) => state.id === "state:hero-place"));
  assert.ok(atlas.events.some((event) => event.id === "event:ch2-1"));
  assert.ok(atlas.scenes.some((scene) => scene.id === "scene:ch2-1"));
});

test("inline lookup remains reviewed-only on metadata v2 snapshots", async () => {
  const { db } = setup();
  const lookup = await loadInlineLookup(db, NOVEL, "002-two.md");
  assert.equal(lookup.reviewedThrough.ordinal, 1);
  assert.deepEqual(lookup.entries.map((entry) => entry.id), ["char:hero"]);
  assert.deepEqual(lookup.entries[0].aliases, []);
});
