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

const requestedLanguage = (
  typeof location !== "undefined" && typeof URLSearchParams !== "undefined"
) ? new URLSearchParams(location.search).get("lang") : null;
const browserLanguage = typeof navigator !== "undefined" ? navigator.language : "ko";
const UI_LANGUAGE = requestedLanguage === "en" || requestedLanguage === "ko"
  ? requestedLanguage
  : (String(browserLanguage).toLowerCase().startsWith("ko") ? "ko" : "en");

const UI_COPY = {
  ko: {
    subtitle: "검증된 성과 · 열린 과제 · 가정의 전파 경로",
    sample: "샘플",
    openFile: "파일 열기",
    leanUnverified: "Lean 미검증",
    sourceChanged: "소스 변경됨 · 재검증 필요",
    leanSource: "Lean 소스",
    dependencyGraph: "의존성 그래프",
    graphRefinement: "(노드 먼저 구성 · 간선: source-approx → kernel-direct)",
    searchNodes: "노드 검색",
    expandGraph: "그래프 확대",
    collapseGraph: "그래프 축소",
    fillSource: "채움=source",
    borderKernel: "테두리=kernel",
    badgeTrust: "배지=trust",
    edgeEvidence: "간선 근거",
    conditionalPath: "조건부·미검증 경로",
    declarationDetails: "선언 상세",
    responseProtocolError: "응답 프로토콜 오류",
    verificationProtocolError: "검증 프로토콜 오류",
    declarations: "declarations",
    parsing: "파싱 중…",
    serverRequired: "서버 필요",
    verifying: "Lean 검증 중… (source gate + node/edge probe)",
    verificationServerError: "검증 서버 오류",
    unverifiedChanged: "Lean 미검증 (소스 변경됨)",
    unverifiedNode: "Lean 미검증 (node: unchecked)",
    closureAvailable: "axiom 폐포 확보",
    nodesApproximate: "일부 노드 근사",
    leanFailed: "Lean 실패",
    errors: "errors",
    noDeclarations: "표시할 선언이 없습니다.",
    kernelChecked: "현재 소스의 인증된 Lean Environment에서 선언이 실현됨",
    kernelFailed: "이 선언에 귀속된 Lean 오류가 있음",
    kernelUnchecked: "현재 스냅샷에 인증된 선언 결과가 없음",
    openDependency: "open dependency: sorry에 전이적으로 의존",
    totalDeclarations: "총 선언",
    noSelection: "선택된 선언이 없습니다.",
    line: "line",
    leanKernelId: "Lean 커널 ID",
    declaration: "선언부",
    trustEvidence: "Trust 근거",
    subtasks: "하위 과제 (PF-SUBTASK)",
    directDependencies: "직접 의존성",
    downstreamDeclarations: "참조하는 후속 선언",
    leanDiagnostics: "Lean 진단",
    none: "없음",
    noMatchedDiagnostic: "이 선언에 매칭된 Lean 진단이 없습니다.",
    noKernelClosure: "커널 폐포 없음 — trust는 source-approx 그래프에서 전파된 값입니다.",
    kernelAxiomClosure: "커널 axiom 폐포",
    unknownExternalAxioms: "파일 밖 미확인 axiom (conjectural 처리)",
    unannotatedAxiom: "PF-TRUST 주석 없음 → conjectural로 보수적 강등.",
    addCitation: "문헌 근거가 있으면",
    closedNode: "닫힌 노드입니다.",
    sourceLoading: "소스 불러오는 중…",
    sourceReadFailed: "소스 읽기 실패"
  },
  en: {
    subtitle: "Verified progress · open tasks · assumption paths",
    sample: "Sample",
    openFile: "Open file",
    leanUnverified: "Lean not verified",
    sourceChanged: "Source changed · re-verification required",
    leanSource: "Lean source",
    dependencyGraph: "Dependency graph",
    graphRefinement: "(nodes first · edges: source-approx → kernel-direct)",
    searchNodes: "Search nodes",
    expandGraph: "Expand graph",
    collapseGraph: "Collapse graph",
    fillSource: "fill=source",
    borderKernel: "border=kernel",
    badgeTrust: "badge=trust",
    edgeEvidence: "edge evidence",
    conditionalPath: "conditional or unverified path",
    declarationDetails: "Declaration details",
    responseProtocolError: "Response protocol error",
    verificationProtocolError: "Verification protocol error",
    declarations: "declarations",
    parsing: "Parsing…",
    serverRequired: "Server required",
    verifying: "Verifying with Lean… (source gate + node/edge probe)",
    verificationServerError: "Verification server error",
    unverifiedChanged: "Lean not verified (source changed)",
    unverifiedNode: "Lean not verified (node: unchecked)",
    closureAvailable: "axiom closure available",
    nodesApproximate: "some nodes remain approximate",
    leanFailed: "Lean failed",
    errors: "errors",
    noDeclarations: "No declarations to display.",
    kernelChecked: "Realized in the authenticated Lean Environment for this source",
    kernelFailed: "A Lean error is attributed to this declaration",
    kernelUnchecked: "No authenticated declaration result exists for this snapshot",
    openDependency: "open dependency: transitively depends on sorry",
    totalDeclarations: "declarations",
    noSelection: "No declaration is selected.",
    line: "line",
    leanKernelId: "Lean kernel ID",
    declaration: "Declaration",
    trustEvidence: "Trust evidence",
    subtasks: "Subtasks (PF-SUBTASK)",
    directDependencies: "Direct dependencies",
    downstreamDeclarations: "Downstream declarations",
    leanDiagnostics: "Lean diagnostics",
    none: "none",
    noMatchedDiagnostic: "No Lean diagnostic is attributed to this declaration.",
    noKernelClosure: "No kernel closure is available; trust was propagated through the source-approx graph.",
    kernelAxiomClosure: "Kernel axiom closure",
    unknownExternalAxioms: "Unknown out-of-file axioms (treated as conjectural)",
    unannotatedAxiom: "No PF-TRUST annotation; conservatively downgraded to conjectural.",
    addCitation: "To record literature evidence, add",
    closedNode: "This node is closed.",
    sourceLoading: "Loading source…",
    sourceReadFailed: "Failed to read source"
  }
};

