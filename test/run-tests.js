"use strict";
/* Q Branch — Change 9 (arm specialization) regression suite.
   One test per acceptance line in the change spec, plus the guards the spec's
   body asks for. Run with `node test/run-tests.js`. No dependencies, no build. */
const assert = require("assert");
const fs = require("fs");
const { boot, INDEX } = require("./harness.js");

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const ARM_SIX = [
  "Incline DB Curl", "Rope Pushdown",
  "Hammer Curl", "Lying DB Triceps Extension",
  "Cable Curl (Bayesian)", "Cable Kickback",
];

/* ---- 9.1 / acceptance: A, B and C each END with an arm superset ---- */
test("9.1 — each day ends with a biceps→triceps arm superset, after core", () => {
  const app = boot();
  const days = { A: ["Incline DB Curl", "Rope Pushdown"], B: ["Hammer Curl", "Lying DB Triceps Extension"], C: ["Cable Curl (Bayesian)", "Cable Kickback"] };
  for (const [day, pair] of Object.entries(days)) {
    const ex = app.evalIn(`BASE.${day}.ex`);
    const last2 = ex.slice(-2);
    assert.deepStrictEqual(last2.map(d => d.name), pair, `day ${day}: wrong closing pair`);
    last2.forEach(d => {
      assert.strictEqual(d.muscle, "Arms", `${d.name}: muscle`);
      assert.strictEqual(d.ss, "B", `${d.name}: must share superset group B`);
      assert.strictEqual(d.pressing, false, `${d.name}: must not be pressing`);
      assert.strictEqual(d.overhead, false, `${d.name}: must not be overhead`);
      assert.strictEqual(d.sets, 3, `${d.name}: 3 sets`);
      assert.strictEqual(d.rpeMax, 8, `${d.name}: RPE 8`);
      assert.strictEqual(d.rest, 45, `${d.name}: 45s rest`);
      assert.ok(d.sub && d.sub.length, `${d.name}: needs a swap alternate`);
    });
    assert.ok(/Biceps|Brachialis/.test(last2[0].tag), `day ${day}: biceps leads the pair`);
    assert.ok(/Triceps/.test(last2[1].tag), `day ${day}: triceps follows`);
    // core comes immediately before the pair — the arms are genuinely last
    assert.strictEqual(ex[ex.length - 3].muscle, "Core", `day ${day}: arms must sit after core`);
    // a distinct ss key from the preceding group, so renderTrain emits a 2nd badge
    assert.notStrictEqual(ex[ex.length - 3].ss, "B", `day ${day}: needs its own superset badge`);
  }
});

/* ---- acceptance: total session set count reflects the added work ---- */
test("9.1 — session set totals reflect the added arm sets", () => {
  const app = boot();
  const totals = {};
  ["A", "B", "C"].forEach(d => { totals[d] = app.evalIn(`PROGRAM.${d}.ex.reduce((a,x)=>a+x.sets,0)`); });
  assert.deepStrictEqual(totals, { A: 22, B: 21, C: 24 }, "block-1 set totals");
  ["A", "B", "C"].forEach(d => {
    const armSets = app.evalIn(`PROGRAM.${d}.ex.filter(x=>x.ss==="B").reduce((a,x)=>a+x.sets,0)`);
    assert.strictEqual(armSets, 6, `day ${d}: the arm superset contributes 6 sets`);
  });
  // and the number the Train header prints is that same sum
  app.run(`curDay="A"; ensureSession(); renderTrain();`);
  assert.strictEqual(app.text("setmeta"), "22 sets");
});

