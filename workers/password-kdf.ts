import { DurableObject } from "cloudflare:workers";
import { handlePasswordKdfRequest } from "../app/lib/password-kdf-core.ts";

/**
 * PBKDF2 intentionally runs in a Durable Object instead of the front Worker.
 * Workers Free has a very small per-request CPU budget, while Durable Objects
 * provide enough CPU for a deliberately expensive password KDF.
 */
export class PasswordKdf extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    return handlePasswordKdfRequest(request);
  }
}
