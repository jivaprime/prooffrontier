"""Lean execution layer.

Verification contract:
* parsing and graph construction happen before this module is called;
* the submitted source is elaborated byte-for-byte by an external Lean
  frontend driver, with no imports, declarations, or commands injected;
* the driver inspects that exact run's final Environment for every graph node;
* one authenticated result frame is required before any node can be checked.
"""
from __future__ import annotations

import hashlib
import json
import re
import secrets
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

DIAG_RE = re.compile(
    r"^(.+?):(\d+):(\d+):\s+"
    r"(error|warning|info(?:rmation)?)(?:\([^)]*\))?:\s*(.*)$",
    re.IGNORECASE,
)
AX_DEP_RE = re.compile(r"'([^']+)'\s+depends on axioms:\s*\[(.*?)\]", re.DOTALL)
AX_NONE_RE = re.compile(r"'([^']+)'\s+does not depend on any axioms")

PROBE_PROTOCOL = "prooffrontier-probe-v1"
PROBE_FRAME_PREFIX = "PROOFFRONTIER_RESULT_V1|"
PROBE_DRIVER = Path(__file__).with_name("ProbeDriver.lean")
PROBE_KINDS = {
    "theorem", "lemma", "def", "abbrev", "axiom", "constant", "opaque",
}


class ProbeProtocolError(ValueError):
    """The driver result was absent, unauthenticated, or structurally invalid."""


def source_hash(source: str) -> str:
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def find_tool(name: str) -> str | None:
    found = shutil.which(name)
    if found:
        return found
    elan = Path.home() / ".elan" / "bin" / f"{name}.exe"
    if elan.exists():
        return str(elan)
    elan = Path.home() / ".elan" / "bin" / name
    return str(elan) if elan.exists() else None


def find_project_root(start: Path) -> Path | None:
    cur = start if start.is_dir() else start.parent
    for candidate in [cur, *cur.parents]:
        if (candidate / "lakefile.toml").exists() or (candidate / "lakefile.lean").exists():
            return candidate
    return None


def choose_probe_command(
    source_file: Path,
    request_file: Path,
    project_root: Path | None,
) -> tuple[list[str] | None, list[str]]:
    notes: list[str] = []
    lake = find_tool("lake")
    lean = find_tool("lean")
    args = [
        "--run",
        str(PROBE_DRIVER),
        str(source_file),
        str(request_file),
    ]
    if lake and project_root is not None:
        return [lake, "env", "lean", *args], notes
    if lean:
        if project_root is None:
            notes.append("No Lake project found; imports such as Mathlib may fail.")
        return [lean, *args], notes
    notes.append("No lean or lake executable was found.")
    return None, notes


def parse_diagnostics(output: str) -> list[dict[str, Any]]:
    """Parse ordinary Lean output.

    This remains a fallback for driver compilation/startup failures. Authenticated
    probe runs carry structured diagnostics in their result frame.
    """
    diagnostics: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    for line in output.splitlines():
        match = DIAG_RE.match(line)
        if match:
            severity = match.group(4).lower()
            current = {
                "path": match.group(1),
                "line": int(match.group(2)),
                "column": int(match.group(3)),
                "severity": "info" if severity.startswith("info") else severity,
                "message": match.group(5).strip(),
            }
            diagnostics.append(current)
        elif current and line.strip():
            current["message"] = f"{current['message']}\n{line.rstrip()}"
    return diagnostics


def parse_axiom_closures(output: str) -> dict[str, list[str]]:
    """Parse Lean's legacy ``#print axioms`` text format."""
    closures: dict[str, list[str]] = {}
    for name, body in AX_DEP_RE.findall(output):
        axioms = [item.strip() for item in body.replace("\n", " ").split(",")
                  if item.strip()]
        closures[name] = axioms
    for name in AX_NONE_RE.findall(output):
        closures.setdefault(name, [])
    return closures


def normalize_node_targets(
    node_targets: list[dict[str, str]] | list[str] | None,
) -> list[dict[str, str]]:
    targets: list[dict[str, str]] = []
    for item in node_targets or []:
        if isinstance(item, str):
            targets.append({"id": item, "probeName": item})
        else:
            targets.append({
                "id": item["id"],
                "probeName": item.get("probeName", item["id"]),
            })
    return targets


def _string_list(value: Any, field: str) -> list[str]:
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise ProbeProtocolError(f"{field} must be a string array")
    return value


def _actual_name_matches(probe_name: str, actual_name: str) -> bool:
    return (
        actual_name == probe_name
        or (
            actual_name.startswith("_private.")
            and actual_name.endswith(f".{probe_name}")
        )
    )


