import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { directPasswordKdf, getUser, loginAction, logoutAction, normalizeEmail, registerAction, sha256, validatePassword } from "../app/lib/auth.server.ts";
import { bookmarkAction, listBookmarks } from "../app/lib/bookmarks.server.ts";
import { getReaderLibraryState, readerStateAction } from "../app/lib/reader-state.server.ts";
import { safeReturnTo } from "../app/lib/http.server.ts";
import { getChapter } from "../app/lib/repository.ts";

const NOVEL = "a-regressors-tale-of-cultivation";
const CHAPTER = "001-hari-pertama-regresor.md";
function setup() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE novel (id INTEGER PRIMARY KEY, novel_id TEXT, "novel-title" TEXT, lang TEXT);
    CREATE TABLE "novel-content" (id INTEGER PRIMARY KEY, path TEXT DEFAULT '', name TEXT DEFAULT '', type TEXT DEFAULT '', lang TEXT DEFAULT '', "novel-id" TEXT, "novel-title" TEXT DEFAULT '', content TEXT, "chapter-id" TEXT, "chapter-title" TEXT, recap TEXT DEFAULT '');
    INSERT INTO novel VALUES(1,'${NOVEL}','A Regressor''s Tale of Cultivation','id');
    INSERT INTO "novel-content"(id,"novel-id","chapter-id","chapter-title",content) VALUES
      (1,'${NOVEL}','${CHAPTER}','Hari Pertama Sang Regresor','chapter one'),
      (2,'${NOVEL}','002-takdir-yang-tersebar.md','Takdir yang Tersebar (1)','chapter two'),
      (3,'${NOVEL}','003-takdir-yang-tersebar.md','Takdir yang Tersebar (2)','chapter three');`);
  sqlite.exec(fs.readFileSync(new URL("../migrations/0001_reader_accounts.sql", import.meta.url), "utf8"));
  sqlite.exec(fs.readFileSync(new URL("../migrations/0002_verified_identity_progress_knowledge.sql", import.meta.url), "utf8"));
  const db = { prepare(sql) { const statement = sqlite.prepare(sql); let values = []; return { bind(...input) { values = input; return this; }, async first() { return statement.get(...values) ?? null; }, async all() { return { results: statement.all(...values) }; } }; } };
  return { sqlite, db };
}
function post(path, fields, cookie = "") {
  return new Request(`https://reader.test${path}`, { method: "POST", headers: { Origin: "https://reader.test", "Content-Type": "application/x-www-form-urlencoded", ...(cookie ? { Cookie: cookie } : {}) }, body: new URLSearchParams(fields) });
}
const read = (path, cookie = "") => new Request(`https://reader.test${path}`, { headers: cookie ? { Cookie: cookie } : {} });
const cookieFrom = (response) => response.headers.get("Set-Cookie")?.split(";")[0] ?? "";
const PASSWORD = "correct horse battery staple";

async function register(db, email = "reader@example.com") {
  const response = await registerAction(db, post("/register", { email, password: PASSWORD, confirmPassword: PASSWORD, returnTo: "/bookmarks" }), directPasswordKdf);
  assert.equal(response.status, 303);
  return cookieFrom(response);
}

test("registration requires a real password policy and confirmation", async () => {
  assert.equal(normalizeEmail(" Reader+Tag@Example.COM "), "reader+tag@example.com");
  assert.equal(validatePassword("short"), null);
  assert.equal(validatePassword(PASSWORD), PASSWORD);
  const { db } = setup();
  assert.equal((await registerAction(db, post("/register", { email: "reader@example.com", password: "short", confirmPassword: "short" }), directPasswordKdf)).status, 400);
  assert.equal((await registerAction(db, post("/register", { email: "reader@example.com", password: PASSWORD, confirmPassword: `${PASSWORD}!` }), directPasswordKdf)).status, 400);
});

test("registered account signs in with password; wrong password and blind email fail", async () => {
  const { db, sqlite } = setup();
  const cookie = await register(db);
  const user = await getUser(db, read("/bookmarks", cookie));
  assert.equal(user.email, "reader@example.com");
  const stored = sqlite.prepare("SELECT password_hash,password_salt,password_iterations,registered_at,email_verified_at FROM reader_users").get();
  assert.notEqual(stored.password_hash, PASSWORD);
  assert.equal(stored.password_hash.length, 64);
  assert.ok(stored.password_iterations >= 600000);
  assert.ok(stored.registered_at > 0);
  assert.equal(stored.email_verified_at, null);
  assert.equal((await loginAction(db, post("/login", { email: "reader@example.com", password: "a wrong password that is long" }), directPasswordKdf)).status, 401);
  assert.equal((await loginAction(db, post("/login", { email: "reader@example.com" }), directPasswordKdf)).status, 400);
  const loggedIn = await loginAction(db, post("/login", { email: "reader@example.com", password: PASSWORD }), directPasswordKdf);
  assert.equal(loggedIn.status, 303);
  assert.ok(cookieFrom(loggedIn));
});