/* ---- acceptance: the pressing counter is unchanged by arm work ---- */
test("9.1 — logging any arm exercise leaves the pressing counter untouched", () => {
  const app = boot();
  app.reset();
  assert.strictEqual(app.evalIn("pressingSetsWeek()"), 0, "baseline");
  ARM_SIX.forEach(n => assert.strictEqual(app.evalIn(`isPressingName(${JSON.stringify(n)})`), false, `${n} must not be pressing`));

  app.run(`
    db.history.push({id:"t-arms", type:"lift", flags:[], date:todayISO(), day:"A", block:0,
      exercises: ${JSON.stringify(ARM_SIX)}.map(n=>({name:n, sets:[{rep:"12",wt:"20",rpe:"8"},{rep:"12",wt:"20",rpe:"8"},{rep:"12",wt:"20",rpe:"8"}]}))});
  `);
  assert.strictEqual(app.evalIn("armSetsWeek()"), 18, "18 arm sets banked");
  assert.strictEqual(app.evalIn("pressingSetsWeek()"), 0, "pressing must still read 0");
  assert.strictEqual(app.evalIn("pressCapState().over"), false, "cap must not trip on arm work");

  // control: a real pressing set still counts, so the counter is live, not broken
  app.run(`db.history.push({id:"t-press", type:"lift", flags:[], date:todayISO(), day:"C", block:0,
    exercises:[{name:"Flat DB Press", sets:[{rep:"9",wt:"45",rpe:"7"},{rep:"9",wt:"45",rpe:"7"}]}]});`);
  assert.strictEqual(app.evalIn("pressingSetsWeek()"), 2, "pressing counter still works");
  assert.strictEqual(app.evalIn("armSetsWeek()"), 18, "pressing work adds no arm sets");
});

/* ---- 9.3 / acceptance: the tile counts only the six, and renders on Trends ---- */
test("9.3 — arm tile counts only the six superset movements (and their swaps)", () => {
  const app = boot();
  app.reset();
  const push = (id, ex) => app.run(`db.history.push({id:${JSON.stringify(id)}, type:"lift", flags:[], date:todayISO(), day:"A", block:0, exercises:${JSON.stringify(ex)}});`);
  const three = [{ rep: "12", wt: "20", rpe: "8" }, { rep: "12", wt: "20", rpe: "8" }, { rep: "12", wt: "20", rpe: "8" }];

  push("a", ARM_SIX.map(n => ({ name: n, sets: three })));
  assert.strictEqual(app.evalIn("armSetsWeek()"), 18, "the six = 18");

  push("b", [{ name: "Goblet Squat", sets: three }, { name: "Face Pull", sets: three }]);
  assert.strictEqual(app.evalIn("armSetsWeek()"), 18, "non-arm work must not count");

  push("c", [{ name: "DB Hammer Curl", sets: [{ rep: "11", wt: "25", rpe: "8" }, { rep: "11", wt: "25", rpe: "8" }] }]);
  assert.strictEqual(app.evalIn("armSetsWeek()"), 18, "the legacy mid-session arm slot is outside the prescription");

  push("d", [{ name: "Seated DB Curl", sets: three }]);
  assert.strictEqual(app.evalIn("armSetsWeek()"), 21, "a swapped alternate is still direct arm work");

  app.run("renderTrends();");
  const cards = app.html("healthCards");
  assert.ok(cards.includes("Arm sets this week"), "tile must appear on Trends");
  assert.ok(cards.includes("21<span class=\"hc-u\">/ 18</span>"), "tile shows count over target");
});

/* ---- 9.3: a floor, not a ceiling — green at >=15, neutral below, never red ---- */
test("9.3 — arm tile is a floor: green at >=15, neutral below, never red", () => {
  const app = boot();
  const armCard = () => {
    const h = app.html("healthCards");
    const i = h.indexOf("Arm sets this week");
    assert.ok(i >= 0, "arm tile missing");
    return h.slice(i, h.indexOf("</div></div>", i) + 12);
  };
  assert.strictEqual(app.evalIn("getSettings().armSetsTargetPerWeek"), 18, "default target");
  assert.strictEqual(app.evalIn("getSettings().armSetsGreenAt"), 15, "default green threshold");

  const at = n => {
    app.reset();
    app.run(`db.history.push({id:"x", type:"lift", flags:[], date:todayISO(), day:"A", block:0,
      exercises:[{name:"Hammer Curl", sets:Array.from({length:${n}},()=>({rep:"11",wt:"25",rpe:"8"}))}]});
      renderTrends();`);
    return armCard();
  };
  assert.ok(at(0).includes('class="neut"'), "0 sets → neutral");
  assert.ok(at(14).includes('class="neut"'), "14 sets → still neutral");
  assert.ok(at(15).includes('class="good"'), "15 sets → green");
  assert.ok(at(20).includes('class="good"'), "over target → still green, never punished");
  [0, 14, 15, 20].forEach(n => assert.ok(!at(n).includes("warn"), `${n} sets: the arm tile must never read red/warn`));
  assert.deepStrictEqual(
    { green: app.evalIn("armSetState().green"), hit: app.evalIn("armSetState().hit") },
    { green: true, hit: true }, "state flags at 20 sets");
});

