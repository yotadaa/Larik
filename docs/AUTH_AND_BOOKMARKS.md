# Authentication, sessions and reader ownership

Updated 2026-09-28.

## Current account model

A reader must register with an email address and password before signing in. The email is the account
identifier; this release does not send mail and therefore does not prove mailbox ownership.
`email_verified_at` remains `NULL` until a future verification system actually proves ownership.

Passwords are normalized with Unicode NFC, limited to 12–128 characters, salted independently and
stored as PBKDF2-HMAC-SHA256 derived hashes (600,000 iterations). Plaintext passwords are never stored.
Cloudflare Workers Web Crypto performs the password derivation. Sessions use 256-bit opaque random
tokens; only SHA-256 token hashes are stored in D1. Cookies are HttpOnly, SameSite=Lax, Path=/ and
Secure on HTTPS.

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