test("prototype sessions are disabled for normal access but can safely upgrade their own stable user", async () => {
  const { db, sqlite } = setup();
  const token = "a".repeat(64);
  const hash = await sha256(token);
  sqlite.prepare("INSERT INTO reader_users(id,email,created_at) VALUES(?,?,?)").run("legacy", "legacy@example.com", 1);
  sqlite.prepare("INSERT INTO reader_sessions(token_hash,user_id,created_at,expires_at,auth_method) VALUES(?,?,?,?,?)").run(hash, "legacy", 1, 9999999999, "prototype");
  sqlite.prepare("INSERT INTO reader_bookmarks(user_id,novel_id,chapter_id,created_at) VALUES(?,?,?,?)").run("legacy", NOVEL, CHAPTER, 1);
  const prototypeCookie = `__Host-reader_session=${token}`;
  assert.equal(await getUser(db, read("/bookmarks", prototypeCookie)), null);
  const rejected = await registerAction(db, post("/register", { email: "legacy@example.com", password: PASSWORD, confirmPassword: PASSWORD }), directPasswordKdf);
  assert.equal(rejected.status, 409);
  const upgraded = await registerAction(db, post("/register", { email: "legacy@example.com", password: PASSWORD, confirmPassword: PASSWORD }, prototypeCookie), directPasswordKdf);
  assert.equal(upgraded.status, 303);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM reader_bookmarks WHERE user_id='legacy'").get().n, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM reader_sessions WHERE user_id='legacy' AND auth_method='prototype'").get().n, 0);
  assert.equal((await getUser(db, read("/bookmarks", cookieFrom(upgraded)))).id, "legacy");
});

test("progress and shelf state persist in D1 with bounded writes", async () => {
  const { db } = setup();
  const cookie = await register(db);
  let response = await readerStateAction(db, post("/reader-state", { intent: "progress", novelId: NOVEL, chapterId: CHAPTER, percent: "50" }, cookie));
  assert.equal(response.status, 200);
  const user = await getUser(db, read("/bookmarks", cookie));
  let state = await getReaderLibraryState(db, user.id, NOVEL);
  assert.deepEqual(
    { status: state.status, lastChapterId: state.lastChapterId, progressPercent: state.progressPercent, progressSyncCount: state.progressSyncCount, resumeOpenCount: state.resumeOpenCount },
    { status: "reading", lastChapterId: CHAPTER, progressPercent: 50, progressSyncCount: 1, resumeOpenCount: 0 },
  );
  response = await readerStateAction(db, post("/reader-state", { intent: "resume-open", novelId: NOVEL, chapterId: CHAPTER }, cookie));
  assert.equal(response.status, 200);
  state = await getReaderLibraryState(db, user.id, NOVEL);
  assert.equal(state.resumeOpenCount, 1);
  assert.ok(state.lastResumedAt > 0);
  response = await readerStateAction(db, post("/reader-state", { intent: "status", novelId: NOVEL, status: "paused" }, cookie));
  assert.equal(response.status, 200);
  state = await getReaderLibraryState(db, user.id, NOVEL);
  assert.equal(state.status, "paused");
  assert.equal(state.lastChapterId, CHAPTER);
  assert.equal(state.progressSyncCount, 1);
});

test("chapter navigation is resolved inside D1 rather than loading the whole chapter list", async () => {
  const { db } = setup();
  const navigation = await getChapter(db, NOVEL, "002-takdir-yang-tersebar.md");
  assert.equal(navigation.current.chapterId, "002-takdir-yang-tersebar.md");
  assert.equal(navigation.previous.chapterId, CHAPTER);
  assert.equal(navigation.next.chapterId, "003-takdir-yang-tersebar.md");
});

test("bookmarks remain isolated behind password sessions", async () => {
  const { db } = setup();
  const alice = await register(db, "alice@example.com");
  const bob = await register(db, "bob@example.com");
  assert.equal((await bookmarkAction(db, post("/bookmarks", { intent: "save", novelId: NOVEL, chapterId: CHAPTER }, alice))).status, 200);
  const aliceUser = await getUser(db, read("/bookmarks", alice));
  const bobUser = await getUser(db, read("/bookmarks", bob));
  assert.equal((await listBookmarks(db, aliceUser.id)).total, 1);
  assert.equal((await listBookmarks(db, bobUser.id)).total, 0);
});

test("logout revokes the current password session and safe redirects avoid auth loops", async () => {
  const { db } = setup(); const cookie = await register(db);
  assert.equal(safeReturnTo("/register?returnTo=/private"), "/bookmarks");
  const response = await logoutAction(db, post("/logout", {}, cookie));
  assert.equal(response.status, 303);
  assert.equal(await getUser(db, read("/bookmarks", cookie)), null);
});
