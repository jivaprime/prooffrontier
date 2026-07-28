/* ProofFrontier UI.
 *
 * Parsing/classification lives in the Python server (single source of
 * truth). This file only renders what /api/parse and /api/verify return.
 *
 * Visual encoding:
 *   fill   = source axis (proved / sorry / axiom)
 *   border = kernel axis (checked / failed / unchecked)
 *   badge  = trust axis  (+ open-dependency marker)
 */

const sampleLean = document.getElementById("sampleLean").textContent.trim();

const els = {
  workspace: document.getElementById("workspace"),
  leanInput: document.getElementById("leanInput"),
  fileInput: document.getElementById("fileInput"),
  parseButton: document.getElementById("parseButton"),
  verifyButton: document.getElementById("verifyButton"),
  sampleButton: document.getElementById("sampleButton"),
  graphSvg: document.getElementById("graphSvg"),
  metrics: document.getElementById("metrics"),
  detail: document.getElementById("detail"),
  parseState: document.getElementById("parseState"),
  verifyState: document.getElementById("verifyState"),
  hashState: document.getElementById("hashState"),
  staleState: document.getElementById("staleState"),
  sourceLabel: document.getElementById("sourceLabel"),
  searchInput: document.getElementById("searchInput"),
  expandGraphButton: document.getElementById("expandGraphButton"),
  modeButtons: [...document.querySelectorAll("[data-mode]")]
};

const state = {
  decls: [],
  graph: { edgeBasis: "source-approx" },
  run: null,
  selected: null,
  mode: "route",
  query: "",
  graphExpanded: false,
  stale: false,
  parseTimer: null,
  requestId: 0
};

const SOURCE_FILL = { proved: "#b7f7c1", sorry: "#d7b3ff", axiom: "#ffcc80" };
const KERNEL_BORDER = {
  checked: { color: "#1e7d3e", width: 2.5, dash: "" },
  failed: { color: "#c0392b", width: 3, dash: "" },
  unchecked: { color: "#9aa5a0", width: 1.4, dash: "5,4" }
};
const TRUST_COLOR = {
  closed: "#1e7d3e",
  library: "#2563a8",
  "cited-external": "#8a6d1a",
  conjectural: "#b3362b"
};
const TRUST_SHORT = {
  closed: "closed",
  library: "library",
  "cited-external": "cited",
  conjectural: "conj"
};

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function callApi(path, source = els.leanInput.value) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: els.sourceLabel.textContent || "Input.lean",
      source
    })
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function applyAnalysis(analysis, verified, { keepStale = false } = {}) {
  state.decls = analysis.decls || [];
  state.graph = analysis.graph || { edgeBasis: "source-approx" };
  state.run = analysis.run || null;
  state.stale = keepStale;
  els.staleState.hidden = !state.stale;
  els.parseState.textContent = `${state.decls.length} declarations · ${state.graph.edgeBasis}`;

  if (!state.decls.some((d) => d.name === state.selected)) {
    const fallback = state.decls.find((d) => (d.sourceName || d.name).startsWith("FINAL"))
      || [...state.decls].reverse().find((d) => d.kind === "theorem")
      || state.decls[state.decls.length - 1];
    state.selected = fallback ? fallback.name : null;
  }

  const run = state.run;
  if (state.stale) {
    els.verifyState.textContent = "Lean 미검증 (소스 변경됨)";
    els.hashState.textContent = "";
  } else if (!verified || !run || run.status === "not-run") {
    els.verifyState.textContent = "Lean 미검증 (node: unchecked)";
    els.hashState.textContent = "";
  } else if (run.ok) {
    const summary = run.nodeSummary || {};
    const nodes = ` · nodes ${summary.checked || 0}/${summary.expected || state.decls.length}`;
    const probe = run.probeRan && run.probeOk
      ? ` · ${state.graph.edgeBasis} · axiom 폐포 확보`
      : ` · ${state.graph.edgeBasis} · 일부 노드 근사`;
    const warnings = run.summary.warnings ? ` · ${run.summary.warnings} warnings` : "";
    els.verifyState.textContent = `Lean OK${warnings}${nodes}${probe}`;
    els.hashState.textContent = `sha256:${(run.sourceHash || "").slice(0, 12)}…`;
  } else {
    const summary = run.nodeSummary || {};
    els.verifyState.textContent = `Lean 실패 (${run.status}) · nodes ${summary.checked || 0}/${summary.expected || state.decls.length} · ${run.summary.errors} errors`;
    els.hashState.textContent = run.sourceHash ? `sha256:${run.sourceHash.slice(0, 12)}…` : "";
  }
  render();
}

