"use strict";
/* Q Branch test harness — zero dependencies.
   index.html is one self-contained file: the app is a single inline <script>.
   Rather than restructure the app to be importable (which would mean shipping a
   build step and a module loader to a page whose whole point is that it is one
   offline file), we run that script verbatim inside a node `vm` context backed
   by a permissive DOM stub. The app boots exactly as it does in a browser —
   render passes included — and every top-level function and constant is then
   callable from the tests. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const INDEX = path.join(__dirname, "..", "index.html");

function extractAppScript() {
  const html = fs.readFileSync(INDEX, "utf8");
  const opens = html.split("<script>").length - 1;
  assert.strictEqual(opens, 1, `expected exactly one <script> block in index.html, found ${opens}`);
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(m, "could not extract the app <script> block");
  return m[1];
}

/* A DOM element stand-in that swallows everything the app does to it while
   still reporting back what was written, so render output can be asserted. */
function makeEl(tag) {
  const el = {
    tagName: String(tag || "div").toUpperCase(),
    _kids: [], style: {}, dataset: {},
    value: "", textContent: "", innerHTML: "", className: "",
    tabIndex: 0, disabled: false, checked: false, files: [], href: "", download: "",
  };
  el.classList = {
    _s: new Set(),
    add(...c) { c.forEach(x => x && el.classList._s.add(x)); },
    remove(...c) { c.forEach(x => el.classList._s.delete(x)); },
    toggle(c, on) { if (on === undefined) { el.classList._s.has(c) ? el.classList._s.delete(c) : el.classList._s.add(c); } else if (on) { el.classList._s.add(c); } else { el.classList._s.delete(c); } },
    contains(c) { return el.classList._s.has(c); },
  };
  el.appendChild = c => { el._kids.push(c); return c; };
  el.removeChild = c => { el._kids = el._kids.filter(x => x !== c); return c; };
  el.addEventListener = () => {};
  el.removeEventListener = () => {};
  el.setAttribute = () => {};
  el.getAttribute = () => null;
  el.querySelector = () => makeEl("div");
  el.querySelectorAll = () => [];
  el.closest = () => null;
  el.click = () => {};
  el.select = () => {};
  el.scrollIntoView = () => {};
  el.focus = () => {};
  Object.defineProperty(el, "children", { get: () => el._kids });
  return el;
}

function makeStore() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    clear: () => m.clear(),
    _map: m,
  };
}

/* Boot the app in a fresh context. Returns handles for driving it from tests. */
function boot() {
  const els = new Map();
  const byId = id => {
    if (!els.has(id)) els.set(id, makeEl("div"));
    return els.get(id);
  };
  const document = {
    getElementById: byId,
    createElement: makeEl,
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
    body: makeEl("body"),
    hidden: false,
    execCommand: () => true,
  };
  const localStorage = makeStore();
  const sandbox = {
    document, localStorage,
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, isNaN, parseInt, parseFloat, String, Number, Object, Array, Set, Map, RegExp, Error,
    navigator: { vibrate: () => {}, clipboard: null },
    location: { protocol: "file:", href: "file:///index.html" },
    confirm: () => true,
    alert: () => {},
    URL: { createObjectURL: () => "blob:stub", revokeObjectURL: () => {} },
    Blob: function Blob() {},
    FileReader: function FileReader() {},
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window.addEventListener = () => {};

  const ctx = vm.createContext(sandbox);
  vm.runInContext(extractAppScript(), ctx, { filename: "index.html:<script>" });

  /* Evaluate an expression against the booted app. Top-level `const`/`let` live
     in the context's global lexical environment and `function` declarations on
     its global object, so both are in scope for later scripts — same as a second
     <script> tag on the page. */
  /* Marshal results across the realm boundary. Objects built inside the vm have
     that context's prototypes, so assert.deepStrictEqual would reject a matching
     array purely on prototype identity; a JSON round-trip hands the test plain
     host-realm values. Primitives pass through unchanged. */
  const evalIn = expr => {
    const json = vm.runInContext(`JSON.stringify((${expr}))`, ctx, { filename: "test-expr" });
    return json === undefined ? undefined : JSON.parse(json);
  };
  const run = code => vm.runInContext(`(function(){${code}})()`, ctx, { filename: "test-body" });

  return {
    ctx, evalIn, run, els, localStorage,
    html: id => byId(id).innerHTML,
    text: id => byId(id).textContent,
    cls: id => byId(id).className,
    /* Back to a clean seeded database between tests. A fresh install starts in
       Block 0, which is where the app now actually opens. */
    reset() {
      localStorage.clear();
      run(`db = seed(); rebuildProgram(); curDay = Object.keys(PROGRAM)[0]; writeNow();`);
    },
    /* Jump the install to a given block — Block 1 is the full A/B/C program, so
       every Change 9 assertion about templates is made against it explicitly
       rather than against whatever block the app happens to boot into. */
    toBlock(i) {
      run(`db.program={i:${i|0}, done:0}; db.sessions={A:null,B:null,C:null};
           rebuildProgram(); curDay=Object.keys(PROGRAM)[0]; writeNow();`);
    },
  };
}

module.exports = { boot, makeEl, extractAppScript, INDEX };
