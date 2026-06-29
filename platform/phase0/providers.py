"""Pluggable LLM + embedding providers for the Phase 0 SSR harness.

Everything is behind two tiny interfaces (``LLMProvider`` / ``EmbeddingProvider``)
so the live product can swap models without touching the SSR logic. A fully
deterministic ``fake`` provider lets the whole pipeline run with **no API keys
and no pip installs** — use it to test plumbing (``--dry-run``).

Select providers via env (see ``.env.example``):
    LLM_PROVIDER=anthropic|fake
    EMBEDDING_PROVIDER=voyage|openai|fake
"""

from __future__ import annotations

import hashlib
import math
import os
from typing import List


# --------------------------------------------------------------------------- #
# Interfaces
# --------------------------------------------------------------------------- #
class LLMProvider:
    def complete(self, system: str, user: str, max_tokens: int = 600) -> str:
        raise NotImplementedError


class EmbeddingProvider:
    def embed(self, texts: List[str]) -> List[List[float]]:
        raise NotImplementedError


# --------------------------------------------------------------------------- #
# Real: Anthropic (Claude) for persona reactions / generation
# --------------------------------------------------------------------------- #
class AnthropicLLM(LLMProvider):
    def __init__(self, model: str | None = None):
        import anthropic  # lazy import so dry-run needs no deps

        self._client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        # Default to the latest capable model; cheap enough for many personas.
        self._model = model or os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")

    def complete(self, system: str, user: str, max_tokens: int = 600) -> str:
        msg = self._client.messages.create(
            model=self._model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return "".join(block.text for block in msg.content if block.type == "text").strip()


# --------------------------------------------------------------------------- #
# Real: embeddings via REST (Voyage is Anthropic's recommended partner; OpenAI
# also supported). Kept as plain HTTP to avoid extra SDK dependencies.
# --------------------------------------------------------------------------- #
class VoyageEmbeddings(EmbeddingProvider):
    def __init__(self, model: str | None = None):
        self._model = model or os.environ.get("VOYAGE_MODEL", "voyage-3")
        self._key = os.environ["VOYAGE_API_KEY"]

    def embed(self, texts: List[str]) -> List[List[float]]:
        import requests

        resp = requests.post(
            "https://api.voyageai.com/v1/embeddings",
            headers={"Authorization": f"Bearer {self._key}"},
            json={"model": self._model, "input": texts},
            timeout=60,
        )
        resp.raise_for_status()
        data = sorted(resp.json()["data"], key=lambda d: d["index"])
        return [d["embedding"] for d in data]


class OpenAIEmbeddings(EmbeddingProvider):
    def __init__(self, model: str | None = None):
        self._model = model or os.environ.get("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
        self._key = os.environ["OPENAI_API_KEY"]

    def embed(self, texts: List[str]) -> List[List[float]]:
        import requests

        resp = requests.post(
            "https://api.openai.com/v1/embeddings",
            headers={"Authorization": f"Bearer {self._key}"},
            json={"model": self._model, "input": texts},
            timeout=60,
        )
        resp.raise_for_status()
        data = sorted(resp.json()["data"], key=lambda d: d["index"])
        return [d["embedding"] for d in data]


# --------------------------------------------------------------------------- #
# Fake: deterministic, dependency-free. Lets --dry-run exercise the full
# pipeline so you can verify plumbing before spending a cent on API calls.
# --------------------------------------------------------------------------- #
# The five purchase-intent anchors the fake LLM picks from, so dry-run output
# ranks sensibly instead of being pure noise.
_FAKE_REACTIONS = [
    "Honestly this isn't for me at all, I would never buy it.",
    "I probably would not buy this, it doesn't grab me.",
    "I might buy it, I'm genuinely not sure, would need to think.",
    "This looks good, I would probably buy it.",
    "I want this, I would definitely buy it right now.",
]


class FakeLLM(LLMProvider):
    """Picks a reaction deterministically from (persona+ad) so rankings are
    stable and reproducible. Demonstrates the pipeline; carries no real signal."""

    def complete(self, system: str, user: str, max_tokens: int = 600) -> str:
        if "persona" in system.lower():
            return self._fake_personas(user)
        if "ad concept" in system.lower() or "creative" in system.lower():
            return self._fake_concepts(user)
        h = int(hashlib.sha256(user.encode()).hexdigest(), 16)
        return _FAKE_REACTIONS[h % len(_FAKE_REACTIONS)]

    @staticmethod
    def _fake_concepts(user: str) -> str:
        import json
        import re

        m = re.search(r"exactly (\d+)", user)
        n = int(m.group(1)) if m else 6
        angles = [
            ("Problem-led", "problem-aware", "You don't hate mornings. You hate your alarm."),
            ("Founder POV", "solution-aware", "I built this after I overslept the big one."),
            ("Before / after", "product-aware", "From 5 snoozes to up on the first try."),
            ("Social proof", "product-aware", "12,000 people fixed their mornings."),
            ("Mechanism", "solution-aware", "Light tells your body to wake — not a buzzer."),
            ("Listicle", "problem-aware", "3 reasons your alarm is wrecking your day."),
        ]
        out = []
        for i in range(n):
            a = angles[i % len(angles)]
            out.append(
                {
                    "name": f"{a[0]} concept",
                    "angle": a[0],
                    "awareness_stage": a[1],
                    "headline": a[2],
                    "primary_text": "[demo copy — connect real API keys for live generation] "
                    f"{a[2]} Here is the offer and the proof, with one clear CTA.",
                    "description": "Native, scroll-stopping visual matching the angle.",
                }
            )
        return json.dumps(out)

    @staticmethod
    def _fake_personas(user: str) -> str:
        import json
        import re

        m = re.search(r"exactly (\d+)", user)
        n = int(m.group(1)) if m else 5
        stages = ["unaware", "problem-aware", "solution-aware", "product-aware", "most-aware"]
        segs = ["value seeker", "premium buyer", "skeptic", "impulse shopper", "researcher"]
        panel = [
            {
                "id": f"p{i+1}",
                "name": f"Persona {i+1}",
                "segment": segs[i % len(segs)],
                "awareness_stage": stages[i % len(stages)],
                "description": f"Synthetic {segs[i % len(segs)]}, scrolls a busy feed.",
            }
            for i in range(n)
        ]
        return json.dumps(panel)


class FakeEmbeddings(EmbeddingProvider):
    """Hashing embedding: shared tokens → similar vectors. Deterministic, stdlib
    only. Good enough to move the SSR math; not semantically real."""

    _DIM = 96

    def embed(self, texts: List[str]) -> List[List[float]]:
        return [self._one(t) for t in texts]

    def _one(self, text: str) -> List[float]:
        vec = [0.0] * self._DIM
        for tok in text.lower().split():
            h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
            vec[h % self._DIM] += 1.0
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]


# --------------------------------------------------------------------------- #
# Factory
# --------------------------------------------------------------------------- #
def get_llm(dry_run: bool = False) -> LLMProvider:
    name = "fake" if dry_run else os.environ.get("LLM_PROVIDER", "fake").lower()
    if name == "anthropic":
        return AnthropicLLM()
    if name == "fake":
        return FakeLLM()
    raise ValueError(f"Unknown LLM_PROVIDER: {name}")


def get_embeddings(dry_run: bool = False) -> EmbeddingProvider:
    name = "fake" if dry_run else os.environ.get("EMBEDDING_PROVIDER", "fake").lower()
    if name == "voyage":
        return VoyageEmbeddings()
    if name == "openai":
        return OpenAIEmbeddings()
    if name == "fake":
        return FakeEmbeddings()
    raise ValueError(f"Unknown EMBEDDING_PROVIDER: {name}")
