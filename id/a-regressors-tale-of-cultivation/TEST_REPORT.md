# Test report - Ruang Baca

## Result

| Catatan | **97 assertions passed, 0 failed** across the main and additional suites. Results are in `tests/results.json`; test scripts and original source checksums are included. |

## What was actually exercised
| Status | Description |
|---|---|
| Catatan | Data discovery: 39 Markdown, 16 chapters, 14 recaps; 58 glossary rows grouped as 55 entries. |
| Catatan | Registry-based navigation, chapter 16 omitted from source index, missing recaps 9/13, and 9 reported data issues. |
| Catatan | All 16 chapters compared against independently rendered source prose using markdown-it-py plus an HTML text parser; text matched after whitespace normalization. |
| Catatan | Spoiler gates for unread recaps, global descriptions, character notes, source access, and all-story search consent. |
| Catatan | Bookmarks, note creation/editing, selected quotes with paragraph anchors, reading-position restoration, and serialized local state reload. |
| Catatan | Backup JSON/Markdown export content, confirmed backup import, and rejection of another novel's backup. |
| Catatan | ZIP and folder imports; generic template with a different two-chapter synthetic novel. |
| Catatan | Script/event/image/javascript-link fixtures; no external runtime fetches from the application. This is selected regression coverage, not a complete security audit. |
| Catatan | Theme changes, font/size/leading controls, focus mode, Escape and dialog focus, mobile navigation. |
| Catatan | No page-level horizontal overflow at 320, 390, 768, 1024, and 1440 CSS pixels across the principal views tested. Maximum typography settings were also checked at 320px. |
| Catatan | Primary and secondary reader text color contrast at least 4.5:1 for paper, sepia, and night themes. This does not certify every interactive/component state. |
| Catatan | Print CSS hides navigation and keeps the chapter heading dark; reduced-motion CSS disables transitions. |
| Catatan | Real local HTTP server endpoints: HTML/manifest, live discovery of a temporary chapter, protected paths, and POST rejection. The temporary chapter was removed. |
| Catatan | SHA-256 equality for all 39 original Markdown sources. |

## Test environment and limitations

| Catatan | Chromium was executed through Playwright. Its managed environment blocks URL navigation, so browser DOM tests used local file-response fixtures injected before the unmodified application logic; only the test copy's dataRoot pointed to that fixture provider. A localStorage shim was used because the document origin was about:blank. The real server was separately tested over HTTP using Python requests. No browser policy was changed. |

| Catatan | This is **not a direct end-to-end browser-over-HTTP run**, a Firefox/Safari/device compatibility claim, a human usability study, or complete WCAG conformance testing. Native file selection was exercised via Playwright input APIs. Backup export Blob contents were validated; native download UI, OS permissions, clipboard, and print dialogs were not exhaustively tested. |

| Catatan | The standalone implementation includes Marked 4.0.19 and JSZip 3.10.1, not newly downloaded/latest dependencies. A restrictive inert-DOM reconstruction renderer is used instead of DOMPurify. Review/update dependencies and extend adversarial testing before publishing as a public service. |

## Fixes made during verification

| Catatan | The completed build includes a crypto.getRandomValues fallback for note identifiers, retained tracking after skip navigation, print heading colors independent of night theme, actual registry navigation, preserved source files, and explicit server rejection of encoded parent segments. Test-harness timing and fixture escaping were corrected separately. |

## Visual review

| Catatan | Saved screenshots include desktop home/reader/settings, night reader/settings, mobile home/reader, graph, timeline, search, and the data-quality view. Desktop home, reader, settings, mobile home/reader, and graph images were visually inspected. Screenshots reflect test UI state; temporary notes/progress shown in a test screenshot are not embedded into the application or source novel. |

| Catatan | The same application engine powers both index files. The template adds an agent contract and supports another novel without embedding that novel's content. |
