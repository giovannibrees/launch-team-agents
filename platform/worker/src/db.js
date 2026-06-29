// D1 (Cloudflare SQLite) persistence — port of platform/app/db.py.

const SECRET_KEYS = ["anthropic_api_key", "voyage_api_key", "openai_api_key"];

export async function ensureSchema(env) {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)"),
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT UNIQUE, " +
      "name TEXT, url TEXT, description TEXT, target_customer TEXT, created REAL)"),
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS ads (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, name TEXT, " +
      "angle TEXT, awareness_stage TEXT, headline TEXT, primary_text TEXT, description TEXT, score REAL, " +
      "image TEXT, source TEXT, created REAL)"),
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS results (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, " +
      "ad_name TEXT, metric REAL, metric_name TEXT, created REAL)"),
  ]);
}

export async function getSettings(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM settings").all();
  const o = {};
  for (const r of results) o[r.key] = r.value;
  return o;
}

export async function maskedSettings(env) {
  const s = await getSettings(env);
  for (const k of SECRET_KEYS) if (s[k]) s[k] = "********";
  return s;
}

export async function saveSettings(env, updates) {
  const stmts = [];
  for (const [k, v] of Object.entries(updates)) {
    if (v === "********") continue; // keep unchanged
    stmts.push(env.DB.prepare(
      "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
    ).bind(k, String(v)));
  }
  if (stmts.length) await env.DB.batch(stmts);
}

async function sha16(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s || ""));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function upsertProject(env, brand) {
  const h = await sha16(brand.description || "");
  const found = await env.DB.prepare("SELECT id FROM projects WHERE hash=?").bind(h).first();
  if (found) return found.id;
  const r = await env.DB.prepare(
    "INSERT INTO projects(hash,name,url,description,target_customer,created) VALUES(?,?,?,?,?,?)"
  ).bind(h, brand.name || "", brand.url || "", brand.description || "", brand.target_customer || "", Date.now()).run();
  return r.meta.last_row_id;
}

export async function saveAds(env, projectId, ads, source) {
  const ids = [];
  for (const a of ads) {
    const r = await env.DB.prepare(
      "INSERT INTO ads(project_id,name,angle,awareness_stage,headline,primary_text,description,score,image,source,created) " +
      "VALUES(?,?,?,?,?,?,?,?,?,?,?)"
    ).bind(projectId, a.name || "", a.angle || "", a.awareness_stage || "", a.headline || "",
      a.primary_text || "", a.description || "", a.score ?? null, null, source, Date.now()).run();
    ids.push(r.meta.last_row_id);
  }
  return ids;
}

export async function setAdImage(env, adId, dataUrl) {
  await env.DB.prepare("UPDATE ads SET image=? WHERE id=?").bind(dataUrl, adId).run();
}

export async function saveResults(env, projectId, rows) {
  const stmts = rows.map((r) => env.DB.prepare(
    "INSERT INTO results(project_id,ad_name,metric,metric_name,created) VALUES(?,?,?,?,?)"
  ).bind(projectId, r.name, r.metric, r.metric_name || "ROAS", Date.now()));
  if (stmts.length) await env.DB.batch(stmts);
}

export async function calibration(env, projectId) {
  const { results } = await env.DB.prepare(
    "SELECT a.name AS name, AVG(a.score) AS ssr, AVG(r.metric) AS real FROM ads a " +
    "JOIN results r ON a.name = r.ad_name WHERE a.score IS NOT NULL AND a.project_id=? AND r.project_id=? " +
    "GROUP BY a.name"
  ).bind(projectId, projectId).all();
  const pairs = results.map((r) => [r.name, r.ssr, r.real]);
  return { n: pairs.length, rho: spearman(pairs.map((p) => p[1]), pairs.map((p) => p[2])), pairs };
}

function spearman(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const rank = (v) => {
    const order = [...v.keys()].sort((a, b) => v[a] - v[b]);
    const r = new Array(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && v[order[j + 1]] === v[order[i]]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[order[k]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs), ry = rank(ys);
  const mx = rx.reduce((s, x) => s + x, 0) / n, my = ry.reduce((s, y) => s + y, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  const den = Math.sqrt(dx) * Math.sqrt(dy);
  return den ? Math.round((num / den) * 100) / 100 : null;
}
