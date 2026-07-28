"""Report / DOT / JSON export with three-axis visual encoding.

DOT encoding:
* fillcolor  = source axis
* border     = kernel axis (color + penwidth + style)
* label line = trust badge, edge basis and open-dependency marker
"""
from __future__ import annotations

import json
from pathlib import Path

from .model import Decl, Kernel, Source, Trust

SOURCE_FILL = {
    Source.PROVED: "#b7f7c1",
    Source.SORRY: "#d7b3ff",
    Source.AXIOM: "#ffcc80",
}
KERNEL_BORDER = {
    Kernel.CHECKED: ("#1e7d3e", 2.4, "solid"),
    Kernel.FAILED: ("#c0392b", 3.0, "solid"),
    Kernel.UNCHECKED: ("#9aa5a0", 1.2, "dashed"),
}
TRUST_BADGE = {
    Trust.CLOSED: "closed",
    Trust.LIBRARY: "library",
    Trust.CITED: "cited",
    Trust.CONJECTURAL: "conjectural",
}


def badge_line(d: Decl) -> str:
    parts = [f"trust: {TRUST_BADGE[d.trust]}", f"edges: {d.edge_basis}"]
    if d.open_dependency:
        parts.append("open-dep")
    if d.trust_basis == "kernel":
        parts.append("kernel-exact")
    return " · ".join(parts)


def write_dot(decls: list[Decl], dot_path: Path, title: str) -> None:
    with dot_path.open("w", encoding="utf-8") as f:
        f.write("digraph ProofFrontier {\n")
        f.write("  rankdir=TB;\n")
        f.write(f'  graph [fontsize=12, labelloc="t", label="{title}"];\n')
        f.write('  node [shape=box, style="rounded,filled", fontname="Helvetica"];\n')
        f.write('  edge [color="#555555", arrowsize=0.7];\n\n')
        names = {d.name for d in decls}
        for d in decls:
            fill = SOURCE_FILL[d.source]
            color, penwidth, style = KERNEL_BORDER[d.kernel]
            styles = "rounded,filled" + (",dashed" if style == "dashed" else "")
            label = f"{d.kind} · {d.source.value}\\n{d.name}\\n[{badge_line(d)}]"
            f.write(
                f'  "{d.name}" [label="{label}", fillcolor="{fill}", '
                f'color="{color}", penwidth={penwidth}, style="{styles}"];\n'
            )
        f.write("\n")
        for d in decls:
            for dep in d.deps:
                if dep in names:
                    src = next(x for x in decls if x.name == dep)
                    open_edge = not (
                        src.is_verified_closed and d.is_verified_closed
                    )
                    attrs = []
                    if open_edge:
                        attrs.extend(['color="#9a73d8"', "penwidth=1.6"])
                    if d.edge_basis != "kernel-direct":
                        attrs.append('style="dashed"')
                    attr_text = f" [{', '.join(attrs)}]" if attrs else ""
                    f.write(f'  "{dep}" -> "{d.name}"{attr_text};\n')
        f.write("}\n")


def write_json(analysis: dict, json_path: Path) -> None:
    payload = {k: v for k, v in analysis.items() if not k.startswith("_")}
    json_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def text_report(analysis: dict) -> str:
    decls: list[Decl] = analysis["_decl_objects"]
    run = analysis["run"]
    lines: list[str] = []
    w = lines.append

    w("=" * 64)
    w("  ProofFrontier report")
    w("=" * 64)
    w(f"  declarations : {len(decls)}")
    w(f"  lean status  : {run['status']} (rc={run['returnCode']})")
    if run["sourceHash"]:
        w(f"  source hash  : sha256:{run['sourceHash'][:16]}…")
    node_summary = run.get("nodeSummary", {})
    w(f"  env records  : {node_summary.get('checked', 0)}/{node_summary.get('expected', len(decls))} checked")
    verified_closed = sum(d.is_verified_closed for d in decls)
    w(f"  fully closed : {verified_closed}/{len(decls)} verified-closed")
    w(f"  graph edges  : {analysis.get('graph', {}).get('edgeBasis', 'source-approx')}")
    w(f"  axiom closure: {'kernel-exact' if run['probeRan'] and run.get('probeOk') else 'partial / source-approx fallback'}")
    w("")

    w("  kernel axis:")
    for k in Kernel:
        items = [d for d in decls if d.kernel == k]
        if items:
            w(f"    {k.value:9s}: {len(items)}")
    w("  source axis:")
    for s in Source:
        items = [d for d in decls if d.source == s]
        if items:
            w(f"    {s.value:9s}: {len(items)}")
    w("  trust axis:")
    for t in Trust:
        items = [d for d in decls if d.trust == t]
        if items:
            w(f"    {t.value:14s}: {len(items)}")
    w("")

    open_decls = [d for d in decls if d.is_open]
    w(f"  open tasks ({len(open_decls)}):")
    for d in open_decls:
        w(f"    - [{d.source.value}] {d.name} (line {d.line})")
        if d.trust_annotation:
            ref = f' ref="{d.evidence}"' if d.evidence else ""
            w(f"        trust annotation: {d.trust_annotation.value}{ref}")
        elif d.source == Source.AXIOM:
            w("        trust annotation: MISSING -> defaults to conjectural")
        for sub in d.subtasks:
            w(f"        · subtask: {sub}")
    w("")

    w("  trust closure of checked theorems:")
    for d in decls:
        if d.kind in ("theorem", "lemma") and d.kernel == Kernel.CHECKED:
            closure = ", ".join(d.axiom_closure) if d.axiom_closure else "-"
            flags = []
            if d.open_dependency:
                flags.append("OPEN-DEP")
            if d.unknown_axioms:
                flags.append(f"unknown axioms: {', '.join(d.unknown_axioms)}")
            flag_str = f"  [{'; '.join(flags)}]" if flags else ""
            w(f"    - {d.name}: {d.trust.value} ({d.trust_basis}){flag_str}")
            if d.axiom_closure is not None:
                w(f"        axioms: [{closure}]")
    return "\n".join(lines)
