# Validation record

Version: `0.1.0` with current `Unreleased` release-blocker fixes

Validated: 2026-07-28

Local toolchain: Lean `4.32.1`, Lake `5.0.0`

## Automated checks

- Core and server-boundary unit tests: 42/42 passing.
- JavaScript syntax: `node --check ui/app.js`.
- DOM regressions: 7/7 passing, covering exact-closure rendering, edit races,
  file/sample replacement, missing/unsupported schemas, and mismatched
  verification source hashes.
- End-to-end Lean smoke test: `examples/NamespaceModifiers.lean`.
- Adversarial Lean boundary test: `scripts/adversarial_test.py`.
- Release-name and artifact hygiene: `scripts/check_release.py`.

## Browser UI check

At 1280x720, the bundled sample verified 12/12 declarations with
`kernel-direct` edges and exact axiom closures. Editing the source immediately
removed every checked border and the displayed source hash. Reloading the
sample kept it unverified until a fresh Verify completed, then restored the
matching checked state without page overflow.

## Namespace/modifier experiment

The smoke source contains:

- Two independent short names: `Alpha.shared` and `Beta.shared`.
- A cited axiom: `Beta.base`.
- A private theorem: `Beta.hidden`.
- An attributed/protected theorem: `@[simp] protected theorem Beta.shared`.
- A final theorem: `Beta.FINAL_namespace`.

Observed graph:

```text
Beta.base
  -> Beta.hidden
  -> Beta.shared
  -> Beta.FINAL_namespace
```

All five declarations produced authenticated environment records. Every displayed edge in the
chain was `kernel-direct`; the private kernel name was mapped back to the
stable graph ID `Beta.hidden`.

## Partial-failure experiment

An invalid reference in the final declaration produced:

- Four earlier nodes: `checked`, with `kernel-direct` edges.
- The erroneous node: `failed`, with its edge retained as `source-approx`.
- Whole graph basis: `mixed`.

This confirms that a file-level failure is not projected onto every node.

## Adversarial result-channel experiment

The regression suite verifies five hostile boundary cases:

- Unauthenticated `PFNODE`-style output and a protocol-looking fake frame cannot change a
  node's actual name, dependencies, or axiom closure.
- A source declaration named `proofFrontierNodeProbe` succeeds, demonstrating that
  probe syntax and imports are not injected into the source environment.
- A failed middle declaration leaves earlier and later realized declarations
  checked, while the failed node stays approximate.
- A successful declaration followed by `#check Missing.name` stays checked;
  the trailing context error is not attributed to that declaration.
- `IO.Process.exit 0` before driver completion yields no authenticated frame;
  the run is `probe-protocol-failed` with zero checked nodes.

The driver token is consumed from stdin before source elaboration. Exactly one
matching structured frame is required, and duplicate node records are rejected.

## Stale experiment

After a successful three-edge graph verification:

```text
before edit: kernel-direct=3, source-approx=0
after edit:  kernel-direct=0, source-approx=3
```

The edit also cleared all checked states, kernel IDs, axiom closures, and the
source hash before the debounced static parse completed. The automated DOM
regression holds a verified response in flight, edits the source, then confirms
that the late response cannot restore a checked border, source hash, or
`Lean OK` label.

The file replacement regression holds `file.text()` unresolved and confirms
that the previous checked graph and source hash are revoked before the new
file contents arrive.

## Protocol compatibility experiment

The DOM suite submits otherwise valid verified payloads with a missing or
unsupported `schemaVersion`. Both are rejected before any checked node is
applied. A valid-schema payload with the wrong source hash is rejected by the
same atomic boundary.

The stale-response regression returns an unsupported schema from a request
invalidated by a source edit. The response is discarded without replacing the
current stale notice with a protocol error.

## Exact-closure experiment

`verified-closed` now requires `trustBasis=kernel` in addition to checked,
proved, closed, no open dependency, and current freshness. Unit tests confirm
that conjectural and `sorryAx` exact seeds propagate to approximate downstream
nodes. Duplicate requested graph IDs are rejected before an exact probe report
can be accepted.

## Honesty check

The bundled `Sample.lean` typechecks, but it intentionally contains `sorry` and
axiom declarations. ProofFrontier reports those as open/trusted-contract states;
it does not claim that the sample is a closed proof.
