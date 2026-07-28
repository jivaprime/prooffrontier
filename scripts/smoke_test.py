#!/usr/bin/env python3
"""Run a small end-to-end ProofFrontier verification without repo-local output."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from prooffrontier.analyze import analyze  # noqa: E402


def main() -> None:
    source_path = ROOT / "examples" / "NamespaceModifiers.lean"
    source = source_path.read_text(encoding="utf-8")
    toolchain = (ROOT / "lean-toolchain").read_text(encoding="utf-8").strip()
    os.environ["ELAN_TOOLCHAIN"] = toolchain
    analysis = analyze(
        source,
        filename=source_path.name,
        workspace=ROOT,
        run_lean=True,
        timeout=180,
    )

    decls = {item["id"]: item for item in analysis["decls"]}
    expected_chain = {
        "Beta.base": [],
        "Beta.hidden": ["Beta.base"],
        "Beta.shared": ["Beta.hidden"],
        "Beta.FINAL_namespace": ["Beta.shared"],
    }

    assert analysis["run"]["status"] == "ok", analysis["run"]
    assert analysis["run"]["nodeSummary"]["checked"] == 5, analysis["run"]
    assert analysis["graph"]["edgeBasis"] == "kernel-direct", analysis["graph"]
    for node_id, deps in expected_chain.items():
        assert decls[node_id]["deps"] == deps, (node_id, decls[node_id])
        assert decls[node_id]["edgeBasis"] == "kernel-direct"
    assert "private" in decls["Beta.hidden"]["modifiers"]
    assert decls["Beta.hidden"]["actualName"].startswith("_private.")
    assert decls["Beta.shared"]["modifiers"] == ["@[simp]", "protected"]

    print("ProofFrontier smoke test: 5/5 nodes checked; kernel-direct chain verified.")


if __name__ == "__main__":
    main()
