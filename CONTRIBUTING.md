# Contributing to ProofFrontier

Thank you for helping make unfinished formal mathematics easier to inspect,
review, and complete without overstating its status.

## Development setup

1. Install Python 3.10 or newer.
2. Install Elan and enter the repository so `lean-toolchain` is selected.
3. Run the fast tests:

   ```bash
   python -m unittest discover -s tests -v
   node --check ui/app.js
   node tests/test_stale_race.js
   ```

4. Run the real Lean smoke test:

   ```bash
   python scripts/smoke_test.py
   python scripts/adversarial_test.py
   ```

## Pull requests

- Keep parser changes conservative and add a focused regression test.
- Preserve the order `source parse -> graph build -> exact-source frontend
  -> final Environment inspection`.
- Never infer `checked` from a whole-file return code.
- Never inject imports, declarations, or probe commands into submitted source.
- Keep the authenticated result parser fail-closed on missing or duplicate
  records.
- Keep `kernel-direct` and axiom closure as separate concepts.
- Keep explicit local work items (`isOpen`) separate from the stricter
  `isVerifiedClosed` predicate.
- Treat provenance badges as conservative summaries; never imply that a
  free-text citation was machine-verified.
- Demonstrate stale behavior when changing UI verification state.
- Do not commit graph output, caches, generated artifacts, or local paths.

## Reporting verification changes

Include:

- The smallest Lean source that reproduces the behavior.
- Lean version and whether a Lake workspace was used.
- Expected node IDs, edge basis, and trust closure.
- Whether source elaboration, environment inspection, or result authentication
  failed.

By submitting a contribution, you agree that it may be distributed under the
repository's MIT License.
