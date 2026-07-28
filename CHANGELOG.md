# Changelog

All notable changes to ProofFrontier are documented here.

## Unreleased

### Added

- Top-level `schemaVersion: 1` on public JSON reports and API analysis
  responses.
- A dependency-free DOM regression test for stale evidence arriving after a
  source edit.

### Changed

- Pinned the supported Lean toolchain to stable Lean `4.32.1` after smoke and
  adversarial driver compatibility checks.

## 0.1.0 - 2026-07-28

### Added

- Three independent proof-audit axes: kernel, source, and trust.
- Fully qualified declaration IDs and common declaration modifiers.
- Exact-source Lean frontend inspection with actual private-kernel-name mapping.
- `ConstantInfo` direct dependencies and `collectAxioms` trust closures.
- Authenticated, duplicate-rejecting result frames resistant to source-output
  spoofing and early process exit.
- Conservative trust mapping without short-name fallback.
- Adversarial Lean regression tests for the verification boundary.
- Immediate stale invalidation after source edits.
- Expandable dependency graph and explicit exact/approx/open edge legend.
- Local UI server, CLI reports, JSON/DOT output, examples, and CI.
- Localhost Host/Origin checks and explicit remote-access opt-in.

### Changed

- Public positioning now centers ongoing proof research, explicit limitations,
  and collaborative work rather than binary pass/fail verification.
- `verified-closed` now requires all three axes to close and no transitive
  `sorryAx` dependency.
- Conditional or unverified graph paths remain visually open through
  downstream declarations.
- `opaque` is treated as a definition-like declaration and is no longer
  classified as an axiom solely because of its keyword.
- Verification scratch files now live in the system temporary directory, so
  running the UI does not dirty the repository.
- Added an explicit related-work comparison and collaboration roadmap.
- Clarified that dependency graphs, progress tracking, stale sessions,
  collaborative workspaces, and proof certificates are established categories;
  the current focus is exact-source mixed evidence for unfinished Lean work.
