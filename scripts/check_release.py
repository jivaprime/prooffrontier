#!/usr/bin/env python3
"""Reject local artifacts and obvious secrets before publishing."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIRED_FILES = {
    "README.md",
    "README.ko.md",
    "LICENSE",
    "VERSION",
    "SECURITY.md",
    "CONTRIBUTING.md",
    "CODE_OF_CONDUCT.md",
    "CHANGELOG.md",
    "lean-toolchain",
    ".github/workflows/ci.yml",
    "docs/METHODOLOGY.ko.md",
    "docs/VALIDATION.md",
    "docs/RELATED_WORK.md",
    "docs/ROADMAP.md",
    "docs/assets/prooffrontier-ui.png",
    "examples/Sample.lean",
    "prooffrontier/__init__.py",
    "prooffrontier/ProbeDriver.lean",
    "prooffrontier_cli.py",
    "tests/test_stale_race.js",
    "ui/index.html",
    "ui/server.py",
}
FORBIDDEN_PARTS = {
    "__pycache__", ".prooffrontier_tmp", ".leangraph_tmp", "graph_out",
    ".lake", ".venv", "leangraph",
}
TEXT_SUFFIXES = {
    ".py", ".js", ".html", ".css", ".md", ".lean", ".yml", ".yaml",
    ".json", ".txt", "",
}
SECRET_PATTERNS = [
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"(?i)\b(api[_-]?key|password|client[_-]?secret)\s*[:=]\s*\S+"),
    re.compile(r"(?i)[A-Z]:\\Users\\"),
]
LEGACY_IDENTIFIERS = {
    "LeanGraph Workbench",
    "from leangraph",
    "import leangraph",
    "leangraph_cli.py",
    "LEANGRAPH_RESULT_V1",
    "LG-TRUST",
    "LG-SUBTASK",
}


def main() -> None:
    problems: list[str] = []
    for relative in sorted(REQUIRED_FILES):
        if not (ROOT / relative).is_file():
            problems.append(f"missing release file: {relative}")

    version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    if not version:
        problems.append("VERSION is empty")
    else:
        for readme in ("README.md", "README.ko.md"):
            readme_path = ROOT / readme
            if readme_path.is_file():
                text = readme_path.read_text(encoding="utf-8")
                if f"`{version}`" not in text:
                    problems.append(
                        f"{readme} does not mention VERSION {version}"
                    )

    for path in ROOT.rglob("*"):
        relative = path.relative_to(ROOT)
        if any(
            part in FORBIDDEN_PARTS or part.startswith("graph_out")
            for part in relative.parts
        ):
            problems.append(f"forbidden artifact: {relative}")
            continue
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for pattern in SECRET_PATTERNS:
            if pattern.search(text):
                problems.append(f"sensitive pattern in: {relative}")
        if relative.as_posix() != "scripts/check_release.py":
            for identifier in LEGACY_IDENTIFIERS:
                if identifier in text:
                    problems.append(
                        f"legacy public identifier {identifier!r} in: {relative}"
                    )

    if problems:
        raise SystemExit("\n".join(problems))
    print("Release hygiene check: clean.")


if __name__ == "__main__":
    main()
