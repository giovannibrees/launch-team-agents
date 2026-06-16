#!/usr/bin/env python3
"""Validate the Launch Team agent repo for structural consistency.

Checks (errors fail CI; warnings don't):
  - agents.json and openclaw.config.example.json are valid JSON
  - every agent in agents.json has its workspace dir + SOUL.md, AGENTS.md, README.md
  - every path referenced in agents.json (path, operating_manual, workspace,
    knowledge, shared_knowledge) actually exists
  - the orchestrator named in agents.json exists as an agent
  - every workspace in openclaw.config.example.json exists and has a SOUL.md
  - agents.json agents and the agents/ directories on disk match
  - (warning) every shared/*.md is referenced by at least one agent

Pure standard library. Run from anywhere:  python3 scripts/validate.py
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
errors: list[str] = []
warnings: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def load_json(rel: str):
    p = ROOT / rel
    if not p.is_file():
        err(f"missing file: {rel}")
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        err(f"invalid JSON in {rel}: {e}")
        return None


def must_exist(rel: str, why: str) -> None:
    if not (ROOT / rel).exists():
        err(f"{why}: missing path '{rel}'")


def main() -> int:
    referenced_shared: set[str] = set()

    # --- agents.json ---
    agents_index = load_json("agents.json")
    if agents_index is not None:
        orchestrator = agents_index.get("orchestrator")
        ids = set()

        for ref in agents_index.get("shared_knowledge", []):
            must_exist(ref, "agents.json shared_knowledge")
            if ref.startswith("shared/"):
                referenced_shared.add(ref)

        for a in agents_index.get("agents", []):
            aid = a.get("id", "<no-id>")
            ids.add(aid)
            for key in ("path", "operating_manual", "workspace"):
                if key in a:
                    must_exist(a[key], f"agents.json agent '{aid}' {key}")
            ws = a.get("workspace")
            if ws:
                for f in ("SOUL.md", "AGENTS.md", "README.md"):
                    must_exist(f"{ws}/{f}", f"agent '{aid}' workspace")
            for ref in a.get("knowledge", []):
                must_exist(ref, f"agents.json agent '{aid}' knowledge")
                if ref.startswith("shared/"):
                    referenced_shared.add(ref)

        if orchestrator and orchestrator not in ids:
            err(f"orchestrator '{orchestrator}' is not one of the agents: {sorted(ids)}")

        # agents.json vs agents/ directories on disk
        disk = {p.name for p in (ROOT / "agents").iterdir() if p.is_dir()} \
            if (ROOT / "agents").is_dir() else set()
        for missing in ids - disk:
            err(f"agent '{missing}' in agents.json has no agents/ directory")
        for extra in disk - ids:
            warn(f"agents/{extra} exists on disk but is not in agents.json")

    # --- openclaw.config.example.json ---
    cfg = load_json("openclaw.config.example.json")
    if cfg is not None:
        for entry in cfg.get("agents", {}).get("list", []):
            ws = (entry.get("workspace", "") or "").lstrip("./")
            name = entry.get("name", "<no-name>")
            if ws:
                must_exist(ws, f"openclaw config agent '{name}' workspace")
                must_exist(f"{ws}/SOUL.md", f"openclaw config agent '{name}'")

    # --- orphan shared docs (warning only) ---
    shared_dir = ROOT / "shared"
    if shared_dir.is_dir():
        for p in sorted(shared_dir.glob("*.md")):
            rel = f"shared/{p.name}"
            if rel not in referenced_shared:
                warn(f"{rel} is not referenced by any agent in agents.json")

    # --- report ---
    for w in warnings:
        print(f"WARN  {w}")
    for e in errors:
        print(f"ERROR {e}")
    if errors:
        print(f"\nFAILED: {len(errors)} error(s), {len(warnings)} warning(s).")
        return 1
    print(f"OK: validation passed ({len(warnings)} warning(s)).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
