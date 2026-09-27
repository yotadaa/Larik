/** Shared write boundary. No cookies or tokens are accepted in URL parameters. */
export function assertSameOriginPost(request: Request): void {
  if (request.method !== "POST") {
    throw new Response("Use POST for this operation.", { status: 405, headers: { Allow: "POST" } });
  }
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin || request.headers.get("Sec-Fetch-Site") === "cross-site") {
    throw new Response("This form must be submitted from this site.", { status: 403 });
  }
}

export function safeReturnTo(value: unknown, fallback = "/bookmarks"): string {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    let decoded = value;
    for (let i = 0; i < 3; i++) {
      if (/[\\\u0000-\u001F\u007f]/.test(decoded) || decoded.startsWith("//")) return fallback;
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
    const url = new URL(value, "https://reader.invalid");
    if (url.origin !== "https://reader.invalid" || /^\/(login|logout|register)(?:\/|$)/.test(url.pathname)) return fallback;
    return url.pathname + url.search + url.hash;
  } catch { return fallback; }
}

export function privateJson(value: unknown, status = 200, headers?: HeadersInit) {
  const result = new Headers(headers);
  result.set("Cache-Control", "private, no-store");
  return Response.json(value, { status, headers: result });
}

export function redirectTo(path: string, headers?: HeadersInit) {
  const result = new Headers(headers);
  result.set("Location", path);
  result.set("Cache-Control", "private, no-store");
  return new Response(null, { status: 303, headers: result });
}

export async function readSmallForm(request: Request): Promise<FormData> {
  const type = request.headers.get("Content-Type")?.split(";")[0];
  if (type !== "application/x-www-form-urlencoded") {
    throw new Response("Use a URL-encoded form.", { status: 415 });
  }
  // A stream limit also covers missing/forged Content-Length headers.
  const reader = request.body?.getReader();
  if (!reader) throw new Response("Missing form.", { status: 400 });
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 8192) {
      await reader.cancel();
      throw new Response("Form is too large.", { status: 413 });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const data = new FormData();
  for (const [key, value] of new URLSearchParams(new TextDecoder().decode(bytes))) data.append(key, value);
  return data;
}
