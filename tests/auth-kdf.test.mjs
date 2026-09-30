import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createDurablePasswordKdf } from "../app/lib/auth-kdf.server.ts";
import { PASSWORD_ITERATIONS } from "../app/lib/auth.server.ts";
import { handlePasswordKdfRequest } from "../app/lib/password-kdf-core.ts";

function namespaceFor(handler) {
  const names = [];
  return {
    names,
    namespace: {
      idFromName(name) { names.push(name); return name; },
      get() { return { fetch: handler }; },
    },
  };
}

test("durable KDF client shards by account and never falls back when binding is missing", async () => {
  assert.throws(() => createDurablePasswordKdf(undefined), /AUTH_KDF Durable Object binding is missing/);
  const seen = [];
  const { names, namespace } = namespaceFor(async (input, init) => {
    seen.push({ input: String(input), body: JSON.parse(init.body) });
    if (String(input).endsWith("/hash")) {
      return Response.json({ hash: "a".repeat(64), salt: "b".repeat(32), iterations: PASSWORD_ITERATIONS });
    }
    return Response.json({ valid: true });
  });
  const kdf = createDurablePasswordKdf(namespace);
  const record = await kdf.hash("a sufficiently long password", "reader@example.com");
  assert.equal(record.iterations, PASSWORD_ITERATIONS);
  assert.equal(await kdf.verify("a sufficiently long password", record.hash, record.salt, record.iterations, "reader@example.com"), true);
  assert.deepEqual(names, ["password-kdf:reader@example.com", "password-kdf:reader@example.com"]);
  assert.equal(seen[0].body.password, "a sufficiently long password");
});

test("Durable Object endpoint performs the existing PBKDF2 format so deployed accounts stay compatible", async () => {
  const password = "correct horse battery staple";
  const hashResponse = await handlePasswordKdfRequest(new Request("https://kdf.internal/hash", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  }));
  assert.equal(hashResponse.status, 200);
  const record = await hashResponse.json();
  assert.equal(record.iterations, PASSWORD_ITERATIONS);
  assert.match(record.hash, /^[a-f0-9]{64}$/);
  assert.match(record.salt, /^[a-f0-9]{32}$/);

  const verify = await handlePasswordKdfRequest(new Request("https://kdf.internal/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, ...record }),
  }));
  assert.deepEqual(await verify.json(), { valid: true });
});

test("Durable Object endpoint rejects malformed input without echoing secrets", async () => {
  const response = await handlePasswordKdfRequest(new Request("https://kdf.internal/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "this should never come back" }),
  }));
  assert.equal(response.status, 400);
  const text = await response.text();
  assert.doesNotMatch(text, /this should never come back/);
});


test("wrangler config binds the free-tier Durable Object KDF and enables persisted logs", () => {
  const config = JSON.parse(fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  assert.ok(config.durable_objects?.bindings?.some((binding) => binding.name === "AUTH_KDF" && binding.class_name === "PasswordKdf"));
  assert.equal(config.exports?.PasswordKdf?.type, "durable-object");
  assert.equal(config.exports?.PasswordKdf?.storage, "sqlite");
  assert.equal(config.observability?.enabled, true);
  assert.equal(config.observability?.head_sampling_rate, 1);
});
