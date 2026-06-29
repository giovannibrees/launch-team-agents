// LLM / embedding / image providers for the Cloudflare Worker.
// Pure web APIs (fetch, crypto) — no Node, no build step. Falls back to
// deterministic fakes when keys are missing (demo mode).

export function caps(cfg) {
  const llm = !!cfg.anthropic_api_key;
  const prov = (cfg.embedding_provider || "voyage").toLowerCase();
  const emb = !!((prov === "voyage" && cfg.voyage_api_key) ||
                 (prov === "openai" && cfg.openai_api_key));
  const img = !!cfg.openai_api_key;
  return { llm, embeddings: emb, images: img, ssr_live: llm && emb };
}

// --- LLM ------------------------------------------------------------------ //
export async function llmComplete(cfg, system, user, maxTokens = 1200) {
  if (!cfg.__llm) return null; // caller handles fake path
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": cfg.anthropic_api_key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.anthropic_model || "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

// --- Embeddings ----------------------------------------------------------- //
export async function embed(cfg, texts) {
  if (!cfg.__emb) return texts.map(fakeEmbed);
  const prov = (cfg.embedding_provider || "voyage").toLowerCase();
  if (prov === "openai") {
    const r = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.openai_api_key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: cfg.openai_embedding_model || "text-embedding-3-small", input: texts }),
    });
    if (!r.ok) throw new Error(`OpenAI embed ${r.status}`);
    const j = await r.json();
    return j.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
  const r = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.voyage_api_key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: cfg.voyage_model || "voyage-3", input: texts }),
  });
  if (!r.ok) throw new Error(`Voyage ${r.status}`);
  const j = await r.json();
  return j.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

// --- Images --------------------------------------------------------------- //
export async function generateImage(cfg, prompt) {
  if (!cfg.__img) return fakeSvg(prompt);
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.openai_api_key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: cfg.image_model || "gpt-image-1", prompt, size: "1024x1024" }),
  });
  if (!r.ok) throw new Error(`OpenAI image ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return `data:image/png;base64,${j.data[0].b64_json}`;
}

// --- Fakes (deterministic, demo mode) ------------------------------------- //
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function fakeEmbed(text) {
  const DIM = 96, v = new Array(DIM).fill(0);
  for (const tok of text.toLowerCase().split(/\s+/)) if (tok) v[hash(tok) % DIM] += 1;
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

const FAKE_REACTIONS = [
  "Honestly this isn't for me at all, I would never buy it.",
  "I probably would not buy this, it doesn't grab me.",
  "I might buy it, I'm genuinely not sure, would need to think.",
  "This looks good, I would probably buy it.",
  "I want this, I would definitely buy it right now.",
];
export function fakeReaction(seed) { return FAKE_REACTIONS[hash(seed) % FAKE_REACTIONS.length]; }

export function fakeConcepts(n) {
  const angles = [
    ["Problem-led", "problem-aware", "You don't hate mornings. You hate your alarm."],
    ["Founder POV", "solution-aware", "I built this after I overslept the big one."],
    ["Before / after", "product-aware", "From 5 snoozes to up on the first try."],
    ["Social proof", "product-aware", "12,000 people fixed their mornings."],
    ["Mechanism", "solution-aware", "Light tells your body to wake — not a buzzer."],
    ["Listicle", "problem-aware", "3 reasons your alarm is wrecking your day."],
  ];
  return Array.from({ length: n }, (_, i) => {
    const a = angles[i % angles.length];
    return {
      name: `${a[0]} concept`, angle: a[0], awareness_stage: a[1], headline: a[2],
      primary_text: `[demo copy — add API keys in Settings for live generation] ${a[2]} Here is the offer and the proof, with one clear CTA.`,
      description: "Native, scroll-stopping visual matching the angle.",
    };
  });
}

export function fakePersonas(n) {
  const stages = ["unaware", "problem-aware", "solution-aware", "product-aware", "most-aware"];
  const segs = ["value seeker", "premium buyer", "skeptic", "impulse shopper", "researcher"];
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`, name: `Persona ${i + 1}`, segment: segs[i % segs.length],
    awareness_stage: stages[i % stages.length],
    description: `Synthetic ${segs[i % segs.length]}, scrolls a busy feed.`,
  }));
}

export function fakeSvg(prompt) {
  let label = prompt.length > 48 ? prompt.slice(0, 48) + "…" : prompt;
  label = label.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#1f2937'/><stop offset='1' stop-color='#3b82f6'/></linearGradient></defs><rect width='512' height='512' fill='url(#g)'/><text x='50%' y='46%' fill='#fff' font-family='sans-serif' font-size='22' text-anchor='middle'>DEMO IMAGE</text><text x='50%' y='56%' fill='#cbd5e1' font-family='sans-serif' font-size='13' text-anchor='middle'>${label}</text></svg>`;
  return "data:image/svg+xml;base64," + btoa(svg);
}

export function parseJsonArray(raw) {
  if (!raw) return [];
  const s = raw.indexOf("["), e = raw.lastIndexOf("]");
  if (s === -1 || e === -1) return [];
  try { const d = JSON.parse(raw.slice(s, e + 1)); return Array.isArray(d) ? d : []; }
  catch { return []; }
}