/* ---- 9.2 / acceptance: core trimmed to 2 sets on all three days ---- */
test("9.2 — core is 2 sets on every lifting day", () => {
  const app = boot();
  const core = {};
  ["A", "B", "C"].forEach(d => { core[d] = app.evalIn(`PROGRAM.${d}.ex.filter(x=>x.muscle==="Core").map(x=>[x.name,x.sets])`); });
  assert.deepStrictEqual(core.A, [["Plank", 2]], "A");
  assert.deepStrictEqual(core.B, [["Dead Bug", 2]], "B");
  assert.deepStrictEqual(core.C, [["Pallof Press", 2]], "C");
});

/* ---- 9.2: the estimate flags, and never proposes cutting the arm work ---- */
test("9.2 — over-budget days are flagged, and the trim suggestion is never the arms", () => {
  const app = boot();
  assert.strictEqual(app.evalIn("getSettings().sessionBudgetMin"), 35, "editable budget constant");
  ["A", "B", "C"].forEach(d => {
    const st = app.evalIn(`sessionEstState(PROGRAM.${d}.ex)`);
    assert.ok(st.min > 0, `day ${d}: estimate produced`);
    if (st.over) {
      assert.ok(st.trim, `day ${d}: an over-budget day must name a trim candidate`);
      assert.notStrictEqual(st.trim.muscle, "Arms", `day ${d}: must never suggest trimming arms`);
      assert.notStrictEqual(st.trim.muscle, "Core", `day ${d}: core is already at 2`);
      assert.ok(st.trim.sets > 1, `day ${d}: only suggest trimming something with sets to spare`);
    }
  });
  // the arm superset survives the over-budget path — nothing is auto-dropped
  const before = app.evalIn(`PROGRAM.A.ex.filter(x=>x.ss==="B").length`);
  app.run(`curDay="A"; ensureSession(); renderTrain();`);
  assert.strictEqual(app.evalIn(`PROGRAM.A.ex.filter(x=>x.ss==="B").length`), before, "arm slots intact after render");
  assert.ok(app.cls("sessEst").includes("over"), "banner flags the overrun");
  assert.ok(/arm superset stays/.test(app.html("sessEst")), "banner says the arms stay");
});

/* ---- 9.4 / acceptance: soreness flags reach arm exercises ---- */
test("9.4 — elbow and shoulder flags surface arm work alongside pressing", () => {
  const app = boot();
  app.reset();
  app.run(`
    db.history.push({id:"s-y", type:"lift", flags:[], date:daysAgoISO(1), day:"B", block:0, exercises:[
      {name:"Hammer Curl",  sets:[{rep:"11",wt:"25",rpe:"8"}]},
      {name:"Flat DB Press",sets:[{rep:"9", wt:"45",rpe:"7"}]},
      {name:"Leg Press",    sets:[{rep:"11",wt:"200",rpe:"7"}]}]});
  `);
  const culprits = joint => app.evalIn(`(function(){
      const f={id:"f-${joint}", joint:${JSON.stringify(joint)}, severity:3, date:todayISO(), note:"", ts:"", sessions:[]};
      attributeSoreness(f); db.sorenessFlags.push(f);
      return flagCulprits(f).map(c=>c.name+":"+c.kind);
    })()`);

  const elbow = culprits("elbow");
  assert.ok(elbow.includes("Hammer Curl:arm"), "elbow flag must reach the arm exercise");
  assert.ok(elbow.includes("Flat DB Press:pressing"), "…alongside pressing work");
  assert.ok(!elbow.some(x => x.startsWith("Leg Press")), "unrelated work stays out");

  const shoulder = culprits("shoulder");
  assert.ok(shoulder.includes("Hammer Curl:arm"), "shoulder flag is no longer pressing-only");
  assert.ok(shoulder.includes("Flat DB Press:pressing"), "pressing still surfaces");

  assert.deepStrictEqual(culprits("knee"), [], "joints with no arm/pressing scope stay empty");

  app.run("renderSoreRecent();");
  const h = app.html("soreRecent");
  assert.ok(h.includes("culchip arm"), "arm culprit rendered in the flag summary");
  assert.ok(h.includes("culchip pressing"), "pressing culprit rendered too");

  // the elbow joint must actually be selectable in the UI
  assert.ok(fs.readFileSync(INDEX, "utf8").includes('data-v="elbow"'), "elbow chip present in the Log tab");
});

