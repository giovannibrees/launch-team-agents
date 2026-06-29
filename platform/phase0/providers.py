"""Pluggable LLM + embedding + image providers.

Config-driven: every factory takes an optional ``config`` dict (keys entered in
the app's Settings screen) and falls back to environment variables. A fully
deterministic ``fake`` path lets the whole pipeline run with NO keys and NO pip
installs (demo mode).

    get_llm(config)         -> LLMProvider
    get_embeddings(config)  -> EmbeddingProvider
    get_image(config)       -> ImageProvider
"""

from __future__ import annotations

import hashlib
import math
import os
from typing import List, Optional


def _val(config: Optional[dict], key: str, env: str) -> Optional[str]:
    """Config value first, then env. Empty strings count as unset."""
    if config and config.get(key):
        return str(config[key]).strip()
    v = os.environ.get(env)
    return v.strip() if v else None


# --------------------------------------------------------------------------- #
# Interfaces
# --------------------------------------------------------------------------- #
class LLMProvider:
    def complete(self, system: str, user: str, max_tokens: int = 600) -> str:
        raise NotImplementedError


class EmbeddingProvider:
    def embed(self, texts: List[str]) -> List[List[float]]:
        raise NotImplementedError


class ImageProvider:
    def generate(self, prompt: str) -> str:
        """Return an image as a data: URL."""
        raise NotImplementedError


# --------------------------------------------------------------------------- #
# Real providers
# --------------------------------------------------------------------------- #
class AnthropicLLM(LLMProvider):
    def __init__(self, api_key: str, model: Optional[str] = None):
        import anthropic

        self._client = anthropic.Anthropic(api_key=api_key)
        self._model = model or "claude-sonnet-4-6"

    def complete(self, system: str, user: str, max_tokens: int = 600) -> str:
        msg = self._client.messages.create(
            model=self._model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return "".join(b.text for b in msg.content if b.type == "text").strip()


class VoyageEmbeddings(EmbeddingProvider):
    def __init__(self, api_key: str, model: Optional[str] = None):
        self._key = api_key
        self._model = model or "voyage-3"

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
    def __init__(self, api_key: str, model: Optional[str] = None):
        self._key = api_key
        self._model = model or "text-embedding-3-small"

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


class OpenAIImage(ImageProvider):
    """gpt-image-1. One key, returns base64 PNG. The first real model in the
    router; Ideogram v3 / Seedream / Nano Banana Pro slot in behind the same
    interface (via fal.ai or Replicate) when you want text-on-image / cheap
    volume / consistent editing respectively."""

    def __init__(self, api_key: str, model: Optional[str] = None):
        self._key = api_key
        self._model = model or "gpt-image-1"

    def generate(self, prompt: str) -> str:
        import requests

        resp = requests.post(
            "https://api.openai.com/v1/images/generations",
            headers={"Authorization": f"Bearer {self._key}"},
            json={"model": self._model, "prompt": prompt, "size": "1024x1024"},
            timeout=120,
        )
        resp.raise_for_status()
        b64 = resp.json()["data"][0]["b64_json"]
        return f"data:image/png;base64,{b64}"


# --------------------------------------------------------------------------- #
# Fake providers — deterministic, dependency-free (demo mode)
# --------------------------------------------------------------------------- #
_FAKE_REACTIONS = [
    "Honestly this isn't for me at all, I would never buy it.",
    "I probably would not buy this, it doesn't grab me.",
    "I might buy it, I'm genuinely not sure, would need to think.",
    "This looks good, I would probably buy it.",
    "I want this, I would definitely buy it right now.",
]


class FakeLLM(LLMProvider):
    def complete(self, system: str, user: str, max_tokens: int = 600) -> str:
        if "persona" in system.lower():
            return self._fake_personas(user)
        if "ad concept" in system.lower() or "creative" in system.lower():
            return self._fake_concepts(user)
        h = int(hashlib.sha256(user.encode()).hexdigest(), 16)
        return _FAKE_REACTIONS[h % len(_FAKE_REACTIONS)]

    @staticmethod
    def _fake_personas(user: str) -> str:
        import json
        import re

        m = re.search(r"exactly (\d+)", user)
        n = int(m.group(1)) if m else 5
        stages = ["unaware", "problem-aware", "solution-aware", "product-aware", "most-aware"]
        segs = ["value seeker", "premium buyer", "skeptic", "impulse shopper", "researcher"]
        return json.dumps([
            {"id": f"p{i+1}", "name": f"Persona {i+1}", "segment": segs[i % len(segs)],
             "awareness_stage": stages[i % len(stages)],
             "description": f"Synthetic {segs[i % len(segs)]}, scrolls a busy feed."}
            for i in range(n)
        ])

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
            out.append({
                "name": f"{a[0]} concept", "angle": a[0], "awareness_stage": a[1],
                "headline": a[2],
                "primary_text": "[demo copy — add API keys in Settings for live generation] "
                f"{a[2]} Here is the offer and the proof, with one clear CTA.",
                "description": "Native, scroll-stopping visual matching the angle.",
            })
        return json.dumps(out)


class FakeEmbeddings(EmbeddingProvider):
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


class FakeImage(ImageProvider):
    """Placeholder SVG so demo mode shows *something* per card without an API."""

    def generate(self, prompt: str) -> str:
        import base64

        label = (prompt[:48] + "…") if len(prompt) > 48 else prompt
        label = label.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        svg = (
            "<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512'>"
            "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>"
            "<stop offset='0' stop-color='#1f2937'/><stop offset='1' stop-color='#3b82f6'/>"
            "</linearGradient></defs><rect width='512' height='512' fill='url(#g)'/>"
            "<text x='50%' y='46%' fill='#fff' font-family='sans-serif' font-size='22' "
            "text-anchor='middle'>DEMO IMAGE</text>"
            f"<text x='50%' y='56%' fill='#cbd5e1' font-family='sans-serif' font-size='13' "
            f"text-anchor='middle'>{label}</text></svg>"
        )
        return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()


# --------------------------------------------------------------------------- #
# Factories
# --------------------------------------------------------------------------- #
def get_llm(dry_run: bool = False, config: Optional[dict] = None) -> LLMProvider:
    key = _val(config, "anthropic_api_key", "ANTHROPIC_API_KEY")
    if dry_run or not key:
        return FakeLLM()
    return AnthropicLLM(key, _val(config, "anthropic_model", "ANTHROPIC_MODEL"))


def get_embeddings(dry_run: bool = False, config: Optional[dict] = None) -> EmbeddingProvider:
    provider = (_val(config, "embedding_provider", "EMBEDDING_PROVIDER") or "voyage").lower()
    if not dry_run:
        if provider == "voyage":
            key = _val(config, "voyage_api_key", "VOYAGE_API_KEY")
            if key:
                return VoyageEmbeddings(key, _val(config, "voyage_model", "VOYAGE_MODEL"))
        if provider == "openai":
            key = _val(config, "openai_api_key", "OPENAI_API_KEY")
            if key:
                return OpenAIEmbeddings(key, _val(config, "openai_embedding_model", "OPENAI_EMBEDDING_MODEL"))
    return FakeEmbeddings()


def get_image(dry_run: bool = False, config: Optional[dict] = None) -> ImageProvider:
    provider = (_val(config, "image_provider", "IMAGE_PROVIDER") or "openai").lower()
    if not dry_run and provider == "openai":
        key = _val(config, "openai_api_key", "OPENAI_API_KEY")
        if key:
            return OpenAIImage(key, _val(config, "image_model", "IMAGE_MODEL"))
    return FakeImage()
