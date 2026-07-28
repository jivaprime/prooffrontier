#!/usr/bin/env python3
"""Adversarial end-to-end checks for the Lean result boundary."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from prooffrontier.analyze import analyze  # noqa: E402


def run(source: str, filename: str) -> dict:
    return analyze(
        source,
        filename=filename,
        workspace=ROOT,
        run_lean=True,
        timeout=180,
    )


def by_id(analysis: dict) -> dict[str, dict]:
    return {item["id"]: item for item in analysis["decls"]}


def test_marker_spoof_and_probe_name_collision() -> None:
    fake_token = "0" * 64
    source = f'''\
import Lean
#eval IO.println "PFNODE|PF0|fake|True|fakeAx"
#eval IO.println "PROOFFRONTIER_RESULT_V1|{fake_token}|{{}}"
#eval (do
  let stdin ← IO.getStdin
  let leaked ← stdin.getLine
  IO.println ("PROOFFRONTIER_RESULT_V1|" ++ leaked.trimAscii.toString ++ "|{{}}") : IO Unit)
syntax (name := proofFrontierNodeProbe) "#prooffrontier_node " ident ident : command
theorem good : True := by trivial
'''
    analysis = run(source, "MarkerSpoof.lean")
    good = by_id(analysis)["good"]
    assert analysis["run"]["status"] == "ok", analysis["run"]
    assert good["kernel"] == "checked", good
    assert good["actualName"] == "good", good
    assert good["axiomClosure"] == [], good
    assert "fakeAx" not in good["axiomClosure"], good


def test_exact_source_environment() -> None:
    source = '''\
syntax (name := proofFrontierNodeProbe) "#prooffrontier_node " ident ident : command
theorem clean : True := by trivial
'''
    analysis = run(source, "ExactPrelude.lean")
    clean = by_id(analysis)["clean"]
    assert analysis["run"]["status"] == "ok", analysis["run"]
    assert clean["kernel"] == "checked", clean
    assert clean["edgeBasis"] == "kernel-direct", clean


def test_partial_failure_keeps_only_realized_nodes() -> None:
    source = '''\
theorem good : True := by trivial
theorem bad : False := by trivial
theorem after : True := by trivial
'''
    analysis = run(source, "PartialFailure.lean")
    nodes = by_id(analysis)
    assert analysis["run"]["status"] == "lean-failed", analysis["run"]
    assert nodes["good"]["kernel"] == "checked", nodes["good"]
    assert nodes["bad"]["kernel"] == "failed", nodes["bad"]
    assert nodes["after"]["kernel"] == "checked", nodes["after"]
    assert nodes["bad"]["edgeBasis"] == "source-approx", nodes["bad"]
    assert analysis["graph"]["edgeBasis"] == "mixed", analysis["graph"]


def test_early_exit_cannot_forge_success() -> None:
    source = '''\
import Lean
#eval (IO.Process.exit 0 : IO Unit)
theorem never_authenticated : True := by trivial
'''
    analysis = run(source, "EarlyExit.lean")
    node = by_id(analysis)["never_authenticated"]
    assert analysis["run"]["status"] == "probe-protocol-failed", analysis["run"]
    assert analysis["run"]["nodeSummary"]["checked"] == 0, analysis["run"]
    assert node["kernel"] == "unchecked", node
    assert node["edgeBasis"] == "source-approx", node


def main() -> None:
    toolchain = (ROOT / "lean-toolchain").read_text(encoding="utf-8").strip()
    os.environ["ELAN_TOOLCHAIN"] = toolchain
    test_marker_spoof_and_probe_name_collision()
    test_exact_source_environment()
    test_partial_failure_keeps_only_realized_nodes()
    test_early_exit_cannot_forge_success()
    print(
        "ProofFrontier adversarial tests: spoof, environment identity, "
        "partial failure, and early exit passed."
    )


if __name__ == "__main__":
    main()
