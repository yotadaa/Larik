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
  sqlite.exec(fs.readFileSync(new URL("../database/migrations/0005_characteristic_profile_boundaries.sql", import.meta.url), "utf8"));
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
      (novel_id, snapshot_id, relationship_id, source_entity_id, relation_type, target_entity_id, valid_from_chapter, reveal_chapter, cycle_id, status, certainty, evidence, source_chapter_id, reviewed)
    VALUES
      ('${NOVEL}', '${SNAPSHOT}', 'rel:hero-order', 'char:hero', 'member_of', 'org:hidden-order', 2, 2, 'cycle:1', 'confirmed', 'high', 'Chapter two evidence', '002-two.md', 0);

    INSERT INTO metadata_facts
      (novel_id, snapshot_id, fact_id, subject_id, predicate, object_value, value_type, reveal_chapter, cycle_id, epistemic_status, source_type, supersedes, contradicts, evidence, source_chapter_id, reviewed)
    VALUES
      ('${NOVEL}', '${SNAPSHOT}', 'fact:hero-awake', 'char:hero', 'is_awake', 'true', 'boolean', 1, 'cycle:1', 'confirmed', 'narrator', '', '', 'Chapter one evidence', '001-one.md', 1),
      ('${NOVEL}', '${SNAPSHOT}', 'fact:hero-member', 'char:hero', 'member_of', 'org:hidden-order', 'entity', 2, 'cycle:1', 'confirmed', 'narrator', 'fact:hero-awake', 'fact:old-belief', 'Chapter two evidence', '002-two.md', 0);

    INSERT INTO metadata_states
      (novel_id, snapshot_id, state_id, entity_id, property, value, value_type, valid_from_chapter, valid_to_chapter, reveal_chapter, certainty, evidence, source_chapter_id, reviewed)
    VALUES
      ('${NOVEL}', '${SNAPSHOT}', 'state:hero-prior', 'char:hero', 'realm', 'Early Realm', 'text', 1, 2, 1, 'confirmed', 'Prior state still active in chapter two', '001-one.md', 0),
      ('${NOVEL}', '${SNAPSHOT}', 'state:hero-place', 'char:hero', 'location', 'loc:hidden', 'entity', 2, NULL, 2, 'confirmed', 'Chapter two state', '002-two.md', 0);

    INSERT INTO metadata_events
      (novel_id, snapshot_id, event_id, chapter_number, scene_id, scene_order, cycle_id, timeline_order, event_type, summary, location_ids_json, participant_ids_json, cause_event_ids_json, effect_event_ids_json, certainty, evidence, source_chapter_id, reviewed)
    VALUES
      ('${NOVEL}', '${SNAPSHOT}', 'event:ch2-1', 2, 'scene:ch2-1', 1, 'cycle:1', 'cycle:1:002:01', 'discovery', 'The hidden order is revealed.', '["loc:hidden"]', '["char:hero","org:hidden-order"]', '["event:ch1-setup"]', '["event:ch2-followup"]', 'high', 'Event evidence', '002-two.md', 0);

    INSERT INTO metadata_scenes
      (novel_id, snapshot_id, scene_id, chapter_number, scene_order, location_ids_json, pov_entity_id, participant_ids_json, event_ids_json, summary, evidence, source_chapter_id, reviewed)
    VALUES
      ('${NOVEL}', '${SNAPSHOT}', 'scene:ch2-1', 2, 1, '["loc:hidden"]', 'char:hero', '["char:hero","org:hidden-order"]', '["event:ch2-1"]', 'A reveal scene.', 'Scene evidence', '002-two.md', 0);

    INSERT INTO metadata_arcs
      (novel_id, snapshot_id, arc_id, title, start_chapter, end_chapter, reveal_chapter, cycle_ids_json, status, summary, key_entity_ids_json, key_event_ids_json, evidence, source_chapter_id, reviewed)
    VALUES
      ('${NOVEL}', '${SNAPSHOT}', 'arc:intro', 'Intro Arc', 1, 2, 1, '["cycle:1"]', 'active', 'Intro arc summary.', '["char:hero"]', '["event:ch2-1"]', 'Arc evidence', '001-one.md', 1);

    INSERT INTO metadata_cycles
      (novel_id, snapshot_id, cycle_id, cycle_number, start_chapter, end_chapter, reveal_chapter, status, evidence, source_chapter_id, reviewed)
    VALUES
      ('${NOVEL}', '${SNAPSHOT}', 'cycle:1', 1, 1, 2, 1, 'known', 'Cycle evidence', '001-one.md', 1);

    INSERT INTO metadata_characteristics
      (novel_id, snapshot_id, source_row, entity_id, profile_kind, entity_type, canonical_name, first_seen_chapter, profile_through_chapter, physical_form, temperament_or_properties, abilities_or_role, relationships_status, characteristic_as_of, scope, evidence)
    VALUES
      ('${NOVEL}', '${SNAPSHOT}', 1, 'char:hero', 'detailed', 'character', 'Hero', 1, 2, 'Ordinary appearance', 'Careful', 'Future profile detail', 'Member of a hidden order', 'Snapshot through chapter two', '', '[[002-two]]'),
      ('${NOVEL}', '${SNAPSHOT}', 2, 'org:hidden-order', 'registry', 'organization', 'Hidden Order', 2, 2, '', '', '', '', '', 'Registry only', '');

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
  assert.equal(atlas.characteristics.length, 0);
  assert.equal(atlas.integrityIssueCount, 1);
  assert.ok(!JSON.stringify(atlas).includes("Secret Hero Name"));
  assert.ok(!JSON.stringify(atlas).includes("Hidden Order"));
  assert.ok(!JSON.stringify(atlas).includes("Future profile detail"));
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
  assert.equal(atlas.edges.find((edge) => edge.id === "rel:hero-order")?.cycleId, "cycle:1");
  const fact = atlas.facts.find((row) => row.id === "fact:hero-member");
  assert.equal(fact?.cycleId, "cycle:1");
  assert.equal(fact?.supersedes, "fact:hero-awake");
  assert.equal(fact?.contradicts, "fact:old-belief");
  const event = atlas.events.find((row) => row.id === "event:ch2-1");
  assert.equal(event?.timelineOrder, "cycle:1:002:01");
  assert.deepEqual(event?.locationIds, ["loc:hidden"]);
  assert.deepEqual(event?.causeEventIds, ["event:ch1-setup"]);
  assert.deepEqual(event?.effectEventIds, ["event:ch2-followup"]);
  assert.equal(event?.certainty, "high");
  assert.equal(event?.evidence, "Event evidence");
  assert.equal(atlas.scenes.find((scene) => scene.id === "scene:ch2-1")?.evidence, "Scene evidence");
  assert.equal(atlas.arcs.find((arc) => arc.id === "arc:intro")?.evidence, "Arc evidence");
  assert.equal(atlas.cycles.find((cycle) => cycle.id === "cycle:1")?.evidence, "Cycle evidence");
  assert.ok(atlas.characteristics.some((profile) => profile.entityId === "char:hero" && profile.profileKind === "detailed"));
  assert.equal(atlas.characteristics.find((profile) => profile.entityId === "char:hero")?.profileThrough, 2);
  assert.ok(JSON.stringify(atlas).includes("Future profile detail"));
});

test("metadata v2 range includes a previously revealed state while its validity overlaps the selected window", async () => {
  const { db } = setup();
  const atlas = await loadAtlasData(db, NOVEL, { fromChapterId: "002-two.md", throughChapterId: "002-two.md", scope: "range", includeUnreviewed: true });
  assert.ok(atlas.states.some((state) => state.id === "state:hero-prior"));
  assert.ok(atlas.states.some((state) => state.id === "state:hero-place"));
  assert.ok(atlas.states.every((state) => state.visibleFrom <= 2));
});

test("inline lookup remains reviewed-only on metadata v2 snapshots", async () => {
  const { db } = setup();
  const lookup = await loadInlineLookup(db, NOVEL, "002-two.md");
  assert.equal(lookup.reviewedThrough.ordinal, 1);
  assert.deepEqual(lookup.entries.map((entry) => entry.id), ["char:hero"]);
  assert.deepEqual(lookup.entries[0].aliases, []);
  assert.equal(lookup.entries[0].description, "Reviewed hero");
  assert.ok(!JSON.stringify(lookup).includes("Future profile detail"));
});