/* ---- 9.1 / 9.6: no overhead triceps variant is reachable ---- */
test("9.1 — no overhead triceps variant is reachable from any arm slot", () => {
  const app = boot();
  const armDefs = app.evalIn(`["A","B","C"].flatMap(d=>BASE[d].ex).filter(x=>x.muscle==="Arms").map(x=>({name:x.name, sub:x.sub, overhead:x.overhead, alt:altName(x)}))`);
  assert.ok(armDefs.length >= 6, "arm slots found");
  armDefs.forEach(d => {
    assert.notStrictEqual(d.overhead, true, `${d.name}: flagged overhead`);
    assert.ok(!/overhead/i.test(d.name), `${d.name}: primary is an overhead variant`);
    assert.ok(!/overhead/i.test(d.alt || ""), `${d.name}: alternate "${d.alt}" is an overhead variant`);
    assert.strictEqual(app.evalIn(`isOverheadName(${JSON.stringify(d.alt || "")})`), false, `${d.name}: alt fails the overhead guard`);
  });
  assert.ok(!fs.readFileSync(INDEX, "utf8").includes("DB overhead extension"), "the retired overhead alternate is gone from the file");
});

/* ---- 9.5 / acceptance: arm circumference saves, persists, reaches Trends ---- */
test("9.5 — arm measurements save, survive a reload, and render on Trends", () => {
  const app = boot();
  app.reset();
  const n = app.evalIn(`saveMeasurement({date:"2026-09-09", shoulder:"49.5", waist:"34.2", armL:"14.8", armR:"15.1"})`);
  assert.strictEqual(n, 4, "all four fields accepted");
  assert.strictEqual(app.evalIn(`latestMeasure("armL").v`), 14.8);
  assert.strictEqual(app.evalIn(`latestMeasure("armR").v`), 15.1);

  // persisted to storage, and survives the migrate() path a reload takes
  app.run("writeNow();");
  const raw = app.localStorage.getItem(app.evalIn("DB_KEY"));
  assert.ok(raw, "written to localStorage");
  assert.strictEqual(JSON.parse(raw).measurements[0].armL, 14.8, "stored on disk");
  const reloaded = app.evalIn(`JSON.stringify(migrate(JSON.parse(localStorage.getItem(DB_KEY))).measurements)`);
  assert.strictEqual(JSON.parse(reloaded)[0].armR, 15.1, "survives migrate() on reload");

  // one decimal, and a blank field leaves the previous value alone
  app.run(`saveMeasurement({date:"2026-09-16", armL:"15.06"});`);
  assert.strictEqual(app.evalIn(`latestMeasure("armL").v`), 15.1, "rounded to one decimal");
  assert.strictEqual(app.evalIn(`latestMeasure("waist").v`), 34.2, "blank field kept the prior waist");
  assert.strictEqual(app.evalIn(`saveMeasurement({date:"2026-09-20"})`), 0, "an all-blank save is a no-op");

  app.run("renderTrends();");
  const board = app.html("ratioBoard");
  assert.ok(board.includes("Arm circumference"), "arm line on the ratio board");
  assert.ok(board.includes("15.1"), "right arm shown");
  assert.ok(board.includes("Shoulder-to-waist"), "taper ratio still present");
});

/* ---- 9.5: arms are their OWN line, not folded into the taper ratio ---- */
test("9.5 — arm circumference is its own line, never folded into shoulder-to-waist", () => {
  const app = boot();
  app.reset();
  app.run(`saveMeasurement({date:"2026-09-09", shoulder:"49.5", waist:"34.2", armL:"14.0", armR:"14.0"});`);
  const before = app.evalIn("shoulderToWaist()");
  assert.strictEqual(before, 1.45, "49.5 / 34.2");
  app.run(`saveMeasurement({date:"2026-10-09", armL:"17.5", armR:"17.5"});`);
  assert.strictEqual(app.evalIn("shoulderToWaist()"), before, "growing the arms must not move the taper ratio");
  assert.strictEqual(app.evalIn("armAverage()"), 17.5, "…but the arm line does move");
});

