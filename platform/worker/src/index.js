// Ad Studio on Cloudflare Workers — multi-user (accounts + sessions, per-user data).
import HTML from "./index.html";
import { caps, generateImage } from "./providers.js";
import * as db from "./db.js";
import * as auth from "./auth.js";
import { generateConcepts, generatePersonas } from "./generate.js";
import { scoreAds } from "./ssr.js";

const json = (o, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...extraHeaders } });

async function loadConfig(env, userId) {
  const s = await db.getSettings(env, userId);
  const pick = (k, e) => s[k] || env[e] || "";
  const cfg = {
    anthropic_api_key: pick("anthropic_api_key", "ANTHROPIC_API_KEY"),
    anthropic_model: pick("anthropic_model", "ANTHROPIC_MODEL"),
    embedding_provider: s.embedding_provider || env.EMBEDDING_PROVIDER || "voyage",
    voyage_api_key: pick("voyage_api_key", "VOYAGE_API_KEY"),
    voyage_model: pick("voyage_model", "VOYAGE_MODEL"),
    openai_api_key: pick("openai_api_key", "OPENAI_API_KEY"),
    openai_embedding_model: pick("openai_embedding_model", "OPENAI_EMBEDDING_MODEL"),
    image_model: pick("image_model", "IMAGE_MODEL"),
  };
  const c = caps(cfg);
  cfg.__llm = c.llm; cfg.__emb = c.embeddings; cfg.__img = c.images;
  return cfg;
}

const brandOf = (p) => ({ name: p.name || "", url: p.url || "", description: p.description || "", target_customer: p.target_customer || "" });
const modeOf = (cfg) => (caps(cfg).ssr_live ? "live" : "demo");

async function persist(env, userId, brand, ranked, source) {
  const pid = await db.upsertProject(env, userId, brand);
  const ids = await db.saveAds(env, userId, pid, ranked, source);
  ranked.forEach((a, i) => { a.db_id = ids[i]; a.project_id = pid; });
  return ranked;
}

async function apiGenerate(env, userId, cfg, p) {
  const brand = brandOf(p);
  if (!brand.description) return { error: "Tell me what your business is about." };
  const concepts = await generateConcepts(cfg, brand, +(p.n_concepts || 6), { references: p.references || null });
  const personas = await generatePersonas(cfg, brand, +(p.n_personas || 10));
  const ranked = await persist(env, userId, brand, await scoreAds(cfg, concepts, personas), "generated");
  return { mode: modeOf(cfg), ads: ranked };
}

async function apiRank(env, userId, cfg, p) {
  const brand = brandOf(p);
  const ads = (p.ads || []).map((a, i) => ({ id: a.id || `a${i + 1}`, name: a.name || (a.headline || `Ad ${i + 1}`).slice(0, 40), ...a }));
  if (!ads.length) return { error: "Add at least one ad to rank." };
  const personas = await generatePersonas(cfg, brand, +(p.n_personas || 10));
  const ranked = await persist(env, userId, brand, await scoreAds(cfg, ads, personas), "ranked");
  return { mode: modeOf(cfg), ads: ranked };
}

async function apiRender(env, userId, cfg, p) {
  const prompt = `High-converting ${p.angle || ""} social ad image. Headline on image: "${p.headline || ""}". Visual: ${p.description || ""}. Clean, native, scroll-stopping.`;
  let image;
  try { image = await generateImage(cfg, prompt); }
  catch (e) { return { error: `Image generation failed: ${e.message}` }; }
  if (p.db_id) await db.setAdImage(env, userId, p.db_id, image);
  return { image, live: caps(cfg).images };
}

function parseCsv(text) {
  if (!text || !text.trim()) return [];
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ",") { cells.push(cur); cur = ""; } else cur += ch;
    }
    cells.push(cur); rows.push(cells);
  }
  const headers = rows.shift().map((h) => h.toLowerCase().trim());
  const find = (...c) => { for (const cand of c) { const i = headers.findIndex((h) => h.includes(cand)); if (i >= 0) return i; } return -1; };
  const nameI = find("ad name", "ad set name", "campaign name", "name");
  const roasI = find("roas", "return on ad spend", "purchase value");
  const resI = find("result", "purchase", "conversion");
  const metI = roasI >= 0 ? roasI : resI;
  if (nameI < 0 || metI < 0) return [];
  const out = [];
  for (const r of rows) {
    const name = (r[nameI] || "").trim();
    const metric = parseFloat((r[metI] || "").replace(/[$,]/g, "").trim());
    if (name && !isNaN(metric)) out.push({ name, metric, metric_name: roasI >= 0 ? "ROAS" : "results" });
  }
  return out;
}

