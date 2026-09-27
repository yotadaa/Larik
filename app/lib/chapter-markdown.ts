/** Remove only a recognized document envelope; never discard a fixed number of lines. */
export function parseChapterDocument(source: string): { body: string; notes: string } {
  let body = source.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (body.startsWith("---\n")) {
    const end = body.indexOf("\n---", 4);
    if (end >= 0 && /^\n---(?:\n|$)/.test(body.slice(end))) body = body.slice(end + 4).replace(/^\n+/, "");
  }
  body = body.replace(/^\s*#\s+[^\n]+\n*/, "").replace(/^\n+/, "");
  const lines = body.split("\n");
  // Generated chapter/index navigation is replaced by application controls.
  if (/^\s*\[[^\]]+\]\((?:\.\.\/)?(?:chapters\/)?[^)]*\.md\)/.test(lines[0] ?? "") &&
      /index|indeks|previous|next|sebelum|berikut|chapter|bab/i.test(lines[0])) {
    lines.shift();
    body = lines.join("\n").replace(/^\n+/, "");
  }
  const notes = body.match(/\n##\s+(?:Chapter Notes|Catatan Bab|Catatan Terjemahan)\s*\n/i);
  if (!notes || notes.index === undefined) return { body: body.trim(), notes: "" };
  return {
    body: body.slice(0, notes.index).replace(/\n---\s*$/, "").trim(),
    notes: body.slice(notes.index + notes[0].length).trim(),
  };
}
