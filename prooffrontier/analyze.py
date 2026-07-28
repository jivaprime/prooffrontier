"""Orchestration: parse -> (optional) Lean run -> kernel labeling -> trust."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from .model import Decl, Kernel
from .parser import parse, rebuild_dependents
from .runner import LeanRunner, PROBE_KINDS
from .trust import propagate


def apply_kernel_axis(decls: list[Decl], run: dict[str, Any]) -> None:
    diagnostics = run.get("diagnostics", [])
    node_results = run.get("nodeResults", {})
    for d in decls:
        d.diagnostics = [
            item for item in diagnostics
            if item.get("line") is not None and d.line <= item["line"] <= d.end_line
        ]
        has_error = any(item["severity"] == "error" for item in d.diagnostics)
        if has_error:
            d.kernel = Kernel.FAILED
        elif node_results.get(d.name, {}).get("ok"):
            d.kernel = Kernel.CHECKED
        else:
            d.kernel = Kernel.UNCHECKED


def apply_kernel_edges(decls: list[Decl], run: dict[str, Any]) -> None:
    node_results = run.get("nodeResults", {})
    by_name = {d.name: d for d in decls}
    actual_to_id: dict[str, str] = {}

    for d in decls:
        result = node_results.get(d.name)
        if result is None or d.kernel == Kernel.FAILED:
            d.actual_name = ""
            continue
        d.actual_name = result.get("actualName", "")
        if d.actual_name:
            actual_to_id[d.actual_name] = d.name

    for d in decls:
        result = node_results.get(d.name)
        if result is None or d.kernel == Kernel.FAILED:
            d.deps = list(d.approx_deps)
            d.edge_basis = "source-approx"
            continue

        exact_deps: list[str] = []
        for raw_name in result.get("directConstants", []):
            dep_id = actual_to_id.get(raw_name)
            if dep_id is None and raw_name in by_name:
                dep_id = raw_name
            if dep_id is None or dep_id == d.name or dep_id in exact_deps:
                continue
            exact_deps.append(dep_id)
        d.deps = exact_deps
        d.edge_basis = "kernel-direct"

    rebuild_dependents(decls)


def analyze(source: str, filename: str = "Input.lean",
            workspace: Path | None = None,
            run_lean: bool = True,
            probe_axioms: bool = True,
            timeout: int = 120) -> dict[str, Any]:
    decls = parse(source)
    run: dict[str, Any] = {"ok": None, "status": "not-run", "sourceHash": None,
                           "axiomClosures": {}, "diagnostics": [], "notes": [],
                           "command": "", "output": "", "probeRan": False}
    if run_lean:
        runner = LeanRunner(workspace or Path.cwd(), timeout=timeout)
        node_targets = [
            {"id": d.name, "probeName": d.name}
            for d in decls if d.kind in PROBE_KINDS
        ]
        run = runner.verify(
            source, filename, node_targets, probe_axioms=probe_axioms,
        )
        apply_kernel_axis(decls, run)
        apply_kernel_edges(decls, run)

    checked_names = {d.name for d in decls if d.kernel == Kernel.CHECKED}
    checked_closures = {
        name: closure
        for name, closure in run.get("axiomClosures", {}).items()
        if name in checked_names
    }
    propagate(decls, checked_closures or None)

    errors = sum(1 for i in run.get("diagnostics", []) if i["severity"] == "error")
    warnings = sum(1 for i in run.get("diagnostics", []) if i["severity"] == "warning")
    edge_bases = {d.edge_basis for d in decls}
    if edge_bases == {"kernel-direct"}:
        graph_edge_basis = "kernel-direct"
    elif len(edge_bases) > 1:
        graph_edge_basis = "mixed"
    else:
        graph_edge_basis = "source-approx"
    return {
        "decls": [d.to_dict() for d in decls],
        "_decl_objects": decls,
        "graph": {
            "edgeBasis": graph_edge_basis,
            "pipeline": [
                "source-parse",
                "graph-build",
                "exact-source-environment",
            ],
        },
        "run": {
            "ok": run.get("ok"),
            "status": run.get("status"),
            "returnCode": run.get("returnCode"),
            "command": run.get("command", ""),
            "sourceHash": run.get("sourceHash"),
            "probeRan": run.get("probeRan", False),
            "probeOk": run.get("probeOk"),
            "verificationUnit": run.get("verificationUnit", "node"),
            "nodeSummary": {
                "expected": len(decls),
                "checked": sum(d.kernel == Kernel.CHECKED for d in decls),
                "failed": sum(d.kernel == Kernel.FAILED for d in decls),
                "unchecked": sum(d.kernel == Kernel.UNCHECKED for d in decls),
            },
            "notes": run.get("notes", []),
            "summary": {"errors": errors, "warnings": warnings},
            "output": run.get("output", ""),
        },
    }
