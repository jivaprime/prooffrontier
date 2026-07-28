"""Single source of parsing truth.

Both the CLI and the UI server call into this module, so the CLI/UI
classification mismatch of the previous prototype cannot recur.

Known, documented approximations:
* dependency edges are name occurrences in the comment-stripped body, not
  elaborated references — tactic/instance dependencies are invisible
  until authenticated Environment inspection replaces them with kernel-direct
  edges;
* string literals are not stripped, only comments.
"""
from __future__ import annotations

import re

from .model import Decl, Source, Trust

DECL_MODIFIERS = (
    "private", "protected", "noncomputable", "unsafe", "partial", "nonrec",
)
DECL_RE = re.compile(
    r"^[ \t]*(?P<attrs>(?:@\[[^\]]*\]\s*)*)"
    r"(?P<modifiers>(?:(?:private|protected|noncomputable|unsafe|partial|nonrec)\s+)*)"
    r"(?P<kind>def|abbrev|lemma|theorem|axiom|constant|opaque)"
    r"\s+(?P<name>(?:_root_\.)?[A-Za-z_][A-Za-z0-9_.']*)",
    re.MULTILINE,
)
CONTEXT_RE = re.compile(
    r"^[ \t]*(namespace|section|end)\b"
    r"(?:[ \t]+((?:_root_\.)?[A-Za-z_][A-Za-z0-9_.']*))?",
    re.MULTILINE,
)
COMMAND_BOUNDARY_RE = re.compile(
    r"^(?P<indent>[ \t]*)"
    r"(?:#[A-Za-z_][A-Za-z0-9_]*|namespace|section|end|open|export|set_option)\b",
    re.MULTILINE,
)
IDENT_RE = re.compile(
    r"(?<![A-Za-z0-9_.'])(?:_root_\.)?[A-Za-z_][A-Za-z0-9_.']*"
    r"(?![A-Za-z0-9_.'])"
)
# Word-boundary sorry: does not match sorryAx, my_sorry, sorry_free ...
SORRY_RE = re.compile(r"(?<![A-Za-z0-9_'])sorry(?![A-Za-z0-9_'])")
TRUST_RE = re.compile(
    r"--\s*PF-TRUST:\s*(library|cited-external|conjectural)"
    r"(?:\s+ref=\"([^\"]*)\")?"
)
SUBTASK_RE = re.compile(r"--\s*PF-SUBTASK:\s*(.+)")

AXIOM_LIKE = {"axiom", "constant"}
TRUST_BY_TAG = {
    "library": Trust.LIBRARY,
    "cited-external": Trust.CITED,
    "conjectural": Trust.CONJECTURAL,
}


def strip_comments(src: str) -> str:
    """Blank out line and (nested) block comments with spaces.

    Length- and newline-preserving, so every offset and line number in the
    stripped text is identical to the original — declaration spans found on
    the stripped text can be sliced from either."""
    out = list(src)
    i, n = 0, len(src)
    depth = 0
    in_line = False
    while i < n:
        ch = src[i]
        if in_line:
            if ch == "\n":
                in_line = False
            else:
                out[i] = " "
            i += 1
            continue
        if depth == 0 and src.startswith("--", i):
            in_line = True
            out[i] = " "
            if i + 1 < n:
                out[i + 1] = " "
            i += 2
            continue
        if src.startswith("/-", i):
            depth += 1
            out[i] = " "
            if i + 1 < n:
                out[i + 1] = " "
            i += 2
            continue
        if depth > 0:
            if src.startswith("-/", i):
                depth -= 1
                out[i] = " "
                if i + 1 < n:
                    out[i + 1] = " "
                i += 2
                continue
            if ch != "\n":
                out[i] = " "
            i += 1
            continue
        i += 1
    return "".join(out)


def line_of(src: str, pos: int) -> int:
    return src.count("\n", 0, pos) + 1


def declaration_end(
    stripped_src: str,
    match: re.Match,
    limit: int,
) -> int:
    """Stop a declaration before a following top-level non-declaration command.

    The source parser remains approximate, but diagnostics from commands such
    as `#check` or `end` must not be attributed to the preceding declaration.
    A candidate is a boundary only when it is no more indented than the
    declaration, which avoids cutting on command-like syntax nested in a body.
    """
    line_end = stripped_src.find("\n", match.start())
    if line_end < 0:
        line_end = len(stripped_src)
    declaration_line = stripped_src[match.start():line_end]
    declaration_indent = len(declaration_line) - len(
        declaration_line.lstrip(" \t")
    )
    for command in COMMAND_BOUNDARY_RE.finditer(
        stripped_src,
        match.end(),
        limit,
    ):
        if len(command.group("indent")) <= declaration_indent:
            return command.start()
    return limit


def leading_comment_block(src: str, start: int) -> str:
    """The contiguous `--` comment lines immediately above a declaration.
    Annotations written there bind to the declaration below, not to the
    previous declaration whose body span happens to contain them."""
    line_start = src.rfind("\n", 0, start) + 1
    collected: list[str] = []
    pos = line_start
    while pos > 0:
        prev_start = src.rfind("\n", 0, pos - 1) + 1
        line = src[prev_start:pos - 1] if pos > prev_start else ""
        if line.strip().startswith("--"):
            collected.append(line)
            pos = prev_start
        else:
            break
    return "\n".join(reversed(collected))


