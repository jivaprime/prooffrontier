"""Trust-axis computation.

Two layers:

1. approximate propagation over the name-occurrence graph (always runs);
2. kernel-accurate override from `collectAxioms` closures (when a probe
   run succeeded). The kernel layer wins wherever it has data.

Defaults are conservative: an unannotated axiom is `conjectural`, and an
axiom appearing in a kernel closure that we cannot map to an in-file
annotation is also `conjectural`.
"""
from __future__ import annotations

from .model import (
    Decl, Source, Trust, TRUST_RANK, STANDARD_AXIOMS, SORRY_AXIOM,
)


def base_trust(d: Decl) -> Trust:
    if d.source == Source.AXIOM:
        return d.trust_annotation or Trust.CONJECTURAL
    return Trust.CLOSED


def propagate(decls: list[Decl], closures: dict[str, list[str]] | None = None) -> None:
    by_name = {d.name: d for d in decls}
    by_actual = {d.actual_name: d for d in decls if d.actual_name}

    for d in decls:
        d.trust = base_trust(d)
        d.open_dependency = d.source == Source.SORRY
        d.trust_basis = "approx"
        d.axiom_closure = None
        d.unknown_axioms = []

    # fixpoint over the approximate graph (cycle-safe by construction)
    changed = True
    while changed:
        changed = False
        for d in decls:
            for dep_name in d.deps:
                dep = by_name.get(dep_name)
                if dep is None:
                    continue
                if TRUST_RANK[dep.trust] > TRUST_RANK[d.trust]:
                    d.trust = dep.trust
                    changed = True
                if dep.open_dependency and not d.open_dependency:
                    d.open_dependency = True
                    changed = True

    if not closures:
        return

    # Kernel axiom closure is exact and independent of each node's edge basis.
    for name, axioms in closures.items():
        d = by_name.get(name)
        if d is None:
            continue
        trust = Trust.CLOSED
        unknown: list[str] = []
        open_dep = False
        for ax in axioms:
            short = ax.split(".")[-1]
            if ax == SORRY_AXIOM or short == SORRY_AXIOM:
                open_dep = True
                continue
            if ax in STANDARD_AXIOMS:
                continue
            ax_decl = by_actual.get(ax) or by_name.get(ax)
            if ax_decl is not None and ax_decl.source == Source.AXIOM:
                ax_trust = ax_decl.trust_annotation or Trust.CONJECTURAL
            else:
                ax_trust = Trust.CONJECTURAL
                unknown.append(ax)
            if TRUST_RANK[ax_trust] > TRUST_RANK[trust]:
                trust = ax_trust
        d.trust = trust
        d.open_dependency = open_dep
        d.trust_basis = "kernel"
        d.axiom_closure = axioms
        d.unknown_axioms = unknown
