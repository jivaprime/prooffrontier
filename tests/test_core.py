"""Unit tests for the ProofFrontier core (no Lean executable required)."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from prooffrontier.analyze import (
    SCHEMA_VERSION,
    analyze,
    apply_kernel_axis,
    apply_kernel_edges,
)
from prooffrontier.model import Kernel, Source, Trust
from prooffrontier.parser import parse, strip_comments
from prooffrontier.report import write_json
from prooffrontier.runner import (
    LeanRunner,
    PROBE_FRAME_PREFIX,
    PROBE_PROTOCOL,
    ProbeProtocolError,
    parse_axiom_closures,
    parse_diagnostics,
    parse_probe_report,
)
from prooffrontier.trust import propagate


class TestAnalysisSchema(unittest.TestCase):
    def test_exported_json_has_schema_version(self):
        analysis = analyze(
            "theorem schema_example : True := trivial\n",
            run_lean=False,
        )
        self.assertEqual(analysis["schemaVersion"], SCHEMA_VERSION)

        with patch.object(Path, "write_text") as write_text:
            write_json(analysis, Path("report.json"))
        report = json.loads(write_text.call_args.args[0])

        self.assertEqual(report["schemaVersion"], 1)
        self.assertNotIn("_decl_objects", report)


class TestParser(unittest.TestCase):
    def test_word_boundary_sorry(self):
        src = (
            "theorem uses_sorryAx : True := trivial_sorryAx_helper\n"
            "theorem real_sorry : True := by sorry\n"
        )
        decls = parse(src)
        self.assertEqual(decls[0].source, Source.PROVED)
        self.assertEqual(decls[1].source, Source.SORRY)

    def test_sorry_in_comment_ignored(self):
        src = (
            "theorem fine : True := trivial\n"
            "-- this used to be sorry, now closed\n"
            "theorem also_fine : True := trivial\n"
        )
        decls = parse(src)
        self.assertTrue(all(d.source == Source.PROVED for d in decls))

    def test_block_comment_stripped_for_deps(self):
        src = (
            "def helper : Nat := 1\n"
            "/- helper is mentioned here only in a comment -/\n"
            "theorem indep : True := trivial\n"
        )
        decls = parse(src)
        indep = next(d for d in decls if d.name == "indep")
        self.assertNotIn("helper", indep.deps)

    def test_leading_trust_annotation_binds_to_next_decl(self):
        src = (
            "theorem first : True := trivial\n"
            '-- PF-TRUST: library ref="core lemma"\n'
            "axiom lib_ax : True\n"
        )
        decls = parse(src)
        first = next(d for d in decls if d.name == "first")
        lib_ax = next(d for d in decls if d.name == "lib_ax")
        self.assertIsNone(first.trust_annotation)
        self.assertEqual(lib_ax.trust_annotation, Trust.LIBRARY)
        self.assertEqual(lib_ax.evidence, "core lemma")

    def test_subtask_extraction(self):
        src = (
            "theorem TASK : True := by\n"
            "  -- PF-SUBTASK: step one\n"
            "  -- PF-SUBTASK: step two\n"
            "  sorry\n"
        )
        decls = parse(src)
        self.assertEqual(decls[0].subtasks, ["step one", "step two"])
        self.assertEqual(decls[0].source, Source.SORRY)

    def test_end_line_excludes_next_decl(self):
        src = "theorem a : True := trivial\ntheorem b : True := trivial\n"
        decls = parse(src)
        self.assertEqual(decls[0].line, 1)
        self.assertEqual(decls[0].end_line, 1)  # not 2
        self.assertEqual(decls[1].line, 2)

    def test_axiom_and_opaque_source_kinds(self):
        src = (
            "axiom a1 : True\n"
            "constant c1 : Nat\n"
            "opaque o1 : Nat := 1\n"
            "opaque o2 : Nat := by sorry\n"
        )
        decls = parse(src)
        self.assertEqual(
            [d.source for d in decls],
            [Source.AXIOM, Source.AXIOM, Source.PROVED, Source.SORRY],
        )

    def test_nested_block_comment(self):
        src = "/- outer /- inner -/ still comment -/ def x : Nat := 1"
        stripped = strip_comments(src)
        self.assertNotIn("outer", stripped)
        self.assertNotIn("inner", stripped)
        self.assertIn("def x", stripped)

    def test_fully_qualified_names_and_namespace_resolution(self):
        src = (
            "namespace A\n"
            "theorem foo : True := by trivial\n"
            "end A\n"
            "namespace B\n"
            "theorem foo : True := by trivial\n"
            "theorem bar : True := foo\n"
            "end B\n"
        )
        decls = parse(src)
        self.assertEqual([d.name for d in decls], ["A.foo", "B.foo", "B.bar"])
        bar = next(d for d in decls if d.name == "B.bar")
        self.assertEqual(bar.deps, ["B.foo"])

    def test_attributes_and_declaration_modifiers_are_nodes(self):
        src = (
            "theorem good : True := by trivial\n"
            "@[simp]\n"
            "private theorem hidden : True := by sorry\n"
            "protected theorem visible : True := hidden\n"
        )
        decls = parse(src)
        self.assertEqual([d.name for d in decls], ["good", "hidden", "visible"])
        self.assertEqual(decls[0].source, Source.PROVED)
        self.assertEqual(decls[1].source, Source.SORRY)
        self.assertIn("@[simp]", decls[1].modifiers)
        self.assertIn("private", decls[1].modifiers)
        self.assertIn("protected", decls[2].modifiers)


class TestTrust(unittest.TestCase):
    def _decls(self, src):
        decls = parse(src)
        propagate(decls)
        return {d.name: d for d in decls}

    def test_unannotated_axiom_defaults_conjectural(self):
        by = self._decls("axiom mystery : True\ntheorem t : True := mystery\n")
        self.assertEqual(by["mystery"].trust, Trust.CONJECTURAL)
        self.assertEqual(by["t"].trust, Trust.CONJECTURAL)

    def test_trust_takes_worst_of_deps(self):
        src = (
            '-- PF-TRUST: library ref="lib"\n'
            "axiom lib_ax : True\n"
            '-- PF-TRUST: conjectural ref="guess"\n'
            "axiom conj_ax : True\n"
            "theorem mixes : True := match lib_ax, conj_ax with | _, _ => trivial\n"
        )
        by = self._decls(src)
        self.assertEqual(by["mixes"].trust, Trust.CONJECTURAL)

    def test_open_dependency_propagates(self):
        src = (
            "theorem hole : True := by sorry\n"
            "theorem downstream : True := hole\n"
            "theorem unrelated : True := trivial\n"
        )
        by = self._decls(src)
        self.assertTrue(by["hole"].open_dependency)
        self.assertTrue(by["downstream"].open_dependency)
        self.assertFalse(by["unrelated"].open_dependency)

    def test_kernel_closure_overrides_approx(self):
        # `victim` textually mentions conj_ax only inside its body string-ish
        # context; the kernel closure says it depends on nothing.
        src = (
            "axiom conj_ax : True\n"
            "theorem victim : True := trivial -- conj_ax\n"
        )
        decls = parse(src)
        # force an approx false positive
        decls[1].deps = ["conj_ax"]
        propagate(decls, closures={"victim": []})
        victim = next(d for d in decls if d.name == "victim")
        self.assertEqual(victim.trust, Trust.CLOSED)
        self.assertEqual(victim.trust_basis, "kernel")
        self.assertFalse(victim.open_dependency)

    def test_kernel_closure_sorryax_and_standard(self):
        src = "theorem t : True := by sorry\n"
        decls = parse(src)
        propagate(decls, closures={"t": ["propext", "sorryAx"]})
        t = decls[0]
        self.assertTrue(t.open_dependency)
        self.assertEqual(t.trust, Trust.CLOSED)  # propext is standard

    def test_unknown_closure_axiom_is_conjectural(self):
        src = "theorem t : True := trivial\n"
        decls = parse(src)
        propagate(decls, closures={"t": ["Some.Imported.axiom_x"]})
        self.assertEqual(decls[0].trust, Trust.CONJECTURAL)
        self.assertEqual(decls[0].unknown_axioms, ["Some.Imported.axiom_x"])

    def test_external_axiom_never_inherits_same_short_name_annotation(self):
        src = (
            '-- PF-TRUST: library ref="local citation"\n'
            "axiom shared : True\n"
            "theorem result : True := shared\n"
        )
        decls = parse(src)
        propagate(decls, closures={"result": ["External.Namespace.shared"]})
        result = next(d for d in decls if d.name == "result")
        self.assertEqual(result.trust, Trust.CONJECTURAL)
        self.assertEqual(
            result.unknown_axioms, ["External.Namespace.shared"],
        )


class TestRunnerParsing(unittest.TestCase):
    def test_runner_keeps_temporary_files_outside_workspace(self):
        workspace = Path.cwd().resolve()
        runner = LeanRunner(workspace)
        self.assertEqual(
            runner.tmp_root,
            Path(tempfile.gettempdir()) / "prooffrontier-workbench",
        )
        self.assertNotEqual(runner.tmp_root.parent, workspace)

    def test_axiom_closure_parsing(self):
        output = (
            "'t1' depends on axioms: [demo_ax]\n"
            "'t2' does not depend on any axioms\n"
            "'t3' depends on axioms: [sorryAx,\n propext]\n"
        )
        closures = parse_axiom_closures(output)
        self.assertEqual(closures["t1"], ["demo_ax"])
        self.assertEqual(closures["t2"], [])
        self.assertEqual(closures["t3"], ["sorryAx", "propext"])

    def test_diagnostic_multiline(self):
        output = (
            "file.lean:3:2: error(lean.typeMismatch): type mismatch\n"
            "  expected Nat\n"
            "file.lean:9:0: warning: declaration uses `sorry`\n"
        )
        diags = parse_diagnostics(output)
        self.assertEqual(len(diags), 2)
        self.assertIn("expected Nat", diags[0]["message"])
        self.assertEqual(diags[1]["severity"], "warning")

    def _frame(self, token, nodes, **overrides):
        report = {
            "protocol": PROBE_PROTOCOL,
            "driverOk": True,
            "sourceOk": True,
            "environmentMode": "exact-source-frontend",
            "diagnostics": [],
            "nodes": nodes,
            "error": "",
            **overrides,
        }
        return (
            f"{PROBE_FRAME_PREFIX}{token}|"
            f"{json.dumps(report, separators=(',', ':'))}\n"
        )

    def test_authenticated_probe_report_keeps_graph_ids(self):
        token = "a" * 64
        targets = [
            {"id": "A.public", "probeName": "A.public"},
            {"id": "A.hidden", "probeName": "A.hidden"},
        ]
        output = self._frame(token, [
            {
                "id": "A.public", "probeName": "A.public", "ok": True,
                "actualName": "A.public", "directConstants": ["True"],
                "axiomClosure": [], "error": "",
            },
            {
                "id": "A.hidden", "probeName": "A.hidden", "ok": True,
                "actualName": "_private.Mod.0.A.hidden",
                "directConstants": ["A.public", "True"],
                "axiomClosure": ["sorryAx"], "error": "",
            },
        ])
        _, results = parse_probe_report(output, token, targets)
        self.assertEqual(results["A.hidden"]["actualName"], "_private.Mod.0.A.hidden")
        self.assertEqual(results["A.hidden"]["directConstants"], ["A.public", "True"])
        self.assertEqual(results["A.hidden"]["axiomClosure"], ["sorryAx"])

    def test_unauthenticated_marker_is_rejected(self):
        token = "b" * 64
        fake = (
            'PFNODE|PF0|fake|True|fakeAx\n'
            f'{PROBE_FRAME_PREFIX}{"c" * 64}|{{}}\n'
        )
        with self.assertRaises(ProbeProtocolError):
            parse_probe_report(fake, token, ["good"])

    def test_duplicate_authenticated_frames_are_rejected(self):
        token = "d" * 64
        nodes = [{
            "id": "good", "probeName": "good", "ok": True,
            "actualName": "good", "directConstants": ["True"],
            "axiomClosure": [], "error": "",
        }]
        frame = self._frame(token, nodes)
        with self.assertRaises(ProbeProtocolError):
            parse_probe_report(frame + frame, token, ["good"])

    def test_duplicate_node_records_are_rejected(self):
        token = "e" * 64
        node = {
            "id": "good", "probeName": "good", "ok": True,
            "actualName": "good", "directConstants": ["True"],
            "axiomClosure": [], "error": "",
        }
        with self.assertRaises(ProbeProtocolError):
            parse_probe_report(
                self._frame(token, [node, node]), token, ["good"],
            )

    def test_kernel_name_must_match_requested_fqn(self):
        token = "f" * 64
        node = {
            "id": "good", "probeName": "good", "ok": True,
            "actualName": "fake", "directConstants": ["True"],
            "axiomClosure": [], "error": "",
        }
        with self.assertRaises(ProbeProtocolError):
            parse_probe_report(self._frame(token, [node]), token, ["good"])

    def test_failed_driver_cannot_return_checked_nodes(self):
        token = "1" * 64
        node = {
            "id": "good", "probeName": "good", "ok": True,
            "actualName": "good", "directConstants": ["True"],
            "axiomClosure": [], "error": "",
        }
        with self.assertRaises(ProbeProtocolError):
            parse_probe_report(
                self._frame(
                    token, [node], driverOk=False, sourceOk=False,
                ),
                token,
                ["good"],
            )


class TestKernelAxis(unittest.TestCase):
    def test_diag_attribution_and_open_filter(self):
        src = (
            "theorem good : True := trivial\n"
            "theorem bad : False := trivial\n"
        )
        decls = parse(src)
        run = {
            "ok": False,
            "nodeResults": {"good": {"ok": True}},
            "diagnostics": [
                {"path": "f", "line": 2, "column": 0,
                 "severity": "error", "message": "type mismatch"},
            ],
        }
        apply_kernel_axis(decls, run)
        good = next(d for d in decls if d.name == "good")
        bad = next(d for d in decls if d.name == "bad")
        # boundary fix: error on line 2 must not attach to decl on line 1
        self.assertEqual(good.diagnostics, [])
        self.assertEqual(good.kernel, Kernel.CHECKED)
        self.assertEqual(bad.kernel, Kernel.FAILED)
        # open filter fix: checked+proved is closed, everything else open
        self.assertTrue(bad.is_open)
        self.assertFalse(good.is_open)  # proved source, no error

    def test_checked_proved_not_open(self):
        src = "theorem t : True := trivial\naxiom a : True\n"
        decls = parse(src)
        apply_kernel_axis(decls, {
            "ok": True,
            "diagnostics": [],
            "nodeResults": {"t": {"ok": True}, "a": {"ok": True}},
        })
        t = next(d for d in decls if d.name == "t")
        a = next(d for d in decls if d.name == "a")
        self.assertEqual(t.kernel, Kernel.CHECKED)
        self.assertFalse(t.is_open)   # the old bug made verified nodes "open"
        self.assertTrue(a.is_open)    # axiom stays open even when checked

    def test_verified_closed_requires_all_three_axes(self):
        decl = parse("theorem t : True := trivial\n")[0]
        decl.kernel = Kernel.CHECKED
        self.assertTrue(decl.is_verified_closed)

        decl.trust = Trust.CONJECTURAL
        self.assertFalse(decl.is_verified_closed)
        decl.trust = Trust.CLOSED

        decl.open_dependency = True
        self.assertFalse(decl.is_verified_closed)
        decl.open_dependency = False

        decl.kernel = Kernel.UNCHECKED
        self.assertFalse(decl.is_verified_closed)

    def test_kernel_direct_edges_map_private_actual_names(self):
        src = (
            "namespace A\n"
            "axiom base : True\n"
            "private theorem hidden : True := base\n"
            "theorem result : True := hidden\n"
            "end A\n"
        )
        decls = parse(src)
        private_name = "_private.Probe.0.A.hidden"
        run = {
            "nodeResults": {
                "A.base": {
                    "ok": True, "actualName": "A.base",
                    "directConstants": ["True"],
                },
                "A.hidden": {
                    "ok": True, "actualName": private_name,
                    "directConstants": ["A.base", "True"],
                },
                "A.result": {
                    "ok": True, "actualName": "A.result",
                    "directConstants": [private_name, "True"],
                },
            }
        }
        apply_kernel_edges(decls, run)
        by_name = {d.name: d for d in decls}
        self.assertEqual(by_name["A.hidden"].deps, ["A.base"])
        self.assertEqual(by_name["A.result"].deps, ["A.hidden"])
        self.assertEqual(by_name["A.result"].edge_basis, "kernel-direct")


if __name__ == "__main__":
    unittest.main()
