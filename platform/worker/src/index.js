// Ad Studio on Cloudflare Workers. Serves the UI and the /api/* routes.
import HTML from "./index.html";
import { caps, generateImage } from "./providers.js";
import * as db from "./db.js";
import { generateConcepts, generatePersonas } from "./generate.js";
import { scoreAds } from "./ssr.js";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

function gated(request, env) {
  const pw = env.APP_PASSWORD;
  if (!pw) return null; // local/unset → open
  const h = request.headers.get("Authorization") || "";
  if (h.startsWith("Basic ")) {
    try { if (atob(h.slice(6)).split(":").slice(-1)[0] === pw) return null; } catch {}
  }
  return new Response("Auth required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Ad Studio"' } });
}

async function loadConfig(env) {
  const s = await db.getSettings(env);
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

async function persist(env, brand, ranked, source) {
  const pid = await db.upsertProject(env, brand);
  const ids = await db.saveAds(env, pid, ranked, source);
  ranked.forEach((a, i) => { a.db_id = ids[i]; a.project_id = pid; });
  return ranked;
}

async function apiGenerate(env, cfg, p) {
  const brand = brandOf(p);
  if (!brand.description) return { error: "Tell me what your business is about." };
  const concepts = await generateConcepts(cfg, brand, +(p.n_concepts || 6), { references: p.references || null });
  const personas = await generatePersonas(cfg, brand, +(p.n_personas || 10));
  const ranked = await persist(env, brand, await scoreAds(cfg, concepts, personas), "generated");
  return { mode: modeOf(cfg), ads: ranked };
}

async function apiRank(env, cfg, p) {
  const brand = brandOf(p);
  const ads = (p.ads || []).map((a, i) => ({ id: a.id || `a${i + 1}`, name: a.name || (a.headline || `Ad ${i + 1}`).slice(0, 40), ...a }));
  if (!ads.length) return { error: "Add at least one ad to rank." };
  const personas = await generatePersonas(cfg, brand, +(p.n_personas || 10));
  const ranked = await persist(env, brand, await scoreAds(cfg, ads, personas), "ranked");
  return { mode: modeOf(cfg), ads: ranked };
}

async function apiRender(env, cfg, p) {
  const prompt = `High-converting ${p.angle || ""} social ad image. Headline on image: "${p.headline || ""}". Visual: ${p.description || ""}. Clean, native, scroll-stopping.`;
  let image;
  try { image = await generateImage(cfg, prompt); }
  catch (e) { return { error: `Image generation failed: ${e.message}` }; }
  if (p.db_id) await db.setAdImage(env, p.db_id, image);
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
    cells.push(cur);
    rows.push(cells);
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

async function apiResults(env, cfg, p) {
  const rows = parseCsv(p.csv || "");
  if (!rows.length) return { error: "Couldn't find ad rows with a name and a ROAS/result column." };
  const brand = brandOf(p);
  let pid = null;
  if (brand.description) { pid = await db.upsertProject(env, brand); await db.saveResults(env, pid, rows); }
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
    next = await persist(env, brand, await scoreAds(cfg, concepts, personas), "generated");
  }
  const calib = pid ? await db.calibration(env, pid) : { n: 0, rho: null, pairs: [] };
  return { mode: modeOf(cfg), parsed: rows, winners: winners.map((w) => w.name), losers: losers.map((l) => l.name), next_round: next, calibration: calib };
}

export default {
  async fetch(request, env) {
    const block = gated(request, env);
    if (block) return block;
    await db.ensureSchema(env);
    const url = new URL(request.url);
    const cfg = await loadConfig(env);
    try {
      if (request.method === "GET") {
        if (url.pathname === "/" || url.pathname === "/index.html")
          return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
        if (url.pathname === "/api/status") return json({ caps: caps(cfg) });
        if (url.pathname === "/api/settings") return json({ settings: await db.maskedSettings(env), caps: caps(cfg) });
        return new Response("not found", { status: 404 });
      }
      if (request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        if (url.pathname === "/api/settings") { await db.saveSettings(env, body.settings || {}); return json({ ok: true, caps: caps(await loadConfig(env)) }); }
        if (url.pathname === "/api/generate") return json(await apiGenerate(env, cfg, body));
        if (url.pathname === "/api/rank") return json(await apiRank(env, cfg, body));
        if (url.pathname === "/api/render") return json(await apiRender(env, cfg, body));
        if (url.pathname === "/api/results") return json(await apiResults(env, cfg, body));
        return new Response("not found", { status: 404 });
      }
      return new Response("method not allowed", { status: 405 });
    } catch (e) {
      return json({ error: `${e.name}: ${e.message}` });
    }
  },
};
