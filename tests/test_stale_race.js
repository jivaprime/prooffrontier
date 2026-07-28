const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
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
  const hash = verified ? "a".repeat(64) : null;
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
    "sampleButton", "graphSvg", "metrics", "detail", "parseState",
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
    document,
    fetch,
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

  pendingVerify.resolve(response(analysisFor(
    "theorem demo : True := trivial",
    true
  )));
  await inFlight;

  assert.equal(elements.staleState.hidden, false);
  assert.equal(elements.verifyState.textContent, "Lean 미검증 (소스 변경됨)");
  assert.equal(elements.hashState.textContent, "");
  assert.match(elements.graphSvg.innerHTML, /stroke="#9aa5a0"/);
  assert.doesNotMatch(elements.verifyState.textContent, /^Lean OK/);
});