def parse_probe_report(
    output: str,
    token: str,
    node_targets: list[dict[str, str]] | list[str],
) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    """Parse and validate exactly one token-authenticated driver result.

    The token is delivered to the driver over stdin and consumed before the
    submitted Lean source runs. Source code can print protocol-looking text or
    terminate the process, but it cannot produce an accepted frame without the
    token. Duplicate authenticated frames are rejected.
    """
    marker = f"{PROBE_FRAME_PREFIX}{token}|"
    frames = [
        line[len(marker):]
        for line in output.splitlines()
        if line.startswith(marker)
    ]
    if len(frames) != 1:
        raise ProbeProtocolError(
            f"expected exactly one authenticated result frame, got {len(frames)}"
        )
    try:
        report = json.loads(frames[0])
    except json.JSONDecodeError as exc:
        raise ProbeProtocolError(f"invalid result JSON: {exc}") from exc
    if not isinstance(report, dict):
        raise ProbeProtocolError("result must be a JSON object")
    if report.get("protocol") != PROBE_PROTOCOL:
        raise ProbeProtocolError("probe protocol mismatch")
    if report.get("environmentMode") != "exact-source-frontend":
        raise ProbeProtocolError("probe did not attest exact-source frontend mode")
    if not isinstance(report.get("driverOk"), bool):
        raise ProbeProtocolError("driverOk must be boolean")
    if not isinstance(report.get("sourceOk"), bool):
        raise ProbeProtocolError("sourceOk must be boolean")
    if report["sourceOk"] and not report["driverOk"]:
        raise ProbeProtocolError("sourceOk cannot be true when driverOk is false")
    if not isinstance(report.get("diagnostics"), list):
        raise ProbeProtocolError("diagnostics must be an array")
    if not isinstance(report.get("nodes"), list):
        raise ProbeProtocolError("nodes must be an array")

    targets = normalize_node_targets(node_targets)
    expected = {target["id"]: target for target in targets}
    if len(expected) != len(targets):
        raise ProbeProtocolError("duplicate requested graph IDs")

    nodes = report["nodes"]
    if not report["driverOk"] and nodes:
        raise ProbeProtocolError("failed driver returned node records")
    if report["driverOk"] and len(nodes) != len(targets):
        raise ProbeProtocolError("driver returned an incomplete node set")

    seen: set[str] = set()
    results: dict[str, dict[str, Any]] = {}
    for raw in nodes:
        if not isinstance(raw, dict):
            raise ProbeProtocolError("node result must be an object")
        node_id = raw.get("id")
        if not isinstance(node_id, str) or node_id not in expected:
            raise ProbeProtocolError("node result has an unknown graph ID")
        if node_id in seen:
            raise ProbeProtocolError(f"duplicate node result: {node_id}")
        seen.add(node_id)
        target = expected[node_id]
        if raw.get("probeName") != target["probeName"]:
            raise ProbeProtocolError(f"probe-name mismatch for {node_id}")
        if not isinstance(raw.get("ok"), bool):
            raise ProbeProtocolError(f"ok must be boolean for {node_id}")
        actual_name = raw.get("actualName")
        if not isinstance(actual_name, str):
            raise ProbeProtocolError(f"actualName must be a string for {node_id}")
        direct = _string_list(raw.get("directConstants"), "directConstants")
        closure = _string_list(raw.get("axiomClosure"), "axiomClosure")
        if raw["ok"]:
            if not _actual_name_matches(target["probeName"], actual_name):
                raise ProbeProtocolError(f"kernel-name mismatch for {node_id}")
            results[node_id] = {
                "ok": True,
                "actualName": actual_name,
                "directConstants": direct,
                "axiomClosure": closure,
            }

    if report["driverOk"] and seen != set(expected):
        raise ProbeProtocolError("driver node IDs do not match the request")
    return report, results


def strip_authenticated_frame(output: str, token: str) -> str:
    marker = f"{PROBE_FRAME_PREFIX}{token}|"
    return "\n".join(
        line for line in output.splitlines()
        if not line.startswith(marker)
    ).strip()


def normalize_structured_diagnostics(value: Any) -> list[dict[str, Any]]:
    diagnostics: list[dict[str, Any]] = []
    seen: set[tuple[str, int, int, str, str]] = set()
    if not isinstance(value, list):
        return diagnostics
    for item in value:
        if not isinstance(item, dict):
            continue
        severity = item.get("severity")
        line = item.get("line")
        column = item.get("column")
        message = item.get("message")
        path = item.get("path")
        if severity not in {"error", "warning", "info"}:
            continue
        if not isinstance(line, int) or not isinstance(column, int):
            continue
        if not isinstance(message, str) or not isinstance(path, str):
            continue
        key = (path, line, column, severity, message)
        if key in seen:
            continue
        seen.add(key)
        diagnostics.append({
            "path": path,
            "line": line,
            "column": column,
            "severity": severity,
            "message": message,
        })
    return diagnostics


