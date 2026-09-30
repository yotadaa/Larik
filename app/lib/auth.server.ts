import type { D1DatabaseLike } from "./repository.ts";
import { assertSameOriginPost, privateJson, readSmallForm, redirectTo, safeReturnTo } from "./http.server.ts";

export interface ReaderUser {
  id: string;
  email: string;
  emailVerified: boolean;
  registeredAt: number;
}

export const SESSION_SECONDS = 60 * 60 * 24 * 30;
export const PASSWORD_ITERATIONS = 600_000;

export interface PasswordHashRecord {
  hash: string;
  salt: string;
  iterations: number;
}

export interface PasswordKdfService {
  hash(password: string, shardKey: string): Promise<PasswordHashRecord>;
  verify(password: string, hash: string, salt: string, iterations: number, shardKey: string): Promise<boolean>;
}
const LOGIN_WINDOW_SECONDS = 15 * 60;
const MAX_LOGIN_ATTEMPTS = 20;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;

export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(email)) return null;
  const [local, domain] = email.split("@");
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || email.includes("..")) return null;
  if (domain.split(".").some((part) => part.length > 63 || part.startsWith("-") || part.endsWith("-"))) return null;
  return email;
}

export function validatePassword(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const password = input.normalize("NFC");
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) return null;
  return password;
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
const fromHex = (value: string) => {
  if (!/^[a-f0-9]+$/i.test(value) || value.length % 2) return new Uint8Array();
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
};

export async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(new Uint8Array(bytes));
}

async function derivePassword(password: string, salt: Uint8Array<ArrayBufferLike>, iterations: number): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const saltBuffer = Uint8Array.from(salt).buffer;
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations = PASSWORD_ITERATIONS): Promise<PasswordHashRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt, iterations);
  return { hash: toHex(hash), salt: toHex(salt), iterations };
}

export async function verifyPassword(password: string, hash: string, salt: string, iterations: number): Promise<boolean> {
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 2_000_000) return false;
  const expected = fromHex(hash);
  const saltBytes = fromHex(salt);
  if (expected.length !== 32 || saltBytes.length < 16) return false;
  const actual = await derivePassword(password, saltBytes, iterations);
  const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual?: (a: BufferSource, b: BufferSource) => boolean };
  if (typeof subtle.timingSafeEqual === "function") {
    const actualBuffer = Uint8Array.from(actual).buffer;
    const expectedBuffer = Uint8Array.from(expected).buffer;
    return subtle.timingSafeEqual(actualBuffer, expectedBuffer);
  }
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= actual[i] ^ expected[i];
  return difference === 0;
}

export const directPasswordKdf: PasswordKdfService = {
  hash: (password) => hashPassword(password),
  verify: (password, hash, salt, iterations) => verifyPassword(password, hash, salt, iterations),
};

function cookieName(request: Request) {
  return new URL(request.url).protocol === "https:" ? "__Host-reader_session" : "reader_session";
}

