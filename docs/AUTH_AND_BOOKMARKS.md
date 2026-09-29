# Authentication, sessions and reader ownership

Updated 2026-09-29.

## Current account model

A reader must register with an email address and password before signing in. The email is the account
identifier; this release does not send mail and therefore does not prove mailbox ownership.
`email_verified_at` remains `NULL` until a future verification system actually proves ownership.

Passwords are normalized with Unicode NFC, limited to 12–128 characters, salted independently and
stored as PBKDF2-HMAC-SHA256 derived hashes (600,000 iterations). Plaintext passwords are never stored.
Cloudflare Web Crypto performs the password derivation inside the `PasswordKdf` SQLite-backed Durable
Object. The front Worker never performs the expensive PBKDF2 loop, which keeps password verification
compatible with the Workers Free CPU budget while preserving the existing 600,000-iteration hashes.
Sessions use 256-bit opaque random tokens; only SHA-256 token hashes are stored in D1. Cookies are
HttpOnly, SameSite=Lax, Path=/ and Secure on HTTPS.

## Production Cloudflare authentication path

The production login/register route requires the `AUTH_KDF` Durable Object binding declared in
`wrangler.jsonc`. Calls are sharded by normalized account email and sent only through the internal
Durable Object binding; plaintext passwords are neither stored nor written to application logs.
Existing PBKDF2 records remain compatible because the hash format and iteration count did not change.

`wrangler.jsonc` also enables Workers Observability. Authentication infrastructure failures emit a
structured `console.error` event with a `CF-Ray`/request reference while the browser receives only a
generic 503 message. This avoids leaking D1 or KDF internals to the reader while making production
failures searchable in Workers Logs.

Production deployment now runs the remote D1 schema verifier after the build and before `wrangler
deploy`. If password columns/auth-method schema are missing, deployment stops and instructs the
operator to run `npm run db:migrate:remote`; it does not silently deploy code against an older D1.

Recommended deployment order:

```bash
npm run db:migrate:status
npm run db:migrate:remote   # only when pending
npm run deploy
```

The Durable Object namespace is provisioned by Wrangler from the `exports.PasswordKdf` SQLite
storage declaration during deployment; it is separate from D1 migrations.

## Prototype migration boundary

Migration `0002_verified_identity_progress_knowledge.sql` adds `auth_method` to existing sessions
with the default value `prototype`. `getUser()` accepts only `password` sessions, so old prototype
cookies are disabled for general authenticated use.

A legacy user row may be upgraded only when the browser also presents a still-valid prototype
session belonging to that exact user ID. After setting a password, all old sessions are revoked and
a fresh password session is issued. Knowing a legacy email address alone is intentionally
insufficient to claim its bookmarks.

## Reader-owned data

- `reader_bookmarks`: saved novel/chapter locations.
- `reader_library_state`: shelf status, last chapter ID, progress percentage, bounded sync count, resume-open count and update times.

Ownership always comes from the authenticated session user ID. Client-supplied user IDs are not
accepted. Progress writes are bucketed in the browser at 0, 25, 50, 75, 90 and 100 percent so a
normal chapter session produces at most six progress checkpoints. An explicit Resume action records one additional counter write and restores the saved checkpoint in the browser.

## What is not implemented

- mailbox verification,
- password reset/recovery,
- multi-device session management UI,
- account deletion/export,
- private annotations/highlights.

Add those only with explicit ownership, retention and recovery policies.

## References

OWASP Password Storage Cheat Sheet:
https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

Cloudflare Web Crypto:
https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
