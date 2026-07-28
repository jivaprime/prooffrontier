# Related work and positioning

Last reviewed: 2026-07-28.

Dependency graphs, unfinished-proof tracking, proof blueprints, stale-session
management, collaborative theorem proving, and reproducible certificates all
predate ProofFrontier. This page gives a concise product and engineering
comparison. It is not a patent novelty or freedom-to-operate opinion.

## Nearby work

| Area | Examples | What is already established | ProofFrontier's present scope |
|---|---|---|---|
| Formalization blueprints | [leanblueprint](https://github.com/PatrickMassot/leanblueprint), [Verso Blueprint](https://github.com/leanprover/verso-blueprint), [LeanArchitect](https://arxiv.org/abs/2601.22554) | Informal/formal links, dependency plans, automatic `sorry` progress, upstream-completion states, source provenance, owners, priorities, and ready work | Audits the current Lean declaration graph and axiom closure. It does not replace the blueprint planning or semantic-review layer. |
| Work-in-progress proof management | [IsabelleBlueprint](https://github.com/Arthur742Ramos/isa-blueprint) | `proved`, `tainted`, `stale`, and `broken` states, partial source indexing, critical paths, task queues, ownership, and GitHub handoff | Implements a smaller Lean-specific evidence contract: per-node exact/approximate edges and exact-buffer invalidation in a one-file workbench. |
| Dependency visualization and audit | [coq-dpdgraph](https://github.com/rocq-community/coq-dpdgraph), [lean-graph](https://github.com/patrik-cihal/lean-graph), [LeanDepViz](https://github.com/cameronfreer/LeanDepViz) | Declaration graphs, visible admitted/axiomatic nodes, compiled-project inspection, policy checks, and independent replay | Keeps a graph visible through partial failure and does not collapse kernel acceptance, source completion, and assumption provenance into one result. LeanDepViz is stronger for release-time multi-checker audit. |
| Conditional and stale proof state | [Prove-It](https://sandialabs.github.io/Prove-It/guide.html), [Why3](https://why3.org/doc/manpages.html), [ImandraX](https://imandrax.dev/docs/verification/incremental-proofs/) | Tracking conclusions that depend on unproved lemmas, preserving obsolete proof attempts, and invalidating downstream work after a dependency changes or fails | Applies related ideas to Lean declarations, with kernel axiom closure and source-hash-bound visual evidence. |
| Semantic and evidence review | [Lean Atlas](https://arxiv.org/abs/2604.16347), [ProofAtlas](https://www.proofatlas.ai/) | Separating the mathematical claim, exact formal statement, checked evidence, source material, and human review | Reports what the Lean declaration proves and depends on. It does not currently certify that the declaration faithfully translates the original mathematics. |
| Collaborative proof workspaces | [ProofMesh](https://github.com/CarmenSalvado/ProofMesh), [ProofPeer](https://arxiv.org/abs/1404.6186) | Shared mathematical writing, visual proof canvases, Lean execution, discussion, and human/AI collaboration | `0.1.x` is local and single-file. Owners, discussions, project history, and review queues are roadmap items. |
| Reproducible proof ledgers | [TheoremForces](https://theoremforces.org/), `lean4checker`, SafeVerify, comparator | Pinned environments, axiom reports, isolated or independent checking, content-addressed certificates, and release records | Tracks mutable work in progress rather than minting an immutable accepted-proof certificate. Independent replay is not yet a built-in evidence axis. |
| Large theorem graphs | [TheoremGraph](https://arxiv.org/abs/2606.25363) | Multi-project formal/informal graphs for retrieval, attribution, and analysis | Operates locally on the source being edited. TheoremGraph's formal extractor is named `LeanGraph`; ProofFrontier is a separate project. |

## Current technical focus

ProofFrontier's current identity is its implemented evidence transition, not a
claim that each ingredient is new:

```text
source hash h
  -> stable declaration nodes + source-approx edges
  -> exact-source Lean elaboration
  -> per-node checked / failed / unchecked records
  -> kernel-direct edges + axiom closures where available
  -> edit to source hash h'
  -> immediate revocation of evidence from h
```

Four rules follow from that transition:

1. Incomplete work remains a named research object.
2. Exact and approximate evidence may coexist, but are visibly different.
3. Kernel status, source status, and assumption provenance remain separate.
4. Positive evidence is valid only for the exact source that produced it.

Lean determines the axiom closure. Human annotations classify an axiom as
`library`, `cited-external`, or `conjectural`; ProofFrontier propagates that
classification conservatively. A citation is navigation and policy metadata,
not machine-verified evidence that the cited mathematics is correct.

## Complementary workflow

The tools can occupy different stages of one workflow:

```text
paper or informal argument
  -> Verso Blueprint / LeanArchitect: intended structure and source links
  -> Lean source
  -> ProofFrontier: live proof frontier and assumption flow
  -> Lean Atlas / human review: statement fidelity
  -> lean4checker / comparator / certificate ledger: release evidence
```

Differences between intended, source-approximate, and kernel-realized graphs
are useful audit findings. They should remain separate instead of being forced
to agree.

## Naming note

`LeanGraph` is used by TheoremGraph's formal extractor, `lean-graph` is an
existing visualization project, and [MathGraph](https://www.mathgraph.org/)
is used by a verification-memory system. **ProofFrontier** instead names the
boundary between kernel-backed results and work that remains assumed, failed,
approximate, or stale.

The first public release uses `prooffrontier` consistently for the Python
package, CLI, scratch directory, and authenticated probe protocol. No
pre-release working name is part of the compatibility contract.