async function apiResults(env, userId, cfg, p) {
  const rows = parseCsv(p.csv || "");
  if (!rows.length) return { error: "Couldn't find ad rows with a name and a ROAS/result column." };
  const brand = brandOf(p);
  let pid = null;
  if (brand.description) { pid = await db.upsertProject(env, userId, brand); await db.saveResults(env, userId, pid, rows); }
  rows.sort((a, b) => b.metric - a.metric);
  const k = Math.max(1, Math.floor(rows.length / 3));
  const winners = rows.slice(0, k), losers = rows.slice(-k);
  let next = [];
  if (brand.description) {
    const concepts = await generateConcepts(cfg, brand, +(p.n_concepts || 6), {
      winners: winners.map((w) => `- ${w.name} (ROAS ${w.metric})`).join("\n"),
      killList: losers.map((l) => l.name),
    });
    const personas = await generatePersonas(cfg, brand, +(p.n_personas || 10));
    next = await persist(env, userId, brand, await scoreAds(cfg, concepts, personas), "generated");
  }
  const calib = pid ? await db.calibration(env, userId, pid) : { n: 0, rho: null, pairs: [] };
  return { mode: modeOf(cfg), parsed: rows, winners: winners.map((w) => w.name), losers: losers.map((l) => l.name), next_round: next, calibration: calib };
}

// --- auth routes ---------------------------------------------------------- //
async function apiSignup(env, request, body, secure) {
  if (env.SIGNUP_CODE && body.code !== env.SIGNUP_CODE) throw new Error("Invalid signup code.");
  const iters = +(env.PBKDF2_ITERATIONS || auth.DEFAULT_ITERATIONS);
  const user = await auth.createUser(env, body.email, body.password, iters);
  const token = await auth.createSession(env, user.id);
  return json({ email: user.email }, 200, { "Set-Cookie": auth.sessionCookie(token, secure) });
}

async function apiLogin(env, body, secure) {
  const user = await auth.authenticate(env, body.email, body.password);
  if (!user) return json({ error: "Wrong email or password." }, 401);
  const token = await auth.createSession(env, user.id);
  return json({ email: user.email }, 200, { "Set-Cookie": auth.sessionCookie(token, secure) });
}

export default {
  async fetch(request, env) {
    await db.ensureSchema(env);
    const url = new URL(request.url);
    const secure = url.protocol === "https:";

    // Public: the page itself + auth endpoints.
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html"))
      return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8" } });

    if (request.method === "POST" && (url.pathname === "/api/signup" || url.pathname === "/api/login")) {
      const body = await request.json().catch(() => ({}));
      try {
        return url.pathname === "/api/signup"
          ? await apiSignup(env, request, body, secure)
          : await apiLogin(env, body, secure);
      } catch (e) { return json({ error: e.message }, 400); }
    }

    // Everything else requires a session.
    const user = await auth.userFromRequest(env, request);
    if (url.pathname === "/api/me")
      return user ? json({ email: user.email }) : json({ error: "not signed in" }, 401);
    if (url.pathname === "/api/logout") { await auth.destroySession(env, request); return json({ ok: true }, 200, { "Set-Cookie": auth.clearCookie(secure) }); }
    if (!user) return json({ error: "Sign in required." }, 401);

    const cfg = await loadConfig(env, user.id);
    try {
      if (request.method === "GET") {
        if (url.pathname === "/api/status") return json({ caps: caps(cfg) });
        if (url.pathname === "/api/settings") return json({ settings: await db.maskedSettings(env, user.id), caps: caps(cfg) });
        return new Response("not found", { status: 404 });
      }
      if (request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        if (url.pathname === "/api/settings") { await db.saveSettings(env, user.id, body.settings || {}); return json({ ok: true, caps: caps(await loadConfig(env, user.id)) }); }
        if (url.pathname === "/api/generate") return json(await apiGenerate(env, user.id, cfg, body));
        if (url.pathname === "/api/rank") return json(await apiRank(env, user.id, cfg, body));
        if (url.pathname === "/api/render") return json(await apiRender(env, user.id, cfg, body));
        if (url.pathname === "/api/results") return json(await apiResults(env, user.id, cfg, body));
        return new Response("not found", { status: 404 });
      }
      return new Response("method not allowed", { status: 405 });
    } catch (e) {
      return json({ error: `${e.name}: ${e.message}` });
    }
  },
};
