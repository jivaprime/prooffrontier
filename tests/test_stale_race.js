const assert = require("node:assert/strict");
const { createHash, webcrypto } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { TextEncoder } = require("node:util");
const vm = require("node:vm");

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  toggle(name, force) {
    const enabled = force === undefined ? !this.values.has(name) : Boolean(force);
    if (enabled) this.values.add(name);
    else this.values.delete(name);
    return enabled;
  }
}

class FakeElement {
  constructor(id, textContent = "") {
    this.id = id;
    this.textContent = textContent;
    this.value = "";
    this.hidden = false;
    this.disabled = false;
    this.innerHTML = "";
    this.dataset = {};
    this.files = [];
    this.style = {};
    this.attributes = new Map();
    this.classList = new FakeClassList();
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  async dispatch(type, event = {}) {
    event.target ||= this;
    const listeners = this.listeners.get(type) || [];
    await Promise.all(listeners.map((listener) => listener(event)));
  }

  querySelectorAll() {
    return [];
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

function response(payload) {
  return {
    ok: true,
    status: 200,
    async json() {
      return payload;
    }
  };
}

function analysisFor(source, verified) {
  const kernel = verified ? "checked" : "unchecked";
  const edgeBasis = verified ? "kernel-direct" : "source-approx";
  const hash = verified
    ? createHash("sha256").update(source, "utf8").digest("hex")
    : null;
  return {
    schemaVersion: 1,
    decls: [{
      kind: "theorem",
      name: "demo",
      id: "demo",
      sourceName: "demo",
      namespace: "",
      modifiers: [],
      line: 1,
      endLine: 1,
      signature: source,
      source: "proved",
      kernel,
      trust: "closed",
      trustBasis: verified ? "kernel" : "approx",
      openDependency: false,
      trustAnnotation: null,
      evidence: "",
      subtasks: [],
      deps: [],
      approxDeps: [],
      dependents: [],
      edgeBasis,
      actualName: verified ? "demo" : "",
      axiomClosure: verified ? [] : null,
      unknownAxioms: [],
      diagnostics: [],
      isOpen: false,
      isVerifiedClosed: verified
    }],
    graph: { edgeBasis },
    run: {
      ok: verified ? true : null,
      status: verified ? "ok" : "not-run",
      sourceHash: hash,
      probeRan: verified,
      probeOk: verified,
      nodeSummary: { expected: 1, checked: verified ? 1 : 0 },
      summary: { errors: 0, warnings: 0 }
    }
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function makeDom() {
  const ids = [
    "workspace", "leanInput", "fileInput", "parseButton", "verifyButton",
    "sampleButton", "languageButton", "graphSvg", "metrics", "detail", "parseState",
    "verifyState", "hashState", "staleState", "sourceLabel",
    "searchInput", "expandGraphButton"
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement(id)]));
  elements.sampleLean = new FakeElement(
    "sampleLean",
    "theorem demo : True := trivial"
  );
  elements.sourceLabel.textContent = "Sample.lean";
  elements.staleState.hidden = true;
  return {
    elements,
    document: {
      getElementById(id) {
        return elements[id];
      },
      querySelectorAll() {
        return [];
      }
    }
  };
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("English mode translates evidence lifecycle states", async () => {
  const { document, elements } = makeDom();
  let assignedUrl = "";
  const fetch = async (requestPath, options) => {
    const { source } = JSON.parse(options.body);
    return response(analysisFor(source, requestPath === "api/verify"));
  };
  const location = {
    href: "http://127.0.0.1:8766/?lang=en",
    search: "?lang=en",
    assign(value) { assignedUrl = value; }
  };
  const context = vm.createContext({
    clearTimeout,
    console,
    crypto: webcrypto,
    document,
    fetch,
    location,
    navigator: { language: "ko-KR" },
    setTimeout,
    TextEncoder,
    URL,
    URLSearchParams
  });
  const appPath = path.join(__dirname, "..", "ui", "app.js");
  vm.runInContext(fs.readFileSync(appPath, "utf8"), context, {
    filename: appPath
  });
  await flush();

  assert.equal(elements.languageButton.textContent, "KO");
  await elements.languageButton.dispatch("click");
  assert.equal(assignedUrl, "http://127.0.0.1:8766/?lang=ko");
  await elements.verifyButton.dispatch("click");
  assert.match(elements.verifyState.textContent, /^Lean OK/);

  elements.leanInput.value = "theorem demo : True := by trivial";
  await elements.leanInput.dispatch("input");
  assert.equal(
    elements.verifyState.textContent,
    "Lean not verified (source changed)"
  );
});

test("an edit rejects an in-flight verified result and keeps the DOM stale", async () => {
  const { document, elements } = makeDom();
  const pendingVerify = deferred();
  let verifyCount = 0;
  let nextTimer = 1;
  const timers = new Map();

  const fetch = async (requestPath, options) => {
    const { source } = JSON.parse(options.body);
    if (requestPath === "api/parse") {
      return response(analysisFor(source, false));
    }
    assert.equal(requestPath, "api/verify");
    verifyCount += 1;
    if (verifyCount === 1) {
      return response(analysisFor(source, true));
    }
    return pendingVerify.promise;
  };

  const context = vm.createContext({
    clearTimeout(id) {
      timers.delete(id);
    },
    console,
    crypto: webcrypto,
    document,
    fetch,
    TextEncoder,
    setTimeout(callback) {
      const id = nextTimer++;
      timers.set(id, callback);
      return id;
    }
  });
  const appPath = path.join(__dirname, "..", "ui", "app.js");
  vm.runInContext(fs.readFileSync(appPath, "utf8"), context, {
    filename: appPath
  });
  await flush();

  await elements.verifyButton.dispatch("click");
  assert.match(elements.verifyState.textContent, /^Lean OK/);
  assert.match(elements.graphSvg.innerHTML, /stroke="#1e7d3e"/);
  assert.notEqual(elements.hashState.textContent, "");

  const inFlight = elements.verifyButton.dispatch("click");
  await flush();
  elements.leanInput.value = "theorem demo : True := by trivial";
  await elements.leanInput.dispatch("input");

  assert.equal(elements.staleState.hidden, false);
  assert.equal(elements.verifyState.textContent, "Lean 미검증 (소스 변경됨)");
  assert.equal(elements.hashState.textContent, "");
  assert.match(elements.graphSvg.innerHTML, /stroke="#9aa5a0"/);

  const stalePayload = analysisFor(
    "theorem demo : True := trivial",
    true
  );
  stalePayload.schemaVersion = 2;
  pendingVerify.resolve(response(stalePayload));
  await inFlight;

  assert.equal(elements.staleState.hidden, false);
  assert.equal(elements.verifyState.textContent, "Lean 미검증 (소스 변경됨)");
  assert.equal(elements.hashState.textContent, "");
  assert.match(elements.graphSvg.innerHTML, /stroke="#9aa5a0"/);
  assert.doesNotMatch(elements.verifyState.textContent, /^Lean OK/);
  assert.doesNotMatch(elements.verifyState.textContent, /프로토콜 오류/);
});

test("loading a file immediately revokes the previous verified evidence", async () => {
  const { document, elements } = makeDom();
  const pendingFileRead = deferred();
  const pendingReplacementParse = deferred();
  let parseCount = 0;

  const fetch = async (requestPath, options) => {
    const { source } = JSON.parse(options.body);
    if (requestPath === "api/parse") {
      parseCount += 1;
      if (parseCount === 1) return response(analysisFor(source, false));
      return pendingReplacementParse.promise;
    }
    assert.equal(requestPath, "api/verify");
    return response(analysisFor(source, true));
  };

  const context = vm.createContext({
    clearTimeout,
    console,
    crypto: webcrypto,
    document,
    fetch,
    setTimeout,
    TextEncoder
  });
  const appPath = path.join(__dirname, "..", "ui", "app.js");
  vm.runInContext(fs.readFileSync(appPath, "utf8"), context, {
    filename: appPath
  });
  await flush();
  await elements.verifyButton.dispatch("click");
  assert.match(elements.verifyState.textContent, /^Lean OK/);

  const replacementSource = "theorem demo : True := by trivial";
  elements.fileInput.files = [{
    name: "B.lean",
    async text() {
      return pendingFileRead.promise;
    }
  }];
  const loadingFile = elements.fileInput.dispatch("change");
  await flush();

  assert.equal(elements.leanInput.value, "");
  assert.equal(elements.sourceLabel.textContent, "B.lean");
  assert.equal(elements.staleState.hidden, false);
  assert.equal(elements.verifyState.textContent, "Lean 미검증 (소스 변경됨)");
  assert.equal(elements.hashState.textContent, "");
  assert.doesNotMatch(elements.graphSvg.innerHTML, /stroke="#1e7d3e"/);
  assert.doesNotMatch(elements.verifyState.textContent, /^Lean OK/);

  pendingFileRead.resolve(replacementSource);
  await flush();
  assert.equal(elements.leanInput.value, replacementSource);

  pendingReplacementParse.resolve(response(analysisFor(
    replacementSource,
    false
  )));
  await loadingFile;

  assert.equal(elements.staleState.hidden, false);
  assert.equal(elements.hashState.textContent, "");
  assert.doesNotMatch(elements.verifyState.textContent, /^Lean OK/);
});

test("loading the sample immediately revokes the previous verified evidence", async () => {
  const { document, elements } = makeDom();
  const pendingSampleParse = deferred();
  let parseCount = 0;

  const fetch = async (requestPath, options) => {
    const { source } = JSON.parse(options.body);
    if (requestPath === "api/parse") {
      parseCount += 1;
      if (parseCount < 3) return response(analysisFor(source, false));
      return pendingSampleParse.promise;
    }
    assert.equal(requestPath, "api/verify");
    return response(analysisFor(source, true));
  };

  const context = vm.createContext({
    clearTimeout,
    console,
    crypto: webcrypto,
    document,
    fetch,
    setTimeout,
    TextEncoder
  });
  const appPath = path.join(__dirname, "..", "ui", "app.js");
  vm.runInContext(fs.readFileSync(appPath, "utf8"), context, {
    filename: appPath
  });
  await flush();

  const otherSource = "theorem demo : True := by\n  trivial";
  elements.leanInput.value = otherSource;
  elements.sourceLabel.textContent = "A.lean";
  await elements.parseButton.dispatch("click");
  await elements.verifyButton.dispatch("click");
  assert.match(elements.verifyState.textContent, /^Lean OK/);

  const loadingSample = elements.sampleButton.dispatch("click");
  await flush();

  assert.equal(
    elements.leanInput.value,
    elements.sampleLean.textContent.trim()
  );
  assert.equal(elements.sourceLabel.textContent, "Sample.lean");
  assert.equal(elements.staleState.hidden, false);
  assert.equal(elements.verifyState.textContent, "Lean 미검증 (소스 변경됨)");
  assert.equal(elements.hashState.textContent, "");
  assert.doesNotMatch(elements.graphSvg.innerHTML, /stroke="#1e7d3e"/);
  assert.doesNotMatch(elements.verifyState.textContent, /^Lean OK/);

  pendingSampleParse.resolve(response(analysisFor(
    elements.sampleLean.textContent.trim(),
    false
  )));
  await loadingSample;

  assert.equal(elements.staleState.hidden, false);
  assert.equal(elements.hashState.textContent, "");
  assert.doesNotMatch(elements.verifyState.textContent, /^Lean OK/);
});

for (const schemaVersion of [undefined, 2]) {
  const label = schemaVersion === undefined ? "missing" : String(schemaVersion);
  test(`unsupported schema ${label} is rejected before verified nodes apply`, async () => {
    const { document, elements } = makeDom();

    const fetch = async (requestPath, options) => {
      const { source } = JSON.parse(options.body);
      if (requestPath === "api/parse") {
        return response(analysisFor(source, false));
      }
      assert.equal(requestPath, "api/verify");
      const payload = analysisFor(source, true);
      if (schemaVersion === undefined) delete payload.schemaVersion;
      else payload.schemaVersion = schemaVersion;
      return response(payload);
    };

    const context = vm.createContext({
      clearTimeout,
      console,
      crypto: webcrypto,
      document,
      fetch,
      setTimeout,
      TextEncoder
    });
    const appPath = path.join(__dirname, "..", "ui", "app.js");
    vm.runInContext(fs.readFileSync(appPath, "utf8"), context, {
      filename: appPath
    });
    await flush();

    await elements.verifyButton.dispatch("click");

    assert.match(elements.verifyState.textContent, /Unsupported response schema/);
    assert.equal(elements.hashState.textContent, "");
    assert.equal(elements.staleState.hidden, false);
    assert.doesNotMatch(elements.graphSvg.innerHTML, /stroke="#1e7d3e"/);
    assert.doesNotMatch(elements.verifyState.textContent, /^Lean OK/);
  });
}

test("a mismatched verification source hash is rejected atomically", async () => {
  const { document, elements } = makeDom();

  const fetch = async (requestPath, options) => {
    const { source } = JSON.parse(options.body);
    if (requestPath === "api/parse") {
      return response(analysisFor(source, false));
    }
    assert.equal(requestPath, "api/verify");
    const payload = analysisFor(source, true);
    payload.run.sourceHash = "0".repeat(64);
    return response(payload);
  };

  const context = vm.createContext({
    clearTimeout,
    console,
    crypto: webcrypto,
    document,
    fetch,
    setTimeout,
    TextEncoder
  });
  const appPath = path.join(__dirname, "..", "ui", "app.js");
  vm.runInContext(fs.readFileSync(appPath, "utf8"), context, {
    filename: appPath
  });
  await flush();

  await elements.verifyButton.dispatch("click");

  assert.match(elements.verifyState.textContent, /source hash does not match/);
  assert.equal(elements.hashState.textContent, "");
  assert.equal(elements.staleState.hidden, false);
  assert.doesNotMatch(elements.graphSvg.innerHTML, /stroke="#1e7d3e"/);
  assert.doesNotMatch(elements.verifyState.textContent, /^Lean OK/);
});

test("source-approx trust cannot render a verified-closed path", async () => {
  const { document, elements } = makeDom();

  const fetch = async (requestPath, options) => {
    const { source } = JSON.parse(options.body);
    const payload = analysisFor(source, requestPath === "api/verify");
    if (requestPath === "api/verify") {
      const target = payload.decls[0];
      target.deps = ["base"];
      target.approxDeps = ["base"];
      target.edgeBasis = "source-approx";
      target.trustBasis = "approx";
      target.isVerifiedClosed = true;
      const base = {
        ...target,
        name: "base",
        id: "base",
        sourceName: "base",
        deps: [],
        approxDeps: [],
        dependents: ["demo"],
        edgeBasis: "kernel-direct",
        trustBasis: "kernel",
        isVerifiedClosed: true
      };
      payload.decls = [base, target];
      payload.graph.edgeBasis = "mixed";
      payload.run.nodeSummary = { expected: 2, checked: 2 };
    }
    return response(payload);
  };

  const context = vm.createContext({
    clearTimeout,
    console,
    crypto: webcrypto,
    document,
    fetch,
    setTimeout,
    TextEncoder
  });
  const appPath = path.join(__dirname, "..", "ui", "app.js");
  vm.runInContext(fs.readFileSync(appPath, "utf8"), context, {
    filename: appPath
  });
  await flush();

  await elements.verifyButton.dispatch("click");

  assert.match(elements.verifyState.textContent, /^Lean OK/);
  assert.match(elements.graphSvg.innerHTML, /class="edge open-edge approx-edge"/);
  assert.doesNotMatch(
    elements.graphSvg.innerHTML,
    /verified-closed path: base → demo/
  );
});
