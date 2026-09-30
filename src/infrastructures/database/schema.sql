PRAGMA foreign_keys = ON;

-- Translation itself. Reprocessing an upstream chapter marks later rows stale.
CREATE TABLE IF NOT EXISTS chapters (
    novel_id TEXT NOT NULL,
    lang_id TEXT NOT NULL,
    chapter_number INTEGER NOT NULL,
    source_path TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    chapter_title TEXT NOT NULL DEFAULT '',
    translated_text TEXT NOT NULL,
    continuity_summary TEXT NOT NULL,
    context_fingerprint TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    stale INTEGER NOT NULL DEFAULT 0,
    translated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (novel_id, lang_id, chapter_number)
);
CREATE INDEX IF NOT EXISTS idx_chapters_sequence
    ON chapters(novel_id, lang_id, chapter_number, stale);

-- Entity snapshots. Character is simply one entity type among many.
CREATE TABLE IF NOT EXISTS entities (
    novel_id TEXT NOT NULL,
    lang_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    chapter_number INTEGER NOT NULL,
    entity_type TEXT NOT NULL,
    source_name TEXT NOT NULL,
    canonical_name TEXT NOT NULL,
    aliases_json TEXT NOT NULL DEFAULT '[]',
    description TEXT NOT NULL DEFAULT '',
    biography_json TEXT NOT NULL DEFAULT '{}',
    appearance_json TEXT NOT NULL DEFAULT '{}',
    behavior_json TEXT NOT NULL DEFAULT '{}',
    characteristics_json TEXT NOT NULL DEFAULT '{}',
    first_seen_chapter INTEGER,
    PRIMARY KEY (novel_id, lang_id, entity_id, chapter_number)
);
CREATE INDEX IF NOT EXISTS idx_entities_asof
    ON entities(novel_id, lang_id, entity_id, chapter_number DESC);

-- One temporal relationship state per entity pair. It can connect any entity types.
CREATE TABLE IF NOT EXISTS relationships (
    novel_id TEXT NOT NULL,
    lang_id TEXT NOT NULL,
    relationship_id TEXT NOT NULL,
    chapter_number INTEGER NOT NULL,
    source_entity_id TEXT NOT NULL,
    target_entity_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    direction TEXT NOT NULL DEFAULT 'directed',
    status TEXT NOT NULL DEFAULT 'active',
    PRIMARY KEY (novel_id, lang_id, relationship_id, chapter_number)
);
CREATE INDEX IF NOT EXISTS idx_relationships_asof
    ON relationships(novel_id, lang_id, relationship_id, chapter_number DESC);
CREATE INDEX IF NOT EXISTS idx_relationships_entities
    ON relationships(novel_id, lang_id, source_entity_id, target_entity_id, chapter_number DESC);

-- Translation-choice contract: source term -> canonical rendering.
CREATE TABLE IF NOT EXISTS terminology (
    novel_id TEXT NOT NULL,
    lang_id TEXT NOT NULL,
    term_id TEXT NOT NULL,
    chapter_number INTEGER NOT NULL,
    source_term TEXT NOT NULL,
    canonical_term TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    translation_rule TEXT NOT NULL DEFAULT 'preserve',
    description TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (novel_id, lang_id, term_id, chapter_number)
);
CREATE INDEX IF NOT EXISTS idx_terminology_asof
    ON terminology(novel_id, lang_id, term_id, chapter_number DESC);

-- Lore meaning. Kept separate from terminology so translation rules stay compact.
CREATE TABLE IF NOT EXISTS glossary (
    novel_id TEXT NOT NULL,
    lang_id TEXT NOT NULL,
    glossary_id TEXT NOT NULL,
    chapter_number INTEGER NOT NULL,
    term TEXT NOT NULL,
    definition TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    aliases_json TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (novel_id, lang_id, glossary_id, chapter_number)
);
CREATE INDEX IF NOT EXISTS idx_glossary_asof
    ON glossary(novel_id, lang_id, glossary_id, chapter_number DESC);

-- Broad narrative arc snapshots only, not events/scenes/facts.
CREATE TABLE IF NOT EXISTS arcs (
    novel_id TEXT NOT NULL,
    lang_id TEXT NOT NULL,
    arc_id TEXT NOT NULL,
    chapter_number INTEGER NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    chapter_role TEXT NOT NULL DEFAULT '',
    start_chapter INTEGER,
    end_chapter INTEGER,
    PRIMARY KEY (novel_id, lang_id, arc_id, chapter_number)
);
CREATE INDEX IF NOT EXISTS idx_arcs_asof
    ON arcs(novel_id, lang_id, arc_id, chapter_number DESC);

-- A versioned style contract. Usually tiny, but historical snapshots make changes auditable.
CREATE TABLE IF NOT EXISTS style_profiles (
    novel_id TEXT NOT NULL,
    lang_id TEXT NOT NULL,
    chapter_number INTEGER NOT NULL,
    narration_pov TEXT NOT NULL DEFAULT '',
    tense TEXT NOT NULL DEFAULT '',
    register TEXT NOT NULL DEFAULT '',
    dialogue_style TEXT NOT NULL DEFAULT '',
    honorific_policy TEXT NOT NULL DEFAULT '',
    punctuation TEXT NOT NULL DEFAULT '',
    prose_rhythm TEXT NOT NULL DEFAULT '',
    character_voice_rules_json TEXT NOT NULL DEFAULT '{}',
    do_not_change_json TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (novel_id, lang_id, chapter_number)
);

-- Operational trace; also scoped by novel/language as requested.
CREATE TABLE IF NOT EXISTS translation_runs (
    novel_id TEXT NOT NULL,
    lang_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    start_chapter INTEGER NOT NULL,
    end_chapter INTEGER NOT NULL,
    status TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT,
    PRIMARY KEY (novel_id, lang_id, run_id)
);

-- Persistent translation control-plane queue. Browser refreshes do not own worker lifetime.
CREATE TABLE IF NOT EXISTS translation_jobs (
    job_id TEXT PRIMARY KEY,
    novel_id TEXT NOT NULL,
    lang_id TEXT NOT NULL,
    start_chapter INTEGER NOT NULL,
    end_chapter INTEGER NOT NULL,
    force INTEGER NOT NULL DEFAULT 0,
    allow_context_gap INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','stopping','stopped','completed','failed')),
    pid INTEGER,
    current_chapter INTEGER,
    current_stage TEXT NOT NULL DEFAULT 'queued',
    progress_current INTEGER NOT NULL DEFAULT 0,
    progress_total INTEGER NOT NULL DEFAULT 0,
    processed_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    message TEXT NOT NULL DEFAULT '',
    log_file TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TEXT,
    finished_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_translation_jobs_status
    ON translation_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_translation_jobs_series
    ON translation_jobs(novel_id, lang_id, status, created_at);

CREATE TABLE IF NOT EXISTS translation_job_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    chapter_number INTEGER,
    stage TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    progress_current INTEGER NOT NULL DEFAULT 0,
    progress_total INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES translation_jobs(job_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_translation_job_events_job
    ON translation_job_events(job_id, id DESC);

-- Runtime translation configuration used by the web control plane.
-- Secret values (for example API_KEY) remain server-side and are never serialized to the browser.
CREATE TABLE IF NOT EXISTS translation_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    is_secret INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