function uiText(key) {
  return UI_COPY[UI_LANGUAGE][key] || UI_COPY.ko[key] || key;
}

function applyStaticTranslations() {
  document.documentElement?.setAttribute("lang", UI_LANGUAGE);
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = uiText(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.setAttribute("placeholder", uiText(element.dataset.i18nPlaceholder));
  });
  document.querySelectorAll("[data-i18n-title]").forEach((element) => {
    const label = uiText(element.dataset.i18nTitle);
    element.setAttribute("title", label);
    element.setAttribute("aria-label", label);
  });
}

applyStaticTranslations();

const sampleLean = document.getElementById("sampleLean").textContent.trim();
const SUPPORTED_SCHEMA_VERSION = 1;

const els = {
  workspace: document.getElementById("workspace"),
  leanInput: document.getElementById("leanInput"),
  fileInput: document.getElementById("fileInput"),
  parseButton: document.getElementById("parseButton"),
  verifyButton: document.getElementById("verifyButton"),
  sampleButton: document.getElementById("sampleButton"),
  languageButton: document.getElementById("languageButton"),
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
  requestId: 0,
  documentGeneration: 0
};

if (els.languageButton) {
  els.languageButton.textContent = UI_LANGUAGE === "ko" ? "EN" : "KO";
  els.languageButton.title = UI_LANGUAGE === "ko"
    ? "Switch to English"
    : "한국어로 전환";
}

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

