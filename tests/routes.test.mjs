import assert from "node:assert/strict";
import { hrefChapter, hrefNovel, hrefReference, readPositiveInt, readSearchParam, validateRouteSegment } from "../app/lib/params.ts";

assert.equal(validateRouteSegment("002-rain & iron!.md", "chapter id"), "002-rain & iron!.md");
assert.throws(() => validateRouteSegment("../secret", "chapter id"));
assert.throws(() => validateRouteSegment("a/b", "chapter id"));
assert.equal(hrefNovel("a regressor's tale"), "/novels/a%20regressor's%20tale");
assert.equal(hrefChapter("novel", "002-rain & iron!.md"), "/novels/novel/chapters/002-rain%20%26%20iron!.md");
assert.equal(hrefReference("novel", "qa"), "/novels/novel/reference/qa");
assert.equal(readPositiveInt("-5"), 1);
assert.equal(readPositiveInt("3"), 3);
assert.equal(readSearchParam("  hello  "), "hello");
console.log("route validation tests: PASS");
