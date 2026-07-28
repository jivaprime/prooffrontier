# ProofFrontier

> Visualize what is proved, assumed, unresolved, and stale.

ProofFrontier is a local, evidence-aware workbench for ongoing Lean
formalizations. It turns declarations into a dependency graph and keeps
verified results, open obligations, external assumptions, and stale evidence
visibly separate.

It is designed for long mathematical developments where a binary
pass/fail result is not enough:

- Which declarations have Lean actually accepted for this exact source?
- Which results still contain `sorry` or rest on a declared axiom?
- What kind of assumption reaches a target theorem, and by which path?
- Which edges came from Lean's environment and which are only source
  approximations?
- What evidence became invalid when the source changed?

ProofFrontier does **not** turn unfinished work into a proof. It preserves
unfinished work as explicit, attributable research state so that it can be
reviewed, divided, and completed without hiding the remaining gap.

> Experimental release: `0.1.0`. ProofFrontier is an audit and research-workflow
> aid, not a replacement for reviewing formal statement fidelity, imported
> libraries, or the trusted computing base.

[한국어 README](README.ko.md) ·
[Methodology (Korean)](docs/METHODOLOGY.ko.md) ·
[Validation record](docs/VALIDATION.md) ·
[Related work](docs/RELATED_WORK.md) ·
[Roadmap](docs/ROADMAP.md)

![ProofFrontier showing a verified namespace example](docs/assets/prooffrontier-ui.png)

## The core idea

A normal Lean build answers whether the submitted source elaborates.
ProofFrontier is also useful before release, while the proof is still being built.

An open theorem, a cited external result, and a new conjecture are not the
same research state. ProofFrontier keeps them as named nodes, propagates their
effect to downstream declarations, and records whether each displayed claim
is backed by source analysis or by the current Lean environment.

This makes the graph a working-state ledger for:

- locating the current proof frontier;
- identifying bottleneck lemmas and conditional conclusions;
- identifying declaration-sized tasks that can be handed off or reviewed;
- reporting proved results without overstating their scope;
- rechecking exactly what changed after an edit.

The `0.1.x` release is a one-file evidence workbench. Project-wide history,
owners, review queues, and discussion metadata are roadmap items rather than
current collaboration features.

## Three independent axes

Each declaration carries three claims that must not be collapsed into one
`verified` flag.

| Axis | Values | Question | Visual encoding |
|---|---|---|---|
| Kernel | `checked`, `failed`, `unchecked` | Did this declaration appear in the authenticated Environment for this source? | Node border |
| Source | `proved`, `sorry`, `axiom` | What kind of completion does the source claim? | Node fill |
| Trust / provenance | `closed`, `library`, `cited-external`, `conjectural` | What does the result transitively rest on? | Badge |

Examples:

- `checked + proved + closed`: locally checked and closed.
- `checked + axiom + cited-external`: accepted by Lean, but still an external
  contract.
- `checked + proved + conjectural`: type-correct, but transitively conditional
  on a project-specific hypothesis.
- `checked + proved + open-dep`: accepted, but its axiom closure contains
  `sorryAx`.

`verified-closed` is deliberately strict. It requires:

```text
kernel=checked
source=proved
trust=closed
no transitive sorryAx dependency
```

Trust labels summarize assumption provenance for navigation and policy. A
free-text citation is not itself machine-verified evidence; the full axiom
closure remains visible for human review.

## Evidence refinement

```text
Lean source
  -> static declaration parse
  -> fully qualified nodes + source-approx edges
  -> authenticated exact-source Lean frontend
  -> final Environment inspection for each requested node
  -> kernel-direct edges + transitive axiom closures
  -> UI / JSON / DOT
```

ProofFrontier first creates stable visual nodes. A separate driver then
elaborates the unmodified UTF-8 source once and inspects the resulting
Environment.
Successful declaration records upgrade approximate evidence to kernel-backed
evidence. Declarations not realized by that run remain failed or unchecked
and keep visibly approximate edges.

Editing the buffer immediately invalidates checked borders, kernel identities,
closures, exact edges, and `verified-closed` state. Results from an older
source hash never decorate the new source.

## Quick start

Requirements:

