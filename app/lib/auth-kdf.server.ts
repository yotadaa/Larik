import type { PasswordHashRecord, PasswordKdfService } from "./auth.server.ts";

interface DurableObjectStubLike {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStubLike;
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

async function callKdf<T>(
  namespace: DurableObjectNamespaceLike,
  shardKey: string,
  path: "/hash" | "/verify",
  payload: Record<string, unknown>,
): Promise<T> {
  const stub = namespace.get(namespace.idFromName(`password-kdf:${shardKey}`));
  let response: Response;
  try {
    response = await stub.fetch(`https://password-kdf.internal${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new Error(`Password KDF service unavailable: ${errorMessage(error)}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Password KDF service returned HTTP ${response.status} with an unreadable response.`);
  }
  if (!response.ok) {
    const detail = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : `HTTP ${response.status}`;
    throw new Error(`Password KDF service failed: ${detail}`);
  }
  return body as T;
}

export function createDurablePasswordKdf(namespace: DurableObjectNamespaceLike | undefined): PasswordKdfService {
  if (!namespace) {
    throw new Error("AUTH_KDF Durable Object binding is missing. Deploy with the current wrangler.jsonc configuration.");
  }
  return {
    async hash(password, shardKey) {
      const result = await callKdf<PasswordHashRecord>(namespace, shardKey, "/hash", { password });
      if (!result || typeof result.hash !== "string" || typeof result.salt !== "string" || !Number.isInteger(result.iterations)) {
        throw new Error("Password KDF service returned an invalid hash record.");
      }
      return result;
    },
    async verify(password, hash, salt, iterations, shardKey) {
      const result = await callKdf<{ valid?: unknown }>(namespace, shardKey, "/verify", {
        password,
        hash,
        salt,
        iterations,
      });
      if (typeof result?.valid !== "boolean") throw new Error("Password KDF service returned an invalid verification result.");
      return result.valid;
    },
  };
}