def get_signature(body: str) -> str:
    collected: list[str] = []
    for raw in body.strip().split("\n"):
        line = raw.rstrip()
        s = line.strip()
        if s.startswith("/--") or s.startswith("-/") or s.startswith("--") or s.startswith("*"):
            continue
        collected.append(line)
        if " := by" in line or line.endswith(" :=") or line.endswith(":= by"):
            break
        if len(collected) >= 7:
            break
    return "\n".join(collected)


def qualify_name(namespace: str, source_name: str) -> str:
    if source_name.startswith("_root_."):
        return source_name[len("_root_."):]
    return ".".join(part for part in (namespace, source_name) if part)


def namespace_by_declaration(stripped_src: str, matches: list[re.Match]) -> list[str]:
    events = list(CONTEXT_RE.finditer(stripped_src))
    event_index = 0
    contexts: list[tuple[str, int]] = []
    namespace_parts: list[str] = []
    result: list[str] = []

    for decl_match in matches:
        while event_index < len(events) and events[event_index].start() < decl_match.start():
            event = events[event_index]
            kind = event.group(1)
            raw_name = event.group(2) or ""
            if kind == "namespace":
                if raw_name.startswith("_root_."):
                    namespace_parts.clear()
                    raw_name = raw_name[len("_root_."):]
                parts = [part for part in raw_name.split(".") if part]
                namespace_parts.extend(parts)
                contexts.append(("namespace", len(parts)))
            elif kind == "section":
                contexts.append(("section", 0))
            elif contexts:
                context_kind, count = contexts.pop()
                if context_kind == "namespace" and count:
                    del namespace_parts[-count:]
            event_index += 1
        result.append(".".join(namespace_parts))
    return result


def resolve_reference(token: str, namespace: str,
                      by_name: dict[str, Decl]) -> Decl | None:
    if token.startswith("_root_."):
        return by_name.get(token[len("_root_."):])

    namespace_parts = [part for part in namespace.split(".") if part]
    for size in range(len(namespace_parts), -1, -1):
        prefix = ".".join(namespace_parts[:size])
        candidate = ".".join(part for part in (prefix, token) if part)
        target = by_name.get(candidate)
        if target is not None:
            return target
    return None


def rebuild_dependents(decls: list[Decl]) -> None:
    by_name = {d.name: d for d in decls}
    for d in decls:
        d.dependents = []
    for d in decls:
        for dep in d.deps:
            target = by_name.get(dep)
            if target is not None and d.name not in target.dependents:
                target.dependents.append(d.name)


def parse(src: str) -> list[Decl]:
    stripped_src = strip_comments(src)
    # declarations are recognized on the comment-stripped text, so a
    # `theorem` word inside a comment is no longer a false positive
    matches = list(DECL_RE.finditer(stripped_src))
    namespaces = namespace_by_declaration(stripped_src, matches)
    decls: list[Decl] = []

    for i, m in enumerate(matches):
        kind = m.group("kind")
        source_name = m.group("name")
        namespace = namespaces[i]
        name = qualify_name(namespace, source_name)
        attrs = re.findall(r"@\[[^\]]*\]", m.group("attrs") or "")
        modifier_words = re.findall(
            r"\b(?:" + "|".join(DECL_MODIFIERS) + r")\b",
            m.group("modifiers") or "",
        )
        modifiers = [item.strip() for item in attrs] + modifier_words
        start = m.start()
        next_declaration = (
            matches[i + 1].start()
            if i + 1 < len(matches)
            else len(src)
        )
        end = declaration_end(stripped_src, m, next_declaration)
        body = src[start:end]
        stripped_body = stripped_src[start:end]

        line = line_of(src, start)
        # end_line is the last line BEFORE the next declaration or independent
        # command starts, so its diagnostics are never attributed backward.
        if end < len(src):
            end_line = max(line, line_of(src, end) - 1)
        else:
            end_line = line_of(src, max(start, len(src) - 1))

        if kind in AXIOM_LIKE:
            source = Source.AXIOM
        elif SORRY_RE.search(stripped_body):
            # scanned on the comment-stripped body: a `-- sorry` note does
            # not make a declaration open
            source = Source.SORRY
        else:
            source = Source.PROVED

        # PF-TRUST binds to THIS declaration only when written in the
        # contiguous comment block above it or on the declaration's own
        # first line — never in trailing comments that happen to fall
        # inside this declaration's body span.
        first_line = body.split("\n", 1)[0]
        annotation_text = leading_comment_block(src, start) + "\n" + first_line
        trust_annotation = None
        evidence = ""
        tm = TRUST_RE.search(annotation_text)
        if tm:
            trust_annotation = TRUST_BY_TAG[tm.group(1)]
            evidence = tm.group(2) or ""

        subtasks = [s.strip() for s in SUBTASK_RE.findall(body)]

        decls.append(Decl(
            kind=kind, name=name, start=start, end=end,
            line=line, end_line=end_line,
            body=body, stripped_body=stripped_body,
            signature=get_signature(body),
            source_name=source_name,
            namespace=namespace,
            modifiers=modifiers,
            source=source,
            trust_annotation=trust_annotation,
            evidence=evidence,
            subtasks=subtasks,
        ))

    # Initial graph edges are resolved from source names before Lean runs.
    # Authenticated Environment inspection later replaces these with exact edges.
    by_name = {d.name: d for d in decls}
    for d in decls:
        deps: list[str] = []
        for match in IDENT_RE.finditer(d.stripped_body):
            target = resolve_reference(match.group(0), d.namespace, by_name)
            if target is None or target.name == d.name or target.name in deps:
                continue
            deps.append(target.name)
        d.deps = deps
        d.approx_deps = list(deps)
        d.edge_basis = "source-approx"

    rebuild_dependents(decls)
    return decls
