// Multi-user auth for the Worker: email+password (PBKDF2 via Web Crypto),
// sessions stored in D1, delivered as an HttpOnly cookie.

// PBKDF2 iterations. 100k is secure but ~45ms CPU — over the Workers FREE
// 10ms/req limit. Set PBKDF2_ITERATIONS lower on free, or use the Paid plan.
// The count used is stored per-user so changing the default never breaks logins.
export const DEFAULT_ITERATIONS = 100000;
const SESSION_DAYS = 30;

const enc = (s) => new TextEncoder().encode(s);
const bytesToB64 = (b) => btoa(String.fromCharCode(...b));
const b64ToBytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function safeEq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", enc(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  return bytesToB64(new Uint8Array(bits));
}

export async function hashPassword(password, iterations = DEFAULT_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { hash: await pbkdf2(password, salt, iterations), salt: bytesToB64(salt), iter: iterations };
}

export async function verifyPassword(password, saltB64, hashB64, iterations) {
  try { return safeEq(await pbkdf2(password, b64ToBytes(saltB64), iterations), hashB64); }
  catch { return false; }
}

const randomToken = () => bytesToB64(crypto.getRandomValues(new Uint8Array(24))).replace(/[+/=]/g, "");

// --- users + sessions (D1) ------------------------------------------------ //
export function normalizeEmail(e) { return String(e || "").trim().toLowerCase(); }

export async function createUser(env, email, password, iterations = DEFAULT_ITERATIONS) {
  email = normalizeEmail(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email.");
  if (!password || password.length < 8) throw new Error("Password must be at least 8 characters.");
  const exists = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
  if (exists) throw new Error("That email is already registered.");
  const { hash, salt, iter } = await hashPassword(password, iterations);
  const r = await env.DB.prepare(
    "INSERT INTO users(email,pw_hash,pw_salt,pw_iter,created) VALUES(?,?,?,?,?)"
  ).bind(email, hash, salt, iter, Date.now()).run();
  return { id: r.meta.last_row_id, email };
}

export async function authenticate(env, email, password) {
  const u = await env.DB.prepare("SELECT * FROM users WHERE email=?").bind(normalizeEmail(email)).first();
  if (!u) return null;
  return (await verifyPassword(password, u.pw_salt, u.pw_hash, u.pw_iter || DEFAULT_ITERATIONS))
    ? { id: u.id, email: u.email } : null;
}

export async function createSession(env, userId) {
  const token = randomToken();
  const expires = Date.now() + SESSION_DAYS * 864e5;
  await env.DB.prepare("INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)").bind(token, userId, expires).run();
  return token;
}

export async function userFromRequest(env, request) {
  const token = readCookie(request, "session");
  if (!token) return null;
  const s = await env.DB.prepare("SELECT * FROM sessions WHERE token=?").bind(token).first();
  if (!s || s.expires < Date.now()) return null;
  const u = await env.DB.prepare("SELECT id,email FROM users WHERE id=?").bind(s.user_id).first();
  return u || null;
}

export async function destroySession(env, request) {
  const token = readCookie(request, "session");
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token=?").bind(token).run();
}

// --- cookies -------------------------------------------------------------- //
function readCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export function sessionCookie(token, secure) {
  const flags = `HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure ? "; Secure" : ""}`;
  return `session=${token}; ${flags}`;
}
export function clearCookie(secure) {
  return `session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? "; Secure" : ""}`;
}