/* ---- 9.6: the Vault profile carries the new facts ---- */
test("9.6 — Vault profile shows 180 lb, the arm priority and the overhead ban", () => {
  const html = fs.readFileSync(INDEX, "utf8");
  assert.ok(/<b>Bodyweight:<\/b>\s*~180 lb \(2026-09-09\)/.test(html), "bodyweight updated");
  assert.ok(html.includes("Arms are the priority — direct biceps/triceps 3×/week."), "aesthetics goal note");
  assert.ok(html.includes("<b>No overhead triceps extensions.</b>"), "shoulder rule appended");
  assert.ok(/Guardrails:.*no overhead triceps extensions/.test(html), "guardrail line updated");
  assert.ok(html.includes("protein ~130–165 g/day"), "nutrition targets left untouched");
});

/* ---- storage: the v4 → v5 ladder ---- */
test("schema — v4 databases migrate to v5 without losing anything", () => {
  const app = boot();
  const out = app.evalIn(`(function(){
    const v4={app:APP, schema:4, created:"2026-07-01", program:{i:1,done:5},
      settings:{pressingCapPerWeek:7}, schedule:{Mon:{type:"lift",day:"A"}},
      sorenessFlags:[{id:"f",joint:"shoulder",severity:2,date:"2026-08-01",sessions:[]}],
      pressingOverrides:[], telemetry:[], sessions:{A:null,B:null,C:null},
      history:[{id:"h1",type:"lift",flags:[],date:"2026-08-01",day:"A",block:0,exercises:[]}]};
    const m=migrate(v4);
    return {schema:m.schema, measurements:m.measurements, cap:m.settings.pressingCapPerWeek,
            armTarget:m.settings.armSetsTargetPerWeek, budget:m.settings.sessionBudgetMin,
            history:m.history.length, flags:m.sorenessFlags.length, done:m.program.done};
  })()`);
  assert.strictEqual(out.schema, 5, "upgraded");
  assert.deepStrictEqual(out.measurements, [], "measurements branch created");
  assert.strictEqual(out.cap, 7, "the user's own edited setting is preserved");
  assert.strictEqual(out.armTarget, 18, "new defaults filled in");
  assert.strictEqual(out.budget, 35, "new defaults filled in");
  assert.strictEqual(out.history, 1, "history preserved");
  assert.strictEqual(out.flags, 1, "soreness flags preserved");
  assert.strictEqual(out.done, 5, "block progress preserved");
});

/* ---- storage: restore no longer drops branches (incl. measurements) ---- */
test("storage — a restored backup keeps settings, schedule, flags and measurements", () => {
  const html = fs.readFileSync(INDEX, "utf8");
  const restore = html.slice(html.indexOf("const d=JSON.parse(r.result);"), html.indexOf("persist(); curDay="));
  ["settings:d.settings", "schedule:d.schedule", "sorenessFlags:d.sorenessFlags",
    "pressingOverrides:d.pressingOverrides", "measurements:d.measurements"].forEach(f =>
      assert.ok(restore.includes(f), `restore must carry ${f}`));
  assert.ok(restore.includes("schema:(typeof d.schema===\"number\"?d.schema:1)"),
    "restore must migrate from the backup's own schema, not pin it to current");
});

/* ---- the app still boots clean ---- */
test("smoke — the app boots and renders every tab without throwing", () => {
  const app = boot();
  app.run("renderTrain(); renderTele(); renderTrends(); renderVaultStat(); renderSoreRecent(); renderSchedule(); renderMeasureRecent();");
  assert.ok(app.text("setmeta").endsWith("sets"), "train rendered");
  assert.ok(app.html("healthCards").includes("hcard"), "trends rendered");
  assert.ok(app.html("ratioBoard").includes("Shoulder-to-waist"), "ratio board rendered");
  assert.ok(app.html("mRecent").length > 0, "measurement panel rendered");
  assert.strictEqual(app.evalIn("SCHEMA"), 5);
});

/* ---------------- runner ---------------- */
let pass = 0, fail = 0;
for (const t of tests) {
  try { t.fn(); console.log(`  \x1b[32mPASS\x1b[0m  ${t.name}`); pass++; }
  catch (e) {
    fail++;
    console.log(`  \x1b[31mFAIL\x1b[0m  ${t.name}`);
    console.log(`        ${e.message.split("\n").join("\n        ")}`);
  }
}
console.log(`\n${pass} passed, ${fail} failed, ${tests.length} total`);
process.exit(fail ? 1 : 0);
