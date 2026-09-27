# Source audit and preservation

The uploaded `app.zip` was extracted into a working directory without modifying the upload.
All 333 top-level-archive Markdown files were decoded and read, including the project
instructions, prior plans, schema/workflow conventions, chapter prose, recap files, glossary,
characters, places, terminology, continuity and QA notes. A path/hash/line/heading inventory is
retained in `evidence/source-audit.json`.

The nested corpus ZIP was extracted separately and its 39 Markdown files were read.
That older snapshot was not overlaid on the current 151-chapter workspace. The original nested
archive remains preserved as supplied; it is not the runtime data source.

## Preservation checks

- All 313 original Markdown files under `id/` are byte-identical to the upload.
- The corpus import reads 151 chapters and 150 available recaps. It does not rewrite source files.
- Original `AGENTS.md`, `CLAUDE.md`, translation templates and editorial convention documents are
  retained. No chapter translation or canonical glossary wording was rewritten.
- Original Markdown intentionally updated: `IMPLEMENTATION_PLAN.md`, `README.md`, `VERIFICATION.md`.
  The old implementation/verification narratives are retained below a historical notice; README
  now documents the restored scripts and this release.

## Missing or generated input artifacts

The upload lacked the referenced `scripts/` directory, the migration implementation, dependency
lockfile, installed packages and GitNexus runner/index. The local schema/fixture/import and checks
were restored from the application repository contract and actual corpus, with regression tests.
No live production schema was silently assumed verified.

The supplied compiled `build/` tree included local runtime configuration. It was neither used as
updated application source nor copied into the deliverable. Only its non-secret JavaScript runtime
assets were reused outside the deliverable for explicitly isolated component evaluation. Credential
values were not needed. Old compiled output, `.dev.vars`, local environment files, caches, local
D1 state, build-info files and test-only recovered runtimes are excluded from the release archives.

See `CHANGE_MANIFEST.md` for the complete source change list and `EVALUATION.md` for the verification
boundary. The original input archive remains untouched.