async function sha256Hex(source) {
  const bytes = new TextEncoder().encode(source);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function protocolError(analysis, expectedSourceHash = null) {
  if (!analysis || analysis.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    const received = analysis && Object.hasOwn(analysis, "schemaVersion")
      ? analysis.schemaVersion
      : "missing";
    return `Unsupported response schema: ${received}`;
  }
  if (expectedSourceHash !== null && analysis.run?.sourceHash !== expectedSourceHash) {
    return "Verification response source hash does not match the submitted source";
  }
  return null;
}

function rejectProtocolPayload(message) {
  invalidateDisplayedAnalysis();
  els.parseState.textContent = uiText("responseProtocolError");
  els.verifyState.textContent = `${uiText("verificationProtocolError")}: ${message}`;
}

function applyAnalysis(
  analysis,
  verified,
  { keepStale = false, expectedSourceHash = null } = {}
) {
  const error = protocolError(analysis, expectedSourceHash);
  if (error) {
    rejectProtocolPayload(error);
    return false;
  }

  state.decls = analysis.decls || [];
  state.graph = analysis.graph || { edgeBasis: "source-approx" };
  state.run = analysis.run || null;
  state.stale = keepStale;
  els.staleState.hidden = !state.stale;
  els.parseState.textContent = `${state.decls.length} ${uiText("declarations")} · ${state.graph.edgeBasis}`;

  if (!state.decls.some((d) => d.name === state.selected)) {
    const fallback = state.decls.find((d) => (d.sourceName || d.name).startsWith("FINAL"))
      || [...state.decls].reverse().find((d) => d.kind === "theorem")
      || state.decls[state.decls.length - 1];
    state.selected = fallback ? fallback.name : null;
  }

  const run = state.run;
  if (state.stale) {
    els.verifyState.textContent = uiText("unverifiedChanged");
    els.hashState.textContent = "";
  } else if (!verified || !run || run.status === "not-run") {
    els.verifyState.textContent = uiText("unverifiedNode");
    els.hashState.textContent = "";
  } else if (run.ok) {
    const summary = run.nodeSummary || {};
    const nodes = ` · nodes ${summary.checked || 0}/${summary.expected || state.decls.length}`;
    const probe = run.probeRan && run.probeOk
      ? ` · ${state.graph.edgeBasis} · ${uiText("closureAvailable")}`
      : ` · ${state.graph.edgeBasis} · ${uiText("nodesApproximate")}`;
    const warnings = run.summary.warnings ? ` · ${run.summary.warnings} warnings` : "";
    els.verifyState.textContent = `Lean OK${warnings}${nodes}${probe}`;
    els.hashState.textContent = `sha256:${(run.sourceHash || "").slice(0, 12)}…`;
  } else {
    const summary = run.nodeSummary || {};
    els.verifyState.textContent = `${uiText("leanFailed")} (${run.status}) · nodes ${summary.checked || 0}/${summary.expected || state.decls.length} · ${run.summary.errors} ${uiText("errors")}`;
    els.hashState.textContent = run.sourceHash ? `sha256:${run.sourceHash.slice(0, 12)}…` : "";
  }
  render();
  return true;
}

async function runParse({ keepStale = state.stale } = {}) {
  const submittedSource = els.leanInput.value;
  const requestId = ++state.requestId;
  const documentGeneration = state.documentGeneration;
  els.parseState.textContent = uiText("parsing");
  try {
    const analysis = await callApi("api/parse", submittedSource);
    if (
      requestId !== state.requestId ||
      documentGeneration !== state.documentGeneration ||
      submittedSource !== els.leanInput.value
    ) return;
    applyAnalysis(analysis, false, { keepStale });
  } catch (error) {
    els.parseState.textContent = `${uiText("serverRequired")}: ${error}`;
  }
}

async function runVerify() {
  if (state.parseTimer) {
    clearTimeout(state.parseTimer);
    state.parseTimer = null;
  }
  const submittedSource = els.leanInput.value;
  const requestId = ++state.requestId;
  const documentGeneration = state.documentGeneration;
  els.verifyButton.disabled = true;
  els.verifyState.textContent = uiText("verifying");
  try {
    const submittedSourceHash = await sha256Hex(submittedSource);
    if (
      requestId !== state.requestId ||
      documentGeneration !== state.documentGeneration ||
      submittedSource !== els.leanInput.value
    ) return;
    const analysis = await callApi("api/verify", submittedSource);
    if (
      requestId !== state.requestId ||
      documentGeneration !== state.documentGeneration ||
      submittedSource !== els.leanInput.value
    ) return;
    applyAnalysis(analysis, true, { expectedSourceHash: submittedSourceHash });
  } catch (error) {
    els.verifyState.textContent = `${uiText("verificationServerError")}: ${error}`;
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
  return (
    !state.stale &&
    decl.kernel === "checked" &&
    decl.source === "proved" &&
    decl.trust === "closed" &&
    !decl.openDependency &&
    decl.trustBasis === "kernel"
  );
}

function kernelMeaning(kernel) {
  if (kernel === "checked") return uiText("kernelChecked");
  if (kernel === "failed") return uiText("kernelFailed");
  return uiText("kernelUnchecked");
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
    svg.innerHTML = `<text x="30" y="44" fill="#66716b">${uiText("noDeclarations")}</text>`;
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
    const badgeColor = state.stale ? "#66716b" : (TRUST_COLOR[decl.trust] || "#666");
    const badgeText = state.stale ? "stale" : (TRUST_SHORT[decl.trust] || decl.trust);
    const badgeW = badgeText.length * 6 + 12;
    const openDot = decl.openDependency
      ? `<circle cx="${pos.x + nodeWidth - badgeW - 16}" cy="${pos.y + 12}" r="5" fill="#7b4fc2">
           <title>${uiText("openDependency")}</title></circle>`
      : "";
    const basisMark = decl.trustBasis === "kernel" ? "◆" : "◇";
    return `
      <g class="node ${selected ? "is-selected" : ""} ${dimmed ? "is-dimmed" : ""}"
         data-name="${decl.name}" tabindex="0" role="button" aria-label="${decl.name}">
        <title>${decl.kind} ${decl.name}
kernel=${decl.kernel} (${kernelMeaning(decl.kernel)}) · source=${decl.source} · trust=${decl.trust} (${decl.trustBasis})</title>
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
    [uiText("totalDeclarations"), decls.length],
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
  if (name === uiText("none")) return `<span class="token" aria-disabled="true">${uiText("none")}</span>`;
  return `<button class="token" type="button" data-token="${name}">${name}</button>`;
}

function renderDetail() {
  const decl = state.decls.find((d) => d.name === state.selected);
  if (!decl) {
    els.detail.innerHTML = `<div class="empty-detail">${uiText("noSelection")}</div>`;
    return;
  }

  const trustClass = state.stale ? "t-stale" : ({
    closed: "t-closed", library: "t-library",
    "cited-external": "t-cited", conjectural: "t-conjectural"
  }[decl.trust] || "t-closed");
  const trustBasis = state.stale
    ? "stale"
    : decl.trustBasis === "kernel"
    ? "kernel-exact"
    : (decl.trustBasis === "stale" ? "stale" : "source-approx");
  const trustLabel = state.stale ? "stale" : decl.trust;
  const edgeBasis = decl.edgeBasis || "source-approx";

  const axisRow = `
    <div class="axis-row">
      <span class="axis-pill" title="${kernelMeaning(decl.kernel)}">kernel: <b>${decl.kernel}</b>${state.stale ? " (stale)" : ""}</span>
      <span class="axis-pill">source: <b>${decl.source}</b></span>
      <span class="badge ${trustClass}">trust: ${trustLabel} · ${trustBasis}</span>
      <span class="axis-pill">edges: <b>${edgeBasis}</b></span>
      ${decl.openDependency ? `<span class="badge t-open">⋯open-dep</span>` : ""}
    </div>`;

  const deps = decl.deps.length ? decl.deps : [uiText("none")];
  const dependents = decl.dependents.length ? decl.dependents : [uiText("none")];

  const trustBlock = (() => {
    const rows = [];
    if (decl.source === "axiom") {
      rows.push(decl.trustAnnotation
        ? `PF-TRUST: <b>${decl.trustAnnotation}</b>${decl.evidence ? ` — ref: ${escapeHtml(decl.evidence)}` : ""}`
        : `<b>${uiText("unannotatedAxiom")}</b> ${uiText("addCitation")} <code>-- PF-TRUST: cited-external ref="..."</code>.`);
    }
    if (decl.axiomClosure !== null && decl.axiomClosure !== undefined) {
      rows.push(`${uiText("kernelAxiomClosure")}: <code>[${decl.axiomClosure.map(escapeHtml).join(", ") || uiText("none")}]</code>`);
    } else if (decl.kind === "theorem" || decl.kind === "lemma") {
      rows.push(uiText("noKernelClosure"));
    }
    if (decl.unknownAxioms.length) {
      rows.push(`${uiText("unknownExternalAxioms")}: ${decl.unknownAxioms.map(escapeHtml).join(", ")}`);
    }
    return rows.map((r) => `<div class="insight">${r}</div>`).join("");
  })();

  const subtasks = decl.subtasks.length
    ? `<div class="detail-block"><h4>${uiText("subtasks")}</h4>
        <ul class="subtask-list">${decl.subtasks.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul></div>`
    : "";

  const diagnostics = decl.diagnostics.length
    ? decl.diagnostics.map((d) =>
        `<div class="diagnostic ${d.severity}">L${d.line}:${d.column || 1} ${escapeHtml(d.message)}</div>`).join("")
    : `<div class="diagnostic muted">${uiText("noMatchedDiagnostic")}</div>`;

  els.detail.innerHTML = `
    <h3>${decl.name}</h3>
    <div class="detail-meta">${decl.kind} · ${uiText("line")} ${decl.line}–${decl.endLine}${decl.modifiers.length ? ` · ${decl.modifiers.map(escapeHtml).join(" ")}` : ""}</div>
    ${axisRow}
    ${decl.actualName ? `<div class="detail-block"><h4>${uiText("leanKernelId")}</h4><code>${escapeHtml(decl.actualName)}</code></div>` : ""}
    <div class="detail-block"><h4>${uiText("declaration")}</h4><pre class="signature">${escapeHtml(decl.signature)}</pre></div>
    <div class="detail-block"><h4>${uiText("trustEvidence")}</h4>${trustBlock || `<div class="insight">${uiText("closedNode")}</div>`}</div>
    ${subtasks}
    <div class="detail-block"><h4>${uiText("directDependencies")} <span class="muted">(${edgeBasis})</span></h4>
      <div class="token-list">${deps.map(tokenMarkup).join("")}</div></div>
    <div class="detail-block"><h4>${uiText("downstreamDeclarations")}</h4>
      <div class="token-list">${dependents.map(tokenMarkup).join("")}</div></div>
    <div class="detail-block"><h4>${uiText("leanDiagnostics")}</h4>${diagnostics}</div>`;

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

function invalidateDisplayedAnalysis({ replaceDocument = false } = {}) {
  // Revoke both settled and in-flight evidence before the visible source can
  // diverge from the graph. The next parse may restore structure, but only a
  // fresh verification may clear the stale state.
  state.requestId += 1;
  if (replaceDocument) state.documentGeneration += 1;
  state.stale = true;
  state.run = null;
  state.graph = { ...state.graph, edgeBasis: "source-approx" };
  if (replaceDocument) {
    state.decls = [];
    state.selected = null;
  }
  const byName = new Map(state.decls.map((d) => [d.name, d]));
  for (const decl of state.decls) {
    decl.kernel = "unchecked";
    decl.deps = [...(decl.approxDeps || [])];
    decl.dependents = [];
    decl.edgeBasis = "source-approx";
    decl.actualName = "";
    decl.trustBasis = "stale";
    decl.axiomClosure = null;
    decl.unknownAxioms = [];
    decl.diagnostics = [];
    decl.openDependency = decl.source === "sorry";
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
  els.parseState.textContent = `${state.decls.length} ${uiText("declarations")} · source-approx`;
  els.verifyState.textContent = uiText("unverifiedChanged");
  els.hashState.textContent = "";
  render();
}

async function replaceSource(loadSource, label) {
  if (state.parseTimer) {
    clearTimeout(state.parseTimer);
    state.parseTimer = null;
  }
  invalidateDisplayedAnalysis({ replaceDocument: true });
  const documentGeneration = state.documentGeneration;
  els.sourceLabel.textContent = label;
  els.leanInput.value = "";
  els.parseState.textContent = uiText("sourceLoading");
  try {
    const source = await loadSource();
    if (documentGeneration !== state.documentGeneration) return;
    els.leanInput.value = source;
    await runParse({ keepStale: true });
  } catch (error) {
    if (documentGeneration !== state.documentGeneration) return;
    els.parseState.textContent = `${uiText("sourceReadFailed")}: ${error}`;
  }
}

function scheduleCurrentSourceParse() {
  if (state.parseTimer) clearTimeout(state.parseTimer);
  state.parseTimer = setTimeout(() => {
    state.parseTimer = null;
    runParse({ keepStale: state.stale });
  }, 250);
}

/* ---------- events ---------- */

els.languageButton?.addEventListener("click", () => {
  if (typeof location === "undefined" || typeof URL === "undefined") return;
  const nextUrl = new URL(location.href);
  nextUrl.searchParams.set("lang", UI_LANGUAGE === "ko" ? "en" : "ko");
  location.assign(nextUrl.toString());
});
els.parseButton.addEventListener("click", () => runParse({ keepStale: state.stale }));
els.verifyButton.addEventListener("click", runVerify);
els.sampleButton.addEventListener(
  "click",
  () => replaceSource(() => sampleLean, "Sample.lean")
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
  els.expandGraphButton.title = state.graphExpanded ? uiText("collapseGraph") : uiText("expandGraph");
  els.expandGraphButton.setAttribute(
    "aria-label", state.graphExpanded ? uiText("collapseGraph") : uiText("expandGraph")
  );
});
els.fileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  await replaceSource(() => file.text(), file.name);
});

els.leanInput.value = sampleLean;
runParse({ keepStale: false });
