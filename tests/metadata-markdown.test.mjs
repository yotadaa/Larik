import assert from "node:assert/strict";
import test from "node:test";
import { metadataWikilinkHref, prepareMetadataMarkdown } from "../app/lib/metadata-markdown.ts";

const NOVEL = "series-a";

test("chapter wikilinks become internal reader links", () => {
  assert.equal(
    metadataWikilinkHref(NOVEL, "recaps/151-last-chapter"),
    "/novels/series-a/chapters/151-last-chapter.md",
  );
  assert.equal(
    prepareMetadataMarkdown("See [[001-start|the opening]]", NOVEL),
    "See [the opening](/novels/series-a/chapters/001-start.md)",
  );
});

test("metadata wikilinks route to the appropriate reader surface", () => {
  assert.equal(metadataWikilinkHref(NOVEL, "characteristics"), "/novels/series-a/atlas?view=profiles");
  assert.equal(metadataWikilinkHref(NOVEL, "relationships.md"), "/novels/series-a/atlas?view=matrix");
  assert.equal(metadataWikilinkHref(NOVEL, "glossarium"), "/novels/series-a/reference/glossary");
});

test("unknown wikilinks stay readable instead of generating dead links", () => {
  assert.equal(prepareMetadataMarkdown("Met [[Unknown Person|someone]] there.", NOVEL), "Met someone there.");
});

test("stored table line breaks become Markdown line breaks without enabling raw HTML", () => {
  assert.equal(prepareMetadataMarkdown("First<br>Second<br />Third", NOVEL), "First  \nSecond  \nThird");
});
