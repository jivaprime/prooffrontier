#!/usr/bin/env python3
"""ProofFrontier CLI.

Usage:
  python prooffrontier_cli.py --lean examples/Sample.lean --outdir graph_out
  python prooffrontier_cli.py --lean file.lean --no-lean          # static only
  python prooffrontier_cli.py --lean file.lean --no-axioms        # skip axiom closures
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
from pathlib import Path

from prooffrontier.analyze import analyze
from prooffrontier.report import text_report, write_dot, write_json


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lean", required=True, help="Lean file path")
    ap.add_argument("--outdir", default="graph_out")
    ap.add_argument("--workspace", default=None,
                    help="directory whose Lake project should be used (default: the Lean file's directory)")
    ap.add_argument("--no-lean", action="store_true", help="static parse only")
    ap.add_argument(
        "--no-axioms", action="store_true",
        help="probe node IDs and direct edges, but skip axiom closures",
    )
    ap.add_argument("--timeout", type=int, default=120)
    args = ap.parse_args()

    lean_path = Path(args.lean)
    workspace = Path(args.workspace) if args.workspace else lean_path.resolve().parent
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    source = lean_path.read_text(encoding="utf-8")
    analysis = analyze(
        source, filename=lean_path.name, workspace=workspace,
        run_lean=not args.no_lean, probe_axioms=not args.no_axioms,
        timeout=args.timeout,
    )

    print(text_report(analysis))

    dot_path = outdir / "proof_frontier.dot"
    json_path = outdir / "proof_frontier.json"
    write_dot(analysis["_decl_objects"], dot_path, f"ProofFrontier · {lean_path.name}")
    write_json(analysis, json_path)
    print(f"\n  DOT : {dot_path}")
    print(f"  JSON: {json_path}")

    dot = shutil.which("dot")
    if dot:
        png_path = outdir / "proof_frontier.png"
        subprocess.run([dot, "-Tpng", str(dot_path), "-o", str(png_path)], check=False)
        if png_path.exists():
            print(f"  PNG : {png_path}")
    else:
        print("  PNG : not rendered (graphviz dot not found)")


if __name__ == "__main__":
    main()