export function sessionCookie(request: Request, token: string, clear = false): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${cookieName(request)}=${clear ? "" : token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : SESSION_SECONDS}${secure}`;
}

function readToken(request: Request): string | null {
  const entries = (request.headers.get("Cookie") ?? "").split(";");
  const prefix = `${cookieName(request)}=`;
  const matches = entries.map((entry) => entry.trim()).filter((entry) => entry.startsWith(prefix));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(prefix.length);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export async function getUser(db: D1DatabaseLike, request: Request, now = Math.floor(Date.now() / 1000)): Promise<ReaderUser | null> {
  const token = readToken(request);
  if (!token) return null;
  const row = await db.prepare(`
    SELECT u.id, u.email, u.email_verified_at, u.registered_at
    FROM reader_sessions s JOIN reader_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
      AND s.auth_method = 'password' AND u.password_hash IS NOT NULL AND u.registered_at IS NOT NULL
  `).bind(await sha256(token), now).first<{ id: string; email: string; email_verified_at: number | null; registered_at: number }>();
  return row ? { id: row.id, email: row.email, emailVerified: row.email_verified_at !== null, registeredAt: row.registered_at } : null;
}

export async function requireUser(db: D1DatabaseLike, request: Request): Promise<ReaderUser> {
  const user = await getUser(db, request);
  if (!user) {
    const url = new URL(request.url);
    throw redirectTo(`/login?returnTo=${encodeURIComponent(safeReturnTo(url.pathname + url.search))}`);
  }
  return user;
}

export async function revokeSession(db: D1DatabaseLike, request: Request) {
  const token = readToken(request);
  if (token) await db.prepare("DELETE FROM reader_sessions WHERE token_hash = ? RETURNING token_hash").bind(await sha256(token)).first();
}

async function legacyPrototypeUser(db: D1DatabaseLike, request: Request, now = Math.floor(Date.now() / 1000)) {
  const token = readToken(request);
  if (!token) return null;
  return db.prepare(`
    SELECT u.id, u.email
    FROM reader_sessions s JOIN reader_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND s.auth_method = 'prototype'
      AND u.password_hash IS NULL
  `).bind(await sha256(token), now).first<{ id: string; email: string }>();
}

async function createPasswordSession(db: D1DatabaseLike, request: Request, userId: string, now = Math.floor(Date.now() / 1000)) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  await db.prepare(`INSERT INTO reader_sessions (token_hash, user_id, created_at, expires_at, auth_method)
    VALUES (?, ?, ?, ?, 'password') RETURNING token_hash`).bind(await sha256(token), userId, now, now + SESSION_SECONDS).first();
  return sessionCookie(request, token);
}

export async function consumeLoginAttempt(
  db: D1DatabaseLike,
  request: Request,
  now = Math.floor(Date.now() / 1000),
  purpose: "login" | "register" = "login",
) {
  const bucket = Math.floor(now / LOGIN_WINDOW_SECONDS);
  const key = await sha256(`${purpose}:${bucket}:${request.headers.get("CF-Connecting-IP") ?? "local-development"}`);
  const expiresAt = (bucket + 1) * LOGIN_WINDOW_SECONDS;
  const row = await db.prepare(`
    INSERT INTO reader_login_limits (bucket_key, attempts, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(bucket_key) DO UPDATE SET attempts = attempts + 1
    WHERE attempts < ? RETURNING attempts
  `).bind(key, expiresAt, MAX_LOGIN_ATTEMPTS).first();
  return { allowed: Boolean(row), retryAfter: Math.max(1, expiresAt - now) };
}

export async function registerAction(db: D1DatabaseLike, request: Request, kdf: PasswordKdfService) {
  assertSameOriginPost(request);
  const attempt = await consumeLoginAttempt(db, request, undefined, "register");
  if (!attempt.allowed) return privateJson({ error: "Too many registration attempts. Please try again later." }, 429, { "Retry-After": String(attempt.retryAfter) });
  const form = await readSmallForm(request);
  const email = normalizeEmail(form.get("email"));
  const password = validatePassword(form.get("password"));
  const confirmation = validatePassword(form.get("confirmPassword"));
  if (!email) return privateJson({ error: "Enter a valid email address." }, 400);
  if (!password) return privateJson({ error: `Use a password between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.` }, 400);
  if (confirmation !== password) return privateJson({ error: "Passwords do not match." }, 400);

  const now = Math.floor(Date.now() / 1000);
  const existing = await db.prepare(`SELECT id, email, password_hash FROM reader_users WHERE email = ? COLLATE NOCASE LIMIT 1`)
    .bind(email).first<{ id: string; email: string; password_hash: string | null }>();
  let userId: string;
  if (existing?.password_hash) return privateJson({ error: "An account with this email is already registered. Sign in instead." }, 409);
  let legacy: { id: string; email: string } | null = null;
  if (existing) {
    legacy = await legacyPrototypeUser(db, request, now);
    if (!legacy || legacy.id !== existing.id) {
      return privateJson({ error: "This email has legacy prototype data. For safety it cannot be claimed by email alone. Sign in from the browser that still holds the prototype session or use a different email." }, 409);
    }
  }
  const passwordRecord = await kdf.hash(password, email);

  if (existing) {
    // Prototype data is preserved, but email knowledge alone is not enough to claim it. A still-valid
    // prototype session is required for this one-time upgrade; the session is revoked immediately.
    userId = existing.id;
    await db.prepare(`UPDATE reader_users
      SET password_hash = ?, password_salt = ?, password_iterations = ?, registered_at = ?
      WHERE id = ? RETURNING id`).bind(passwordRecord.hash, passwordRecord.salt, passwordRecord.iterations, now, userId).first();
  } else {
    userId = crypto.randomUUID();
    await db.prepare(`INSERT INTO reader_users
      (id, email, email_verified_at, created_at, password_hash, password_salt, password_iterations, registered_at)
      VALUES (?, ?, NULL, ?, ?, ?, ?, ?) RETURNING id`)
      .bind(userId, email, now, passwordRecord.hash, passwordRecord.salt, passwordRecord.iterations, now).first();
  }

  await db.prepare("DELETE FROM reader_sessions WHERE user_id = ? RETURNING token_hash").bind(userId).all();
  const cookie = await createPasswordSession(db, request, userId, now);
  return redirectTo(safeReturnTo(form.get("returnTo")), { "Set-Cookie": cookie });
}

export async function loginAction(db: D1DatabaseLike, request: Request, kdf: PasswordKdfService) {
  assertSameOriginPost(request);
  const attempt = await consumeLoginAttempt(db, request);
  if (!attempt.allowed) return privateJson({ error: "Too many sign-in attempts. Please try again later." }, 429, { "Retry-After": String(attempt.retryAfter) });
  const form = await readSmallForm(request);
  const email = normalizeEmail(form.get("email"));
  const password = validatePassword(form.get("password"));
  if (!email || !password) return privateJson({ error: "Email or password is incorrect." }, 400);
  const row = await db.prepare(`
    SELECT id, password_hash, password_salt, password_iterations, registered_at
    FROM reader_users WHERE email = ? COLLATE NOCASE LIMIT 1
  `).bind(email).first<{ id: string; password_hash: string | null; password_salt: string | null; password_iterations: number | null; registered_at: number | null }>();
  if (!row?.password_hash || !row.password_salt || !row.password_iterations || !row.registered_at
      || !(await kdf.verify(password, row.password_hash, row.password_salt, row.password_iterations, email))) {
    return privateJson({ error: "Email or password is incorrect." }, 401);
  }
  await revokeSession(db, request);
  const cookie = await createPasswordSession(db, request, row.id);
  return redirectTo(safeReturnTo(form.get("returnTo")), { "Set-Cookie": cookie });
}

export async function logoutAction(db: D1DatabaseLike, request: Request) {
  assertSameOriginPost(request);
  await revokeSession(db, request);
  return redirectTo("/", { "Set-Cookie": sessionCookie(request, "", true) });
}

export async function cleanupAuth(db: D1DatabaseLike, now = Math.floor(Date.now() / 1000)) {
  await db.prepare("DELETE FROM reader_sessions WHERE expires_at <= ?").bind(now).all();
  await db.prepare("DELETE FROM reader_login_limits WHERE expires_at <= ?").bind(now).all();
}
