"""Semantic Similarity Rating (SSR) — faithful pure-Python reimplementation.

Based on PyMC Labs (2025), "LLMs Reproduce Human Purchase Intent via Semantic
Similarity Elicitation of Likert Ratings" (arXiv:2510.08338). Reference package:
https://github.com/pymc-labs/semantic-similarity-rating

The method, in four steps:
  1. Elicit a FREE-TEXT reaction from an LLM persona (never a raw number).
  2. Embed the reaction and embed one reference statement per Likert point.
  3. Cosine-similarity reaction→each anchor, subtract the min, temperature-scale,
     normalize → a probability mass function (PMF) over the 1..5 scale.
  4. Aggregate PMFs across the persona panel → a purchase-intent score per ad.

Pure Python (no numpy) so the harness runs with zero installs in --dry-run.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, List

from providers import EmbeddingProvider, LLMProvider

# One reference statement per Likert point (1=lowest intent, 5=highest).
# Phrasing matters — these are the semantic anchors the reaction is compared to.
PURCHASE_INTENT_ANCHORS: List[tuple[int, str]] = [
    (1, "I would never buy this. It is not for me at all."),
    (2, "I probably would not buy this. It does not appeal to me."),
    (3, "I might buy this, but I am not sure. I have doubts."),
    (4, "I would probably buy this. It appeals to me."),
    (5, "I would definitely buy this. I really want it."),
]


@dataclass
class AdScore:
    ad_id: str
    name: str
    intent_mean: float                 # expected Likert value 1..5 (the rank key)
    pmf: List[float]                   # averaged distribution over the 5 points
    n_personas: int
    sample_reactions: List[str] = field(default_factory=list)


def _cosine(a: List[float], b: List[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)


def response_to_pmf(
    response_emb: List[float],
    anchor_embs: List[List[float]],
    temperature: float = 0.1,
    epsilon: float = 1e-6,
) -> List[float]:
    """Map one reaction embedding to a PMF over the Likert points.

    min-subtraction → temperature softmax → normalize, per the SSR paper.
    Lower temperature = sharper distribution.
    """
    sims = [_cosine(response_emb, a) for a in anchor_embs]
    lo = min(sims)
    shifted = [s - lo for s in sims]
    weights = [math.exp(s / max(temperature, epsilon)) for s in shifted]
    total = sum(weights) or 1.0
    return [w / total for w in weights]


def _expected_value(pmf: List[float]) -> float:
    return sum((i + 1) * p for i, p in enumerate(pmf))


class SSRScorer:
    def __init__(
        self,
        llm: LLMProvider,
        embeddings: EmbeddingProvider,
        temperature: float = 0.1,
    ):
        self.llm = llm
        self.embeddings = embeddings
        self.temperature = temperature
        # Anchor embeddings are computed once and reused across every ad/persona.
        self._anchor_embs = self.embeddings.embed([t for _, t in PURCHASE_INTENT_ANCHORS])

    # -- step 1: elicit a free-text reaction ------------------------------- #
    def _react(self, persona: Dict, ad: Dict) -> str:
        system = (
            "You are a specific consumer reacting to an ad in your social feed. "
            "Stay fully in character. React naturally in 2-4 sentences: what you "
            "feel, whether it speaks to you, and how likely you are to buy. Be "
            "honest, including indifference or skepticism. Do NOT output a number."
        )
        user = (
            f"YOUR PERSONA:\n"
            f"- {persona.get('name','?')} — {persona.get('segment','')}\n"
            f"- Awareness stage: {persona.get('awareness_stage','')}\n"
            f"- {persona.get('description','')}\n\n"
            f"THE AD:\n"
            f"- Headline: {ad.get('headline','')}\n"
            f"- Body: {ad.get('primary_text','')}\n"
            f"- Visual: {ad.get('description','(image)')}\n\n"
            f"Your honest reaction:"
        )
        return self.llm.complete(system, user, max_tokens=220)

    # -- steps 2-4: score one ad across the panel -------------------------- #
    def score_ad(self, ad: Dict, personas: List[Dict]) -> AdScore:
        reactions = [self._react(p, ad) for p in personas]
        reaction_embs = self.embeddings.embed(reactions)
        pmfs = [
            response_to_pmf(emb, self._anchor_embs, self.temperature)
            for emb in reaction_embs
        ]
        # Average the distributions, then take the expected value as the score.
        avg_pmf = [sum(col) / len(pmfs) for col in zip(*pmfs)]
        return AdScore(
            ad_id=str(ad.get("id", ad.get("name", "?"))),
            name=str(ad.get("name", ad.get("id", "?"))),
            intent_mean=_expected_value(avg_pmf),
            pmf=avg_pmf,
            n_personas=len(personas),
            sample_reactions=reactions[:3],
        )

    def score_ads(self, ads: List[Dict], personas: List[Dict]) -> List[AdScore]:
        return [self.score_ad(ad, personas) for ad in ads]
