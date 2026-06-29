// Semantic Similarity Rating — JS port of platform/phase0/ssr.py.
// Batched: ONE LLM call per ad produces all persona reactions (keeps us well
// under Workers' subrequest limits), then ONE embed call scores them.

import { embed, llmComplete, fakeReaction, parseJsonArray } from "./providers.js";

export const ANCHORS = [
  [1, "I would never buy this. It is not for me at all."],
  [2, "I probably would not buy this. It does not appeal to me."],
  [3, "I might buy this, but I am not sure. I have doubts."],
  [4, "I would probably buy this. It appeals to me."],
  [5, "I would definitely buy this. I really want it."],
];

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / ((Math.sqrt(na) || 1) * (Math.sqrt(nb) || 1));
}

export function responseToPmf(emb, anchorEmbs, T = 0.1) {
  const sims = anchorEmbs.map((a) => cosine(emb, a));
  const lo = Math.min(...sims);
  const w = sims.map((s) => Math.exp((s - lo) / Math.max(T, 1e-6)));
  const tot = w.reduce((s, x) => s + x, 0) || 1;
  return w.map((x) => x / tot);
}

const ev = (pmf) => pmf.reduce((s, p, i) => s + (i + 1) * p, 0);

// One LLM call → array of reactions, one per persona (in order).
async function reactions(cfg, personas, ad) {
  if (!cfg.__llm) return personas.map((p) => fakeReaction(p.id + ad.headline));
  const system =
    "You simulate a panel of consumers reacting to an ad in their feed. For EACH " +
    "persona, write an honest 2-4 sentence reaction in their voice — what they feel, " +
    "whether it speaks to them, how likely they are to buy (include indifference or " +
    "skepticism). Do NOT output numbers. Return ONLY a JSON array of strings, one per " +
    "persona, in the same order.";
  const user =
    "PERSONAS:\n" +
    personas.map((p, i) => `${i + 1}. ${p.name} — ${p.segment}; ${p.awareness_stage}; ${p.description}`).join("\n") +
    `\n\nTHE AD:\n- Headline: ${ad.headline || ""}\n- Body: ${ad.primary_text || ""}\n- Visual: ${ad.description || "(image)"}\n\n` +
    `Return exactly ${personas.length} reactions as a JSON array of strings.`;
  const out = parseJsonArray(await llmComplete(cfg, system, user, 3000)).map(String);
  // Pad/trim defensively so downstream length matches the panel.
  while (out.length < personas.length) out.push("I'm not sure about this one.");
  return out.slice(0, personas.length);
}

export async function scoreAds(cfg, ads, personas) {
  const anchorEmbs = await embed(cfg, ANCHORS.map((a) => a[1]));
  const out = [];
  for (const ad of ads) {
    const rx = await reactions(cfg, personas, ad);
    const embs = await embed(cfg, rx);
    const pmfs = embs.map((e) => responseToPmf(e, anchorEmbs));
    const avg = pmfs[0].map((_, i) => pmfs.reduce((s, p) => s + p[i], 0) / pmfs.length);
    out.push({ ...ad, score: Math.round(ev(avg) * 100) / 100, pmf: avg.map((p) => Math.round(p * 1000) / 1000), reactions: rx.slice(0, 3) });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
