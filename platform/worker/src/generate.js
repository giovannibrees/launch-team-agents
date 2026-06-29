// Ad concept + persona generation — JS port of generate.py / personas.py.
import { llmComplete, fakeConcepts, fakePersonas, parseJsonArray } from "./providers.js";

export async function generateConcepts(cfg, brand, n = 6, opts = {}) {
  if (!cfg.__llm) return tag(fakeConcepts(n));
  const system =
    "You are a senior direct-response creative. Generate distinct, testable ad " +
    "concepts for paid social. Lead with the prospect/problem (never the brand), one " +
    "idea + one CTA each, specific over generic, match the awareness stage, stack real " +
    "persuasion. Vary the ANGLE (problem-led, founder POV, before/after, social proof, " +
    "mechanism, listicle). Return ONLY a JSON array; each object: " +
    '{"name","angle","awareness_stage","headline","primary_text","description"}.';
  const parts = [
    `BRAND: ${brand.name || ""}`, `URL: ${brand.url || ""}`,
    `WHAT IT IS: ${brand.description || ""}`, `TARGET CUSTOMER: ${brand.target_customer || ""}`,
  ];
  if (opts.references) parts.push(`\nCOMPETITOR / REFERENCE ADS (imitate the angles):\n${opts.references}`);
  if (opts.winners) parts.push(`\nOUR OWN PAST WINNERS (lean in):\n${opts.winners}`);
  if (opts.killList?.length) parts.push(`\nDO NOT REPEAT these failed angles: ${opts.killList.join("; ")}`);
  parts.push(`\nProduce exactly ${n} ad concepts as a JSON array.`);
  const concepts = parseJsonArray(await llmComplete(cfg, system, parts.join("\n"), 4000));
  return tag(concepts.slice(0, n));
}

function tag(concepts) {
  return concepts.map((c, i) => ({
    id: `c${i + 1}`, name: c.name || `Concept ${i + 1}`, angle: c.angle || "",
    awareness_stage: c.awareness_stage || "", headline: c.headline || "",
    primary_text: c.primary_text || "", description: c.description || "",
  }));
}

const STAGES = ["unaware", "problem-aware", "solution-aware", "product-aware", "most-aware"];

export async function generatePersonas(cfg, brand, n = 10) {
  if (!cfg.__llm) return fakePersonas(n);
  const system =
    "Generate a realistic, diverse panel of consumer personas for market research, " +
    `spread across the awareness stages (${STAGES.join(", ")}). Return ONLY a JSON array; ` +
    'each object: {"id","name","segment","awareness_stage","description"} where description ' +
    "is 1-2 sentences of demographics, motivation, and buying posture.";
  const user =
    `BRAND: ${brand.name || ""}\nWHAT IT IS: ${brand.description || ""}\n` +
    `TARGET CUSTOMER: ${brand.target_customer || ""}\n\nProduce exactly ${n} personas as a JSON array.`;
  const arr = parseJsonArray(await llmComplete(cfg, system, user, 4000));
  const out = (arr.length ? arr : [{}]).slice(0, n).map((p, i) => ({
    id: p.id || `p${i + 1}`, name: p.name || `Persona ${i + 1}`, segment: p.segment || "",
    awareness_stage: p.awareness_stage || STAGES[i % STAGES.length], description: p.description || "",
  }));
  return out;
}
