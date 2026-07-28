"""Three-axis state model for ProofFrontier declarations.

ProofFrontier separates what a single color used to conflate:

* kernel : did the Lean kernel actually check this run of this source?
* source : what does the source text claim (proved / sorry / axiom)?
* trust  : what does the conclusion transitively rest on?
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class Kernel(str, Enum):
    UNCHECKED = "unchecked"  # no successful Lean run for this exact source
    CHECKED = "checked"      # authenticated Environment record for this source hash
    FAILED = "failed"        # an error diagnostic landed inside this declaration


class Source(str, Enum):
    PROVED = "proved"  # no sorry in body, not an axiom-like declaration
    SORRY = "sorry"    # body contains a word-boundary `sorry`
    AXIOM = "axiom"    # axiom / constant


class Trust(str, Enum):
    CLOSED = "closed"                  # rests only on kernel-standard axioms
    LIBRARY = "library"                # rests on standard-library-grade facts
    CITED = "cited-external"           # rests on cited literature results
    CONJECTURAL = "conjectural"        # rests on framework-specific hypotheses


TRUST_RANK = {
    Trust.CLOSED: 0,
    Trust.LIBRARY: 1,
    Trust.CITED: 2,
    Trust.CONJECTURAL: 3,
}

# Axioms the Lean/Mathlib ecosystem treats as foundational; they do not
# lower trust below `closed`. This is a conservative display/policy severity,
# not a claim that every library fact is epistemically stronger than every
# cited external result.
STANDARD_AXIOMS = {"propext", "Classical.choice", "Quot.sound"}
SORRY_AXIOM = "sorryAx"


@dataclass
class Decl:
    kind: str
    name: str
    start: int
    end: int
    line: int
    end_line: int
    body: str
    stripped_body: str
    signature: str

    source_name: str = ""                  # identifier as written in the source
    namespace: str = ""                    # enclosing Lean namespace
    modifiers: list[str] = field(default_factory=list)

    source: Source = Source.PROVED
    kernel: Kernel = Kernel.UNCHECKED
    trust: Trust = Trust.CLOSED
    trust_basis: str = "approx"  # source graph or kernel collectAxioms result
    open_dependency: bool = False  # transitively rests on a sorry

    trust_annotation: Trust | None = None  # from PF-TRUST, axioms only
    evidence: str = ""                     # ref="..." of PF-TRUST
    subtasks: list[str] = field(default_factory=list)  # PF-SUBTASK lines

    deps: list[str] = field(default_factory=list)
    approx_deps: list[str] = field(default_factory=list)
    dependents: list[str] = field(default_factory=list)
    edge_basis: str = "source-approx"
    actual_name: str = ""                  # kernel name, including private mangling

    axiom_closure: list[str] | None = None  # from collectAxioms, when available
    unknown_axioms: list[str] = field(default_factory=list)
    diagnostics: list[dict] = field(default_factory=list)

    @property
    def is_open(self) -> bool:
        """An explicit local work item: sorry/axiom source or failed Lean node."""
        return self.source != Source.PROVED or self.kernel == Kernel.FAILED

    @property
    def is_verified_closed(self) -> bool:
        """A node whose exact kernel evidence supports an unconditional close."""
        return (
            self.kernel == Kernel.CHECKED
            and self.source == Source.PROVED
            and self.trust == Trust.CLOSED
            and not self.open_dependency
            and self.trust_basis == "kernel"
        )

    def to_dict(self) -> dict:
        return {
            "kind": self.kind,
            "name": self.name,
            "id": self.name,
            "sourceName": self.source_name or self.name,
            "namespace": self.namespace,
            "modifiers": self.modifiers,
            "line": self.line,
            "endLine": self.end_line,
            "signature": self.signature,
            "source": self.source.value,
            "kernel": self.kernel.value,
            "trust": self.trust.value,
            "trustBasis": self.trust_basis,
            "openDependency": self.open_dependency,
            "trustAnnotation": self.trust_annotation.value if self.trust_annotation else None,
            "evidence": self.evidence,
            "subtasks": self.subtasks,
            "deps": self.deps,
            "approxDeps": self.approx_deps,
            "dependents": self.dependents,
            "edgeBasis": self.edge_basis,
            "actualName": self.actual_name,
            "axiomClosure": self.axiom_closure,
            "unknownAxioms": self.unknown_axioms,
            "diagnostics": self.diagnostics,
            "isOpen": self.is_open,
            "isVerifiedClosed": self.is_verified_closed,
        }