- Python 3.10 or newer
- [Elan](https://github.com/leanprover/elan), which installs Lean and Lake
- The Lean version pinned in [`lean-toolchain`](lean-toolchain)

No third-party Python packages are required.

```bash
python ui/server.py
```

Open <http://127.0.0.1:8766/>.

To use an existing Lake or Mathlib project environment:

```bash
python ui/server.py --workspace /path/to/lake-project
```

The UI provides target-route, full-graph, and open-task views. The graph can
be expanded to use the full browser viewport.

## CLI

Static graph plus Lean verification:

```bash
python prooffrontier_cli.py \
  --lean examples/NamespaceModifiers.lean \
  --outdir graph_out
```

Static analysis only:

```bash
python prooffrontier_cli.py \
  --lean examples/Sample.lean \
  --outdir graph_out \
  --no-lean
```

The CLI writes a text report, `proof_frontier.json`, and `proof_frontier.dot`.
Graphviz PNG rendering is optional. Public JSON reports and API analysis
responses carry a top-level integer `schemaVersion`; this release emits
`schemaVersion: 1`.

## Source annotations

Attach provenance to axiom declarations:

```lean
-- PF-TRUST: library ref="Lean core"
axiom known_fact : P

-- PF-TRUST: cited-external ref="Author (2025), Theorem 3"
axiom literature_fact : Q

-- PF-TRUST: conjectural ref="new project hypothesis"
axiom new_hypothesis : R
```

An unannotated axiom is conservatively `conjectural`. Imported axioms that
cannot be mapped to an exact in-file declaration are also reported as unknown
and treated as conjectural.

Record declaration-local work without pretending it has been discharged:

```lean
theorem MAIN_TASK : Goal := by
  -- PF-SUBTASK: prove the local estimate
  -- PF-SUBTASK: control the uniform error
  sorry
```

## Graph semantics

- Declaration IDs are fully qualified, such as `Alpha.shared`.
- Solid edges are `kernel-direct`; dashed edges are `source-approx`.
- Purple edges have at least one endpoint that is not `verified-closed`.
- Direct edges come from `ConstantInfo.getUsedConstantsAsSet`.
- Transitive assumption closures come from `collectAxioms`.
- Direct dependency edges and axiom closures are different data and are never
  presented as interchangeable.

## Research and release

ProofFrontier supports two working conventions:

| Stage | Convention |
|---|---|
| Research | Preserve `sorry`, axioms, failed nodes, citations, and conjectures as explicit work state. |
| Release review | Require target declarations to be `verified-closed`, then use independent replay or stronger checking when the threat model requires it. |

The second row is a review convention in `0.1.0`, not a claim that ProofFrontier
replaces `lean4checker`, SafeVerify, comparator, or external kernels.

## Security boundary

Lean elaboration can execute metaprograms and IO. **Only verify Lean source you
trust.** The server binds to `127.0.0.1`, requires JSON API requests, and
checks Host/Origin by default. Do not expose it to a network. Remote binding
requires the explicit `--allow-remote` flag and an external sandbox.

The per-run result token prevents source stdout from impersonating driver
records. It does not sandbox the Lean process or defend against actively
malicious proof code. See [SECURITY.md](SECURITY.md).

## Tests

```bash
python -m unittest discover -s tests -v
node --check ui/app.js
node tests/test_stale_race.js
python scripts/smoke_test.py
python scripts/adversarial_test.py
python scripts/check_release.py
```

GitHub Actions runs the unit, JavaScript, release-hygiene, exact-source, and
adversarial result-channel checks against the pinned Lean toolchain.

## Current scope

This release audits one Lean file at a time. Static declaration boundaries for
`mutual`, generated declarations from `inductive` and `structure`, escaped
identifiers, and expanded imported-module graphs remain future work. Nodes
without a successful Environment record always retain approximate evidence.

Project-wide graphs, versioned verification snapshots, structured provenance,
graph diffs, collaboration metadata, and independent kernel replay are tracked
in the [roadmap](docs/ROADMAP.md).

## Positioning and related work

Dependency graphs, unfinished-proof tracking, stale proof sessions,
formalization blueprints, collaborative proof workspaces, and reproducible
proof certificates all have prior art. ProofFrontier does not claim to have
invented any of those categories.

The present implementation focuses on a narrower combination:

- a stable declaration graph that remains visible when only part of a source
  file elaborates;
- per-node `kernel-direct` and `source-approx` evidence on the same graph;
- separate kernel, source, and assumption-provenance states;
- transitive axiom closure with conservative, human-supplied provenance;
- immediate revocation of evidence from an older source hash.

The kernel determines which axioms occur in a closure. It does not verify that
a human citation or provenance category is correct. ProofFrontier also does not
yet provide project-wide collaboration, informal-statement fidelity review,
or independent proof certificates.

See [RELATED_WORK.md](docs/RELATED_WORK.md) for a concise comparison with
Blueprint tools, work-in-progress trackers, dependency auditors, semantic
review tools, and certificate ledgers.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md)
before proposing parser or verification-contract changes. The key invariant is
simple: visual certainty must never exceed the evidence produced for the exact
source being displayed.

## License

[MIT License](LICENSE)