class LeanRunner:
    def __init__(self, workspace: Path, timeout: int = 120):
        self.workspace = workspace
        self.tmp_root = Path(tempfile.gettempdir()) / "prooffrontier-workbench"
        self.timeout = timeout
        self.project_root = find_project_root(workspace)

    def _temp_paths(self, filename: str) -> tuple[Path, Path]:
        self.tmp_root.mkdir(parents=True, exist_ok=True)
        safe = re.sub(r"[^A-Za-z0-9_.-]", "_", filename or "Input.lean")
        if not safe.endswith(".lean"):
            safe = "Input.lean"
        run_id = f"{time.time_ns()}_{secrets.token_hex(8)}"
        return (
            self.tmp_root / f"{run_id}_{safe}",
            self.tmp_root / f"{run_id}_request.json",
        )

    def verify(
        self,
        source: str,
        filename: str,
        node_targets: list[dict[str, str]] | list[str] | None = None,
        probe_axioms: bool = True,
    ) -> dict[str, Any]:
        targets = normalize_node_targets(node_targets)
        source_file, request_file = self._temp_paths(filename)
        token = secrets.token_hex(32)
        source_file.write_bytes(source.encode("utf-8"))
        request_payload = json.dumps({
            "protocol": PROBE_PROTOCOL,
            "targets": targets,
            "collectAxioms": probe_axioms,
        }, ensure_ascii=True)
        request_file.write_bytes(request_payload.encode("utf-8"))

        command, notes = choose_probe_command(
            source_file, request_file, self.project_root,
        )
        common: dict[str, Any] = {
            "sourceHash": source_hash(source),
            "axiomClosures": {},
            "nodeResults": {},
            "probeRan": False,
            "probeOk": False,
            "verificationUnit": "node",
            "nodeSummary": {"expected": len(targets), "checked": 0},
        }
        if command is None:
            source_file.unlink(missing_ok=True)
            request_file.unlink(missing_ok=True)
            return {
                **common,
                "ok": False,
                "status": "tool-missing",
                "returnCode": None,
                "command": "",
                "diagnostics": [],
                "notes": notes,
                "output": "",
                "_fullOutput": "",
            }

        cwd = self.project_root or self.workspace
        try:
            proc = subprocess.run(
                command,
                cwd=cwd,
                input=f"{token}\n",
                text=True,
                encoding="utf-8",
                errors="replace",
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=self.timeout,
            )
            output = proc.stdout or ""
        except subprocess.TimeoutExpired as exc:
            output = exc.stdout or ""
            if isinstance(output, bytes):
                output = output.decode("utf-8", errors="replace")
            clean_output = strip_authenticated_frame(output, token)
            return {
                **common,
                "ok": False,
                "status": "timeout",
                "returnCode": None,
                "command": " ".join(command),
                "diagnostics": [{
                    "path": str(source_file),
                    "line": None,
                    "column": None,
                    "severity": "error",
                    "message": (
                        f"Lean verification timed out after {self.timeout} seconds."
                    ),
                }],
                "notes": notes,
                "output": clean_output[-20000:],
                "_fullOutput": clean_output,
            }
        finally:
            source_file.unlink(missing_ok=True)
            request_file.unlink(missing_ok=True)

        clean_output = strip_authenticated_frame(output, token)
        try:
            report, node_results = parse_probe_report(output, token, targets)
        except ProbeProtocolError as exc:
            diagnostics = parse_diagnostics(clean_output)
            diagnostics.append({
                "path": str(PROBE_DRIVER),
                "line": None,
                "column": None,
                "severity": "error",
                "message": f"Authenticated probe result rejected: {exc}",
            })
            notes.append(
                "No node was accepted because the authenticated result contract failed."
            )
            return {
                **common,
                "ok": False,
                "status": "probe-protocol-failed",
                "returnCode": proc.returncode,
                "command": " ".join(command),
                "diagnostics": diagnostics,
                "notes": notes,
                "output": clean_output[-20000:],
                "_fullOutput": clean_output,
            }

        diagnostics = normalize_structured_diagnostics(report["diagnostics"])
        driver_ok = report["driverOk"] and proc.returncode == 0
        if not driver_ok:
            node_results = {}
        checked = len(node_results)
        probe_ok = driver_ok and checked == len(targets)
        source_ok = driver_ok and report["sourceOk"]
        if not driver_ok:
            status = "probe-driver-failed"
            error = report.get("error")
            if isinstance(error, str) and error:
                notes.append(f"Probe driver failed: {error}")
        else:
            status = "ok" if source_ok else "lean-failed"
        if not probe_ok:
            notes.append(
                "The exact-source probe was partial; unchecked nodes keep source-approx edges."
            )
        notes.append(
            "Node results came from the final Environment of the unmodified submitted source."
        )

        closures = {
            node_id: item["axiomClosure"]
            for node_id, item in node_results.items()
        } if probe_axioms else {}
        return {
            **common,
            "ok": source_ok,
            "status": status,
            "returnCode": proc.returncode,
            "command": " ".join(command),
            "diagnostics": diagnostics,
            "notes": notes,
            "output": clean_output[-20000:],
            "_fullOutput": clean_output,
            "nodeResults": node_results,
            "axiomClosures": closures,
            "probeRan": True,
            "probeOk": probe_ok,
            "nodeSummary": {
                "expected": len(targets),
                "checked": checked,
            },
        }
