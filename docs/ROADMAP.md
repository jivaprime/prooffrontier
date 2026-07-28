# Roadmap

ProofFrontier aims to become collaborative infrastructure for long,
partially formalized mathematical arguments. The roadmap preserves one rule:

> Visual certainty must never exceed the evidence produced for the exact
> source being displayed.

## 0.1: local evidence-aware workbench

- [x] Fully qualified declaration nodes for the supported source grammar
- [x] Static graph before Lean verification
- [x] Exact-source frontend and final Environment inspection
- [x] Per-node `checked`, `failed`, and `unchecked` status
- [x] Kernel-direct versus source-approximate edges
- [x] Transitive axiom closures
- [x] Conservative assumption-provenance annotations
- [x] Immediate stale invalidation
- [x] Authenticated, fail-closed result channel
- [x] Versioned public JSON and API payloads (`schemaVersion`)
- [x] UI, CLI, JSON, DOT, tests, and GitHub Actions

## 0.2: stronger evidence model

- [ ] Store provenance as a set of axiom records instead of only a worst-case
  badge
- [ ] Separate provenance category from project policy verdict
- [ ] Add structured references such as DOI, arXiv ID, URL, library module,
  version, and commit
- [ ] Distinguish logical axioms, compiler-trusted computation, cited facts,
  and project conjectures
- [ ] Export a machine-readable closure certificate for each target theorem
- [ ] Add a strict CLI release gate for selected target declarations

## 0.3: project-scale graphs

- [ ] Expand imports into a multi-file declaration graph
- [ ] Cover `mutual`, `inductive`, `structure`, generated declarations,
  escaped identifiers, and macro-defined declaration forms
- [ ] Preserve stable public node identities across private-name mangling and
  generated declarations
- [ ] Incrementally recheck only affected files and dependency cones
- [ ] Add target sets and saved graph views

## 0.4: history and collaboration

- [ ] Save source-hash and commit-bound verification snapshots
- [ ] Show graph diffs for added, removed, opened, closed, and provenance-
  changed nodes
- [ ] Attach owner, reviewer, discussion, and blocking-task metadata to nodes
- [ ] Generate review queues from the open dependency frontier
- [ ] Export GitHub issue and pull-request references without making GitHub a
  trust authority
- [ ] Support shareable read-only audit reports

## 0.5: independent validation

- [ ] Add `lean4checker --fresh` results as a separate replay axis
- [ ] Support SafeVerify or comparator for trusted challenge/submission
  workflows
- [ ] Keep frontend acceptance, kernel replay, policy checks, and semantic
  review as separate evidence
- [ ] Provide sandbox guidance and adapters for untrusted Lean submissions

## 1.0: collaborative proof research

- [ ] Import or link Verso Blueprint and other conceptual blueprint nodes to
  one or more Lean declarations instead of duplicating their planning layer
- [ ] Display intended, source-approximate, and kernel-realized edges without
  conflating them
- [ ] Keep the informal claim, exact Lean statement, checked evidence, and
  human review status visibly separate
- [ ] Provide a project dashboard for established results, conditional
  results, open obligations, citations, conjectures, and stale evidence
- [ ] Define and document a stable JSON schema and plugin interface
- [ ] Validate the workflow on multiple real collaborative formalizations

## Evaluation plan

Before a `1.0` claim, the project should report:

- declaration and edge coverage on a documented corpus;
- behavior under syntax errors, type errors, `sorry`, custom axioms, private
  declarations, macros, and source edits;
- false exactness rate, which must remain zero under the stated threat model;
- latency for parse, verification, invalidation, and incremental refresh;
- comparison with raw Lean diagnostics and established graph tools;
- a small user study measuring whether researchers identify open assumptions
  and bottlenecks more accurately or quickly.
