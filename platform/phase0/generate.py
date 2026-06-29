"""Generate candidate ad concepts from a brand brief.

The engine could only *rank* ads it was given; this lets it *create* them. Output
is concept-level (headline + primary text + visual direction + angle) — exactly
what SSR scores. Rendering the visual to a finished image is a later slot
(the model router); the differentiator (SSR ranking) works at the concept level.
"""

from __future__ import annotations

import json
from typing import Dict, List, Optional

from providers import LLMProvider


def generate_concepts(
    llm: LLMProvider,
    brand: Dict,
    n: int = 6,
    references: Optional[str] = None,
    kill_list: Optional[List[str]] = None,
    winners: Optional[str] = None,
) -> List[Dict]:
    """Produce ``n`` distinct ad concepts grounded in the brand + references."""
    system = (
        "You are a senior direct-response creative. Generate distinct, testable ad "
        "concepts for paid social. Apply the canon: lead with the prospect/problem "
        "(never the brand), one idea + one CTA per ad, specific over generic, match "
        "the awareness stage, stack real persuasion. Vary the ANGLE across concepts "
        "(problem-led, founder POV, before/after, social proof, mechanism, "
        "listicle). Return ONLY a JSON array; each object: "
        '{"name","angle","awareness_stage","headline","primary_text","description"}. '
        '"description" is the visual direction for the image.'
    )
    parts = [
        f"BRAND: {brand.get('name','')}",
        f"URL: {brand.get('url','')}",
        f"WHAT IT IS: {brand.get('description','')}",
        f"TARGET CUSTOMER: {brand.get('target_customer','')}",
    ]
    if references:
        parts.append(f"\nCOMPETITOR / REFERENCE ADS THAT WORK (imitate the angles):\n{references}")
    if winners:
        parts.append(f"\nOUR OWN PAST WINNERS (lean into these):\n{winners}")
    if kill_list:
        parts.append("\nDO NOT REPEAT these angles/hooks (they failed): " + "; ".join(kill_list))
    parts.append(f"\nProduce exactly {n} ad concepts as a JSON array.")
    raw = llm.complete(system, "\n".join(parts), max_tokens=4000)

    concepts = _parse_json_array(raw)
    out: List[Dict] = []
    for i, c in enumerate(concepts[:n]):
        out.append(
            {
                "id": f"c{i+1}",
                "name": c.get("name") or f"Concept {i+1}",
                "angle": c.get("angle", ""),
                "awareness_stage": c.get("awareness_stage", ""),
                "headline": c.get("headline", ""),
                "primary_text": c.get("primary_text", ""),
                "description": c.get("description", ""),
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