async function runParse({ keepStale = state.stale } = {}) {
  const submittedSource = els.leanInput.value;
  const requestId = ++state.requestId;
  els.parseState.textContent = "파싱 중…";
  try {
    const analysis = await callApi("api/parse", submittedSource);
    if (requestId !== state.requestId || submittedSource !== els.leanInput.value) return;
    applyAnalysis(analysis, false, { keepStale });
  } catch (error) {
    els.parseState.textContent = `서버 필요: ${error}`;
  }
}

async function runVerify() {
  if (state.parseTimer) {
    clearTimeout(state.parseTimer);
    state.parseTimer = null;
  }
  const submittedSource = els.leanInput.value;
  const requestId = ++state.requestId;
  els.verifyButton.disabled = true;
  els.verifyState.textContent = "Lean 검증 중… (source gate + node/edge probe)";
  try {
    const analysis = await callApi("api/verify", submittedSource);
    if (requestId !== state.requestId) return;
    if (submittedSource !== els.leanInput.value) {
      state.stale = true;
      els.staleState.hidden = false;
      await runParse({ keepStale: true });
      return;
    }
    applyAnalysis(analysis, true);
  } catch (error) {
    els.verifyState.textContent = `검증 서버 오류: ${error}`;
  } finally {
    els.verifyButton.disabled = false;
  }
}

/* ---------- graph ---------- */

function filteredDecls() {
  const byName = new Map(state.decls.map((d) => [d.name, d]));
  let names;
  if (state.mode === "full") {
    names = new Set(state.decls.map((d) => d.name));
  } else if (state.mode === "open") {
    names = openTaskClosure(byName);
  } else {
    names = routeClosure(byName);
  }
  return state.decls.filter((d) => names.has(d.name));
}

function routeClosure(byName) {
  const target = [...byName.values()].find((d) => (d.sourceName || d.name).startsWith("FINAL"))
    || [...byName.values()].reverse().find((d) => d.kind === "theorem")
    || [...byName.values()].at(-1);
  const names = new Set();
  const visit = (name) => {
    if (!name || names.has(name)) return;
    const decl = byName.get(name);
    if (!decl) return;
    names.add(name);
    decl.deps.forEach(visit);
  };
  if (target) visit(target.name);
  return names;
}

function openTaskClosure(byName) {
  // A checked+proved node is closed. checked+sorry/axiom remains open because
  // kernel acceptance and source-level closure are independent axes.
  const names = new Set();
  for (const decl of byName.values()) {
    if (!decl.isOpen) continue;
    names.add(decl.name);
    decl.deps.forEach((n) => names.add(n));
    decl.dependents.forEach((n) => names.add(n));
  }
  return names;
}

function isVerifiedClosed(decl) {
  return decl.isVerifiedClosed ?? (
    decl.kernel === "checked" &&
    decl.source === "proved" &&
    decl.trust === "closed" &&
    !decl.openDependency
  );
}

function statusWeight(decl) {
  if (decl.kernel === "failed") return -1;
  if (decl.source === "sorry") return 0;
  if (decl.source === "axiom") return 1;
  return 2;
}

function fitName(name, max) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

function renderGraph() {
  const svg = els.graphSvg;
  const decls = filteredDecls();
  const nodeMap = new Map(decls.map((d) => [d.name, d]));
  const query = state.query.toLowerCase();

  if (!decls.length) {
    svg.innerHTML = `<text x="30" y="44" fill="#66716b">표시할 선언이 없습니다.</text>`;
    svg.setAttribute("viewBox", "0 0 640 240");
    svg.style.width = "640px";
    svg.style.height = "240px";
    return;
  }

  const memo = new Map();
  const levelOf = (decl, trail = new Set()) => {
    if (memo.has(decl.name)) return memo.get(decl.name);
    if (trail.has(decl.name)) return 0;
    trail.add(decl.name);
    const deps = decl.deps.filter((dep) => nodeMap.has(dep));
    const level = deps.length ? Math.max(...deps.map((d) => levelOf(nodeMap.get(d), trail))) + 1 : 0;
    memo.set(decl.name, level);
    trail.delete(decl.name);
    return level;
  };

  const levels = new Map();
  for (const decl of decls) {
    const level = levelOf(decl);
    if (!levels.has(level)) levels.set(level, []);
    levels.get(level).push(decl);
  }
  for (const group of levels.values()) {
    group.sort((a, b) => statusWeight(a) - statusWeight(b) || a.line - b.line);
  }

  const nodeWidth = 216, nodeHeight = 64, xGap = 90, yGap = 30, margin = 34;
  const maxLevel = Math.max(...levels.keys());
  const maxRows = Math.max(...[...levels.values()].map((g) => g.length));
  const width = Math.max(760, margin * 2 + (maxLevel + 1) * nodeWidth + maxLevel * xGap);
  const height = Math.max(460, margin * 2 + maxRows * (nodeHeight + yGap));

  const positions = new Map();
  for (const [level, group] of levels) {
    const groupHeight = group.length * nodeHeight + Math.max(0, group.length - 1) * yGap;
    const startY = Math.max(margin, (height - groupHeight) / 2);
    group.forEach((decl, index) => {
      positions.set(decl.name, {
        x: margin + level * (nodeWidth + xGap),
        y: startY + index * (nodeHeight + yGap)
      });
    });
  }

  const edges = [];
  for (const decl of decls) {
    for (const dep of decl.deps) {
      if (nodeMap.has(dep)) edges.push([dep, decl.name]);
    }
  }

  const marker = `
    <defs>
      <marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
        <path d="M0,0 L9,4.5 L0,9 z" fill="#82908a"></path>
      </marker>
      <marker id="arrowOpen" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
        <path d="M0,0 L9,4.5 L0,9 z" fill="#9a73d8"></path>
      </marker>
    </defs>`;

  const edgeMarkup = edges.map(([from, to]) => {
    const a = positions.get(from);
    const b = positions.get(to);
    const target = nodeMap.get(to);
    const open = !isVerifiedClosed(nodeMap.get(from)) || !isVerifiedClosed(target);
    const exact = target.edgeBasis === "kernel-direct";
    const x1 = a.x + nodeWidth, y1 = a.y + nodeHeight / 2;
    const x2 = b.x, y2 = b.y + nodeHeight / 2;
    const bend = Math.max(38, (x2 - x1) / 2);
    return `<path class="edge ${open ? "open-edge" : ""} ${exact ? "kernel-edge" : "approx-edge"}"
      d="M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}"
      marker-end="url(#${open ? "arrowOpen" : "arrow"})">
      <title>${exact ? "kernel-direct" : "source-approx"} · ${open ? "conditional/unverified path" : "verified-closed path"}: ${from} → ${to}</title>
    </path>`;
  }).join("");

  const nodeMarkup = decls.map((decl) => {
    const pos = positions.get(decl.name);
    const selected = decl.name === state.selected;
    const dimmed = query && !decl.name.toLowerCase().includes(query);
    const fill = SOURCE_FILL[decl.source] || "#eeeeee";
    const border = KERNEL_BORDER[decl.kernel] || KERNEL_BORDER.unchecked;
    const badgeColor = TRUST_COLOR[decl.trust] || "#666";
    const badgeText = TRUST_SHORT[decl.trust] || decl.trust;
    const badgeW = badgeText.length * 6 + 12;
    const openDot = decl.openDependency
      ? `<circle cx="${pos.x + nodeWidth - badgeW - 16}" cy="${pos.y + 12}" r="5" fill="#7b4fc2">
           <title>open dependency: sorry에 전이적으로 의존</title></circle>`
      : "";
    const basisMark = decl.trustBasis === "kernel" ? "◆" : "◇";
    return `
      <g class="node ${selected ? "is-selected" : ""} ${dimmed ? "is-dimmed" : ""}"
         data-name="${decl.name}" tabindex="0" role="button" aria-label="${decl.name}">
        <title>${decl.kind} ${decl.name}
kernel=${decl.kernel} · source=${decl.source} · trust=${decl.trust} (${decl.trustBasis})</title>
        <rect x="${pos.x}" y="${pos.y}" width="${nodeWidth}" height="${nodeHeight}"
          fill="${fill}" stroke="${border.color}" stroke-width="${border.width}"
          ${border.dash ? `stroke-dasharray="${border.dash}"` : ""} rx="9"></rect>
        <rect x="${pos.x + nodeWidth - badgeW - 6}" y="${pos.y + 5}" width="${badgeW}" height="14"
          rx="7" fill="${badgeColor}"></rect>
        <text class="badge-text" x="${pos.x + nodeWidth - badgeW / 2 - 6}" y="${pos.y + 15.5}"
          text-anchor="middle">${badgeText}</text>
        ${openDot}
        <text class="kind-text" x="${pos.x + 12}" y="${pos.y + 17}">${decl.kind} · ${decl.source} · k:${decl.kernel} ${basisMark}</text>
        <text class="name-text" x="${pos.x + 12}" y="${pos.y + 38}">${fitName(decl.name, 27)}</text>
        <text class="kind-text" x="${pos.x + 12}" y="${pos.y + 54}">L${decl.line}${decl.subtasks.length ? ` · subtasks ${decl.subtasks.length}` : ""}</text>
      </g>`;
  }).join("");

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.style.width = `${width}px`;
  svg.style.height = `${height}px`;
  svg.innerHTML = marker + edgeMarkup + nodeMarkup;

  svg.querySelectorAll(".node").forEach((node) => {
    const select = () => { state.selected = node.dataset.name; render(); };
    node.addEventListener("click", select);
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); }
    });
  });
}

/* ---------- metrics & detail ---------- */

function renderMetrics() {
  const decls = state.decls;
  const count = (fn) => decls.filter(fn).length;
  const openTotal = count((d) => d.isOpen);
  const subtaskTotal = decls.reduce((acc, d) => acc + d.subtasks.length, 0);
  const metrics = [
    ["총 선언", decls.length],
    ["checked", count((d) => d.kernel === "checked")],
    ["open", openTotal],
    ["open-dep", count((d) => d.openDependency)],
    ["conjectural", count((d) => d.trust === "conjectural")],
    ["subtasks", subtaskTotal]
  ];
  els.metrics.innerHTML = metrics.map(([label, value]) => `
    <div class="metric"><strong>${value}</strong><span>${label}</span></div>`).join("");
}

function tokenMarkup(name) {
  if (name === "없음") return `<span class="token" aria-disabled="true">없음</span>`;
  return `<button class="token" type="button" data-token="${name}">${name}</button>`;
}

function renderDetail() {
  const decl = state.decls.find((d) => d.name === state.selected);
  if (!decl) {
    els.detail.innerHTML = `<div class="empty-detail">선택된 선언이 없습니다.</div>`;
    return;
  }

  const trustClass = {
    closed: "t-closed", library: "t-library",
    "cited-external": "t-cited", conjectural: "t-conjectural"
  }[decl.trust] || "t-closed";
  const trustBasis = decl.trustBasis === "kernel"
    ? "kernel-exact"
    : (decl.trustBasis === "stale" ? "stale" : "source-approx");
  const edgeBasis = decl.edgeBasis || "source-approx";

  const axisRow = `
    <div class="axis-row">
      <span class="axis-pill">kernel: <b>${decl.kernel}</b>${state.stale ? " (stale)" : ""}</span>
      <span class="axis-pill">source: <b>${decl.source}</b></span>
      <span class="badge ${trustClass}">trust: ${decl.trust} · ${trustBasis}</span>
      <span class="axis-pill">edges: <b>${edgeBasis}</b></span>
      ${decl.openDependency ? `<span class="badge t-open">⋯open-dep</span>` : ""}
    </div>`;

  const deps = decl.deps.length ? decl.deps : ["없음"];
  const dependents = decl.dependents.length ? decl.dependents : ["없음"];

  const trustBlock = (() => {
    const rows = [];
    if (decl.source === "axiom") {
      rows.push(decl.trustAnnotation
        ? `PF-TRUST: <b>${decl.trustAnnotation}</b>${decl.evidence ? ` — ref: ${escapeHtml(decl.evidence)}` : ""}`
        : `<b>PF-TRUST 주석 없음 → conjectural로 보수적 강등.</b> 문헌 근거가 있으면 <code>-- PF-TRUST: cited-external ref="..."</code>를 붙이십시오.`);
    }
    if (decl.axiomClosure !== null && decl.axiomClosure !== undefined) {
      rows.push(`커널 axiom 폐포: <code>[${decl.axiomClosure.map(escapeHtml).join(", ") || "없음"}]</code>`);
    } else if (decl.kind === "theorem" || decl.kind === "lemma") {
      rows.push("커널 폐포 없음 — trust는 source-approx 그래프에서 전파된 값입니다.");
    }
    if (decl.unknownAxioms.length) {
      rows.push(`파일 밖 미확인 axiom (conjectural 처리): ${decl.unknownAxioms.map(escapeHtml).join(", ")}`);
    }
    return rows.map((r) => `<div class="insight">${r}</div>`).join("");
  })();

  const subtasks = decl.subtasks.length
    ? `<div class="detail-block"><h4>하위 과제 (PF-SUBTASK)</h4>
        <ul class="subtask-list">${decl.subtasks.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul></div>`
    : "";

  const diagnostics = decl.diagnostics.length
    ? decl.diagnostics.map((d) =>
        `<div class="diagnostic ${d.severity}">L${d.line}:${d.column || 1} ${escapeHtml(d.message)}</div>`).join("")
    : `<div class="diagnostic muted">이 선언에 매칭된 Lean 진단이 없습니다.</div>`;

  els.detail.innerHTML = `
    <h3>${decl.name}</h3>
    <div class="detail-meta">${decl.kind} · line ${decl.line}–${decl.endLine}${decl.modifiers.length ? ` · ${decl.modifiers.map(escapeHtml).join(" ")}` : ""}</div>
    ${axisRow}
    ${decl.actualName ? `<div class="detail-block"><h4>Lean 커널 ID</h4><code>${escapeHtml(decl.actualName)}</code></div>` : ""}
    <div class="detail-block"><h4>선언부</h4><pre class="signature">${escapeHtml(decl.signature)}</pre></div>
    <div class="detail-block"><h4>Trust 근거</h4>${trustBlock || `<div class="insight">닫힌 노드입니다.</div>`}</div>
    ${subtasks}
    <div class="detail-block"><h4>직접 의존성 <span class="muted">(${edgeBasis})</span></h4>
      <div class="token-list">${deps.map(tokenMarkup).join("")}</div></div>
    <div class="detail-block"><h4>참조하는 후속 선언</h4>
      <div class="token-list">${dependents.map(tokenMarkup).join("")}</div></div>
    <div class="detail-block"><h4>Lean 진단</h4>${diagnostics}</div>`;

  els.detail.querySelectorAll("[data-token]").forEach((token) => {
    token.addEventListener("click", () => {
      const name = token.dataset.token;
      if (state.decls.some((d) => d.name === name)) {
        state.selected = name;
        render();
      }
    });
  });
}

function render() {
  renderMetrics();
  renderGraph();
  renderDetail();
  for (const button of els.modeButtons) {
    button.classList.toggle("active", button.dataset.mode === state.mode);
  }
}

function invalidateDisplayedAnalysis() {
  // Revoke both settled and in-flight evidence before the visible source can
  // diverge from the graph. The next parse may restore structure, but only a
  // fresh verification may clear the stale state.
  state.requestId += 1;
  state.stale = true;
  state.run = null;
  state.graph = { ...state.graph, edgeBasis: "source-approx" };
  const byName = new Map(state.decls.map((d) => [d.name, d]));
  for (const decl of state.decls) {
    decl.kernel = "unchecked";
    decl.deps = [...(decl.approxDeps || [])];
    decl.dependents = [];
    decl.edgeBasis = "source-approx";
    decl.actualName = "";
    decl.trustBasis = "stale";
    decl.axiomClosure = null;
    decl.diagnostics = [];
    decl.isOpen = decl.source !== "proved";
    decl.isVerifiedClosed = false;
  }
  for (const decl of state.decls) {
    for (const dep of decl.deps) {
      const target = byName.get(dep);
      if (target && !target.dependents.includes(decl.name)) {
        target.dependents.push(decl.name);
      }
    }
  }
  els.staleState.hidden = false;
  els.parseState.textContent = `${state.decls.length} declarations · source-approx`;
  els.verifyState.textContent = "Lean 미검증 (소스 변경됨)";
  els.hashState.textContent = "";
  render();
}

async function replaceSource(source, label) {
  if (state.parseTimer) {
    clearTimeout(state.parseTimer);
    state.parseTimer = null;
  }
  els.leanInput.value = source;
  els.sourceLabel.textContent = label;
  invalidateDisplayedAnalysis();
  await runParse({ keepStale: true });
}

function scheduleCurrentSourceParse() {
  if (state.parseTimer) clearTimeout(state.parseTimer);
  state.parseTimer = setTimeout(() => {
    state.parseTimer = null;
    runParse({ keepStale: state.stale });
  }, 250);
}

/* ---------- events ---------- */

els.parseButton.addEventListener("click", () => runParse({ keepStale: state.stale }));
els.verifyButton.addEventListener("click", runVerify);
els.sampleButton.addEventListener(
  "click",
  () => replaceSource(sampleLean, "Sample.lean")
);
els.leanInput.addEventListener("input", () => {
  invalidateDisplayedAnalysis();
  scheduleCurrentSourceParse();
});
els.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value.trim();
  renderGraph();
});
els.modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    render();
  });
});
els.expandGraphButton.addEventListener("click", () => {
  state.graphExpanded = !state.graphExpanded;
  els.workspace.classList.toggle("graph-expanded", state.graphExpanded);
  els.expandGraphButton.setAttribute("aria-pressed", String(state.graphExpanded));
  els.expandGraphButton.title = state.graphExpanded ? "그래프 축소" : "그래프 확대";
  els.expandGraphButton.setAttribute(
    "aria-label", state.graphExpanded ? "그래프 축소" : "그래프 확대"
  );
});
els.fileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  const source = await file.text();
  await replaceSource(source, file.name);
});

els.leanInput.value = sampleLean;
runParse({ keepStale: false });
