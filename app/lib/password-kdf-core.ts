import { hashPassword, verifyPassword } from "./auth.server.ts";

const NO_STORE_HEADERS = { "Cache-Control": "no-store", "Content-Type": "application/json" } as const;

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: NO_STORE_HEADERS });
}

function safeJsonBody(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function handlePasswordKdfRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON payload." }, 400);
  }
  if (!safeJsonBody(payload) || typeof payload.password !== "string") {
    return json({ error: "Invalid password payload." }, 400);
  }

  const path = new URL(request.url).pathname;
  if (path === "/hash") {
    return json(await hashPassword(payload.password));
  }
  if (path === "/verify") {
    if (typeof payload.hash !== "string" || typeof payload.salt !== "string" || !Number.isInteger(payload.iterations)) {
      return json({ error: "Invalid verification payload." }, 400);
    }
    return json({
      valid: await verifyPassword(payload.password, payload.hash, payload.salt, Number(payload.iterations)),
    });
  }
  return json({ error: "Not found." }, 404);
}
