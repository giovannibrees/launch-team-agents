"""Build a synthetic persona panel from a brand brief.

The panel is the AI focus group SSR scores against. Personas are spread across
the five awareness stages (Schwartz / ad-creative-playbook.md) because the same
ad lands very differently on a problem-aware vs. a most-aware buyer.
"""

from __future__ import annotations

import json
from typing import Dict, List

from providers import LLMProvider

AWARENESS_STAGES = [
    "unaware",
    "problem-aware",
    "solution-aware",
    "product-aware",
    "most-aware",
]


def generate_personas(llm: LLMProvider, brand: Dict, n: int = 50) -> List[Dict]:
    """Ask the LLM for ``n`` distinct personas grounded in the brand's ICP."""
    system = (
        "Generate a realistic, diverse panel of consumer personas for market "
        "research. Spread them across the five awareness stages "
        f"({', '.join(AWARENESS_STAGES)}). Return ONLY a JSON array; each object: "
        '{"id","name","segment","awareness_stage","description"}. The description '
        "is 1-2 sentences of demographics, motivation, and buying posture."
    )
    user = (
        f"BRAND: {brand.get('name','')}\n"
        f"URL: {brand.get('url','')}\n"
        f"WHAT IT IS: {brand.get('description','')}\n"
        f"TARGET CUSTOMER: {brand.get('target_customer','')}\n\n"
        f"Produce exactly {n} personas as a JSON array."
    )
    raw = llm.complete(system, user, max_tokens=4000)
    personas = _parse_json_array(raw)

    # Backfill / normalize so downstream code can rely on the fields existing.
    out: List[Dict] = []
    for i, p in enumerate(personas[:n] or [{}]):
        out.append(
            {
                "id": p.get("id") or f"p{i+1}",
                "name": p.get("name") or f"Persona {i+1}",
                "segment": p.get("segment", ""),
                "awareness_stage": p.get("awareness_stage")
                or AWARENESS_STAGES[i % len(AWARENESS_STAGES)],
                "description": p.get("description", ""),
            }
        )
    return out


def _parse_json_array(raw: str) -> List[Dict]:
    raw = raw.strip()
    start, end = raw.find("["), raw.rfind("]")
    if start == -1 or end == -1:
        return []
    try:
        data = json.loads(raw[start : end + 1])
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []
