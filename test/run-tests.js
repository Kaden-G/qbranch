"use strict";
/* Q Branch — regression suite for Changes 9–13.
   One test per acceptance / verification line in the change specs, plus the
   guards their bodies ask for. Run with `node test/run-tests.js`. No
   dependencies, no build.

   Note on blocks: since Change 13 a fresh install boots into Block 0 "Show Up",
   so every assertion about the full A/B/C program names Block 1 explicitly via
   `blockProgram(1)` or `app.toBlock(1)`. */
const assert = require("assert");
const fs = require("fs");
const { boot, INDEX } = require("./harness.js");

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

/* The six closing arm SLOTS across the three days. Day A and Day B both close
   with Lying DB Triceps Extension (identical prescription), so the six slots
   carry five distinct names. */
const ARM_SIX = [
  "Incline DB Curl", "Lying DB Triceps Extension",
  "Hammer Curl",
  "Cable Curl (Bayesian)", "Cable Kickback",
];

/* ---- 9.1 / acceptance: A, B and C each END with an arm superset ---- */
test("9.1 — each day ends with a biceps→triceps arm superset, after core", () => {
  const app = boot();
  const days = { A: ["Incline DB Curl", "Lying DB Triceps Extension"], B: ["Hammer Curl", "Lying DB Triceps Extension"], C: ["Cable Curl (Bayesian)", "Cable Kickback"] };
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
  ["A", "B", "C"].forEach(d => { totals[d] = app.evalIn(`blockProgram(1).${d}.ex.reduce((a,x)=>a+x.sets,0)`); });
  assert.deepStrictEqual(totals, { A: 20, B: 21, C: 22 }, "block-1 set totals");
  ["A", "B", "C"].forEach(d => {
    const armSets = app.evalIn(`blockProgram(1).${d}.ex.filter(x=>x.ss==="B").reduce((a,x)=>a+x.sets,0)`);
    assert.strictEqual(armSets, 6, `day ${d}: the arm superset contributes 6 sets`);
  });
  // and the number the Train header prints is that same sum
  app.toBlock(1);
  app.run(`curDay="A"; ensureSession(); renderTrain();`);
  assert.strictEqual(app.text("setmeta"), "20 sets");
});

/* ---- acceptance: the pressing counter is unchanged by arm work ---- */
test("9.1 — logging any arm exercise leaves the pressing counter untouched", () => {
  const app = boot();
  app.reset();
  assert.strictEqual(app.evalIn("pressingSetsWeek()"), 0, "baseline");
  ARM_SIX.forEach(n => assert.strictEqual(app.evalIn(`isPressingName(${JSON.stringify(n)})`), false, `${n} must not be pressing`));

  const SIX_SLOTS = [...ARM_SIX, "Lying DB Triceps Extension"];   // six slots, five names
  app.run(`
    db.history.push({id:"t-arms", type:"lift", flags:[], date:todayISO(), day:"A", block:1,
      exercises: ${JSON.stringify(SIX_SLOTS)}.map(n=>({name:n, sets:[{rep:"12",wt:"20",rpe:"8"},{rep:"12",wt:"20",rpe:"8"},{rep:"12",wt:"20",rpe:"8"}]}))});
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

  // one week of the prescription: six slots × 3 sets, Lying DB Tri Ext twice
  push("a", [...ARM_SIX, "Lying DB Triceps Extension"].map(n => ({ name: n, sets: three })));
  assert.strictEqual(app.evalIn("armSetsWeek()"), 18, "the six slots = 18");

  push("b", [{ name: "Goblet Squat", sets: three }, { name: "Seated Cable Row", sets: three }]);
  assert.strictEqual(app.evalIn("armSetsWeek()"), 18, "non-arm work must not count");

  push("c", [{ name: "DB Hammer Curl", sets: [{ rep: "11", wt: "25", rpe: "8" }, { rep: "11", wt: "25", rpe: "8" }] },
             { name: "Rope Pushdown",  sets: [{ rep: "11", wt: "40", rpe: "8" }, { rep: "11", wt: "40", rpe: "8" }] }]);
  assert.strictEqual(app.evalIn("armSetsWeek()"), 18, "the legacy mid-session arm slots are outside the prescription");

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
  ["A", "B", "C"].forEach(d => { core[d] = app.evalIn(`blockProgram(1).${d}.ex.filter(x=>x.muscle==="Core").map(x=>[x.name,x.sets])`); });
  assert.deepStrictEqual(core.A, [["Plank", 2]], "A");
  assert.deepStrictEqual(core.B, [["Dead Bug", 2]], "B");
  assert.deepStrictEqual(core.C, [["Pallof Press", 2]], "C");
});

/* ---- 9.2: the estimate flags, and never proposes cutting the arm work ---- */
test("9.2 — over-budget days are flagged, and the trim suggestion is never the arms", () => {
  const app = boot();
  assert.strictEqual(app.evalIn("getSettings().sessionBudgetMin"), 35, "editable budget constant");
  ["A", "B", "C"].forEach(d => {
    const st = app.evalIn(`sessionEstState(blockProgram(1).${d}.ex)`);
    assert.ok(st.min > 0, `day ${d}: estimate produced`);
    if (st.over) {
      assert.ok(st.trim, `day ${d}: an over-budget day must name a trim candidate`);
      assert.notStrictEqual(st.trim.muscle, "Arms", `day ${d}: must never suggest trimming arms`);
      assert.notStrictEqual(st.trim.muscle, "Core", `day ${d}: core is already at 2`);
      assert.ok(st.trim.sets > 1, `day ${d}: only suggest trimming something with sets to spare`);
    }
  });
  // the arm superset survives the over-budget path — nothing is auto-dropped
  app.toBlock(1);
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
test("schema — v4 databases migrate to v6 without losing anything", () => {
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
            history:m.history.length, flags:m.sorenessFlags.length, done:m.program.done,
            block:m.program.i, histBlock:m.history[0].block, benched:m.benched};
  })()`);
  assert.strictEqual(out.schema, 6, "upgraded");
  assert.deepStrictEqual(out.measurements, [], "measurements branch created");
  assert.strictEqual(out.cap, 7, "the user's own edited setting is preserved");
  assert.strictEqual(out.armTarget, 18, "new defaults filled in");
  assert.strictEqual(out.budget, 35, "new defaults filled in");
  assert.strictEqual(out.history, 1, "history preserved");
  assert.strictEqual(out.flags, 1, "soreness flags preserved");
  // Change 13 — an existing install is moved into Block 0 with a fresh gate;
  // its history, loads and telemetry are untouched, only its place in the arc.
  assert.strictEqual(out.block, 0, "moved into Block 0");
  assert.strictEqual(out.done, 0, "gate starts at 0/6");
  assert.strictEqual(out.histBlock, 1, "old Block-1 history keeps naming Block 1, not Block 0");
  assert.deepStrictEqual(out.benched, ["Lat Pulldown"], "Change 12 — benched list seeded");
});

/* ---- storage: restore no longer drops branches (incl. measurements) ---- */
test("storage — a restored backup keeps settings, schedule, flags and measurements", () => {
  const html = fs.readFileSync(INDEX, "utf8");
  const start = html.indexOf("const d=JSON.parse(r.result);");
  const restore = html.slice(start, html.indexOf("persist(); rebuildProgram();", start));
  ["settings:d.settings", "schedule:d.schedule", "sorenessFlags:d.sorenessFlags",
    "pressingOverrides:d.pressingOverrides", "measurements:d.measurements",
    "benched:d.benched", "block0Done:d.block0Done"].forEach(f =>
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
  assert.strictEqual(app.evalIn("SCHEMA"), 6);
});

/* ============================================================================
   Changes 10–13 — superset rules, Hindu push-ups, the benched list, Block 0
   ========================================================================= */

const LIFT_DAYS = ["A", "B", "C"];
/* Mark every card done, fill every set, and bank the session. */
const bankSession = (app, date) => app.run(`
  ensureSession();
  const s=curSession();
  ${date ? `s.date=${JSON.stringify(date)};` : ""}
  s.data.forEach(x=>{ x.done=true; x.sets.forEach(v=>{ v.rep=String(30), v.wt="35", v.rpe="6"; }); });
  $("finishBtn").onclick();
`);

/* ---- 10.1 / verification: Face Pull + Plank must refuse to pair ---- */
test("10.1 — core is never supersetted; a cross-implement pair is refused", () => {
  const app = boot();
  // the literal verification case: a cable pull and a bodyweight core hold
  const facePull = `{name:"Face Pull",muscle:"Rear Delts",implement:"cable",ss:"X",sets:2}`;
  const plank = `{name:"Plank",muscle:"Core",implement:"bw",ss:"X",sets:2}`;
  assert.strictEqual(app.evalIn(`canSuperset(${facePull}, ${plank})`), false, "cable + core must refuse");
  const out = app.evalIn(`resolveSupersets([${facePull}, ${plank}])`);
  assert.strictEqual(out[0].ss, null, "the pair is dissolved, not silently kept");
  assert.strictEqual(out[1].ss, null, "Plank renders solo");
  assert.strictEqual(out[1].noSS, true, "core is stamped noSS");

  // and across the whole library: no Core exercise ever carries a live ss key
  [0, 1, 2, 3, 4].forEach(bi => LIFT_DAYS.concat(["A", "B"]).forEach(d => {
    const core = app.evalIn(`(blockProgram(${bi}).${d}||{ex:[]}).ex.filter(x=>x.muscle==="Core").map(x=>[x.name,x.ss,!!x.noSS])`);
    core.forEach(([name, ss, noSS]) => {
      assert.strictEqual(ss, null, `block ${bi} day ${d}: ${name} must not be supersetted`);
      assert.strictEqual(noSS, true, `block ${bi} day ${d}: ${name} must carry noSS`);
    });
  }));
});

/* ---- 10.2: same-implement pairing only, across every block ---- */
test("10.2 — every surviving superset shares one implement", () => {
  const app = boot();
  assert.strictEqual(app.evalIn(`canSuperset({implement:"db",muscle:"Arms"},{implement:"db",muscle:"Arms"})`), true, "db + db allowed");
  assert.strictEqual(app.evalIn(`canSuperset({implement:"db",muscle:"Arms"},{implement:"cable",muscle:"Arms"})`), false, "db + cable refused");
  assert.strictEqual(app.evalIn(`canSuperset({muscle:"Arms"},{muscle:"Arms"})`), false, "an unknown implement never pairs");

  for (let bi = 0; bi < 5; bi++) {
    const days = app.evalIn(`Object.keys(blockProgram(${bi}))`);
    days.forEach(d => {
      const groups = app.evalIn(`(function(){
        const g={}; blockProgram(${bi}).${d}.ex.forEach(x=>{ if(x.ss) (g[x.ss]||(g[x.ss]=[])).push([x.name,x.implement]); });
        return g; })()`);
      Object.entries(groups).forEach(([key, members]) => {
        assert.ok(members.length >= 2, `block ${bi} day ${d} group ${key}: a group of one is not a superset`);
        const imps = new Set(members.map(m => m[1]));
        assert.strictEqual(imps.size, 1, `block ${bi} day ${d} group ${key}: mixed implements ${[...imps].join("+")}`);
        assert.ok([...imps][0], `block ${bi} day ${d} group ${key}: implement must be set`);
      });
    });
  }
});

/* ---- 10: `implement` reaches every exercise in the library ---- */
test("10 — every exercise in the library declares an implement", () => {
  const app = boot();
  const missing = app.evalIn(`(function(){
    const all=[].concat(...["A","B","C"].map(d=>BASE[d].ex), ...["A","B"].map(d=>BLOCK0[d].ex), EXPRESS.ex, [HINDU_PUSHUP]);
    return all.filter(d=>!d.implement).map(d=>d.name);
  })()`);
  assert.deepStrictEqual(missing, [], "these defs have no implement");
});

/* ---- 10: Face Pull leaves the working sets for the warm-up ---- */
test("10 — Face Pull is a band warm-up item on every lifting day, not a working set", () => {
  const app = boot();
  for (let bi = 0; bi < 5; bi++) {
    app.evalIn(`Object.keys(blockProgram(${bi}))`).forEach(d => {
      const names = app.evalIn(`blockProgram(${bi}).${d}.ex.map(x=>x.name)`);
      assert.ok(!names.includes("Face Pull"), `block ${bi} day ${d}: Face Pull must not be a working set`);
      const warm = app.evalIn(`blockProgram(${bi}).${d}.warm`);
      const fp = warm.find(w => w[2] && w[2].name === "Face Pull");
      assert.ok(fp, `block ${bi} day ${d}: Face Pull missing from the warm-up`);
      assert.strictEqual(fp[1], "×15", "×15");
      assert.strictEqual(fp[2].implement, "band", "band");
    });
  }
});

/* ---- 11: Hindu push-ups, default (warm-up) role ---- */
test("11 — Hindu push-ups warm up every lifting session at ×6, with the safety cue", () => {
  const app = boot();
  for (let bi = 0; bi < 5; bi++) {
    app.evalIn(`Object.keys(blockProgram(${bi}))`).forEach(d => {
      const hp = app.evalIn(`blockProgram(${bi}).${d}.warm`).find(w => w[2] && w[2].name === "Hindu Push-up");
      assert.ok(hp, `block ${bi} day ${d}: Hindu push-up missing from the warm-up`);
      assert.strictEqual(hp[1], "×6", "six slow reps");
      assert.strictEqual(hp[2].pressing, true, "keeps pressing:true so soreness can link to it");
      assert.strictEqual(hp[2].implement, "bw", "bodyweight");
    });
  }
  const def = app.evalIn("HINDU_PUSHUP");
  assert.strictEqual(def.tag, "Chest");
  assert.strictEqual(def.implement, "bw");
  assert.strictEqual(def.pressing, true);
  assert.ok(/Cobra-lite/.test(def.cues) && /pike-to-plank/.test(def.cues), "spec cues text");
});

/* ---- 11 / verification: warm-ups are exempt from the pressing counter ---- */
test("11 — warm-up push-ups never reach the pressing counter; the home chest slot does", () => {
  const app = boot();
  app.reset();
  // a full Block 0 week: three sessions, two pressing sets each
  app.run(`curDay="A"; db.sessions={A:null,B:null,C:null};`);
  bankSession(app, app.evalIn("daysAgoISO(4)"));
  app.run(`curDay=block0Day();`); bankSession(app, app.evalIn("daysAgoISO(2)"));
  app.run(`curDay=block0Day();`); bankSession(app, app.evalIn("todayISO()"));
  assert.strictEqual(app.evalIn("db.program.done"), 3, "three sessions banked");
  assert.strictEqual(app.evalIn("pressingSetsWeek()"), 6, "6 pressing sets — warm-up push-ups excluded");
  assert.strictEqual(app.evalIn("pressCapState().cap"), 6, "which is exactly the cap");

  // warm-up Hindu push-ups WERE recorded on each session, just not as sets
  assert.ok(app.evalIn(`db.history[db.history.length-1].warmPressing`).includes("Hindu Push-up"),
    "the warm-up movement is recorded so soreness can point at it");

  // in the home-day chest role it is logged, and then it does count
  app.reset();
  app.run(`db.program={i:1,done:0}; db.sessions={A:null,B:null,C:null}; rebuildProgram(); curDay="A";
           ensureSession(); toggleHome();`);
  const names = app.evalIn(`dayTpl("A").ex.map(x=>x.name)`);
  assert.ok(!names.includes("DB Incline Press"), "the chest slot is swapped out at home");
  assert.ok(names.includes("Hindu Push-up"), "…for Hindu push-ups");
  const hp = app.evalIn(`dayTpl("A").ex.find(x=>x.name==="Hindu Push-up")`);
  assert.deepStrictEqual([hp.sets, hp.lo, hp.hi], [3, 8, 12], "3×8–12 in the chest slot");
  assert.strictEqual(app.evalIn(`isPressingName("Hindu Push-up")`), true, "counts against the cap in this role");
  app.run(`db.history.push({id:"h-home", type:"lift", flags:[], date:todayISO(), day:"A", block:1, home:true,
    exercises:[{name:"Hindu Push-up", sets:[{rep:"10",wt:"",rpe:"7"},{rep:"10",wt:"",rpe:"7"},{rep:"10",wt:"",rpe:"7"}]}]});`);
  assert.strictEqual(app.evalIn("pressingSetsWeek()"), 3, "logged home push-ups count");
});

/* ---- 11: the delayed-soreness flag can name a warm-up movement ---- */
test("11 — a shoulder flag surfaces the warm-up push-ups, not just logged sets", () => {
  const app = boot();
  app.reset();
  app.run(`curDay="A";`); bankSession(app, app.evalIn("daysAgoISO(1)"));
  const culprits = app.evalIn(`(function(){
    const f={id:"f-w", joint:"shoulder", severity:3, date:todayISO(), note:"", ts:"", sessions:[]};
    attributeSoreness(f); db.sorenessFlags.push(f);
    return flagCulprits(f).map(c=>c.name+":"+c.kind+(c.warm?":warm":""));
  })()`);
  assert.ok(culprits.includes("Hindu Push-up:pressing:warm"), "the warm-up push-ups are named");
  assert.ok(culprits.includes("DB Incline Press:pressing"), "alongside the logged pressing work");
});

/* ---- 12 / verification: Lat Pulldown is benched everywhere but in history ---- */
test("12 — Lat Pulldown is benched: gone from templates and swaps, kept in history", () => {
  const app = boot();
  app.reset();
  assert.deepStrictEqual(app.evalIn("db.benched"), ["Lat Pulldown"], "seeded benched list");

  for (let bi = 0; bi < 5; bi++) {
    app.evalIn(`Object.keys(blockProgram(${bi}))`).forEach(d => {
      const names = app.evalIn(`blockProgram(${bi}).${d}.ex.map(x=>x.name)`);
      assert.ok(!names.includes("Lat Pulldown"), `block ${bi} day ${d}: benched movement in a template`);
    });
  }
  // …and out of every substitution list offered on a card
  app.toBlock(1);
  const subs = app.evalIn(`["A","B","C"].flatMap(d=>blockProgram(1)[d].ex).map(x=>subFor(x))`);
  assert.ok(!subs.includes("Lat Pulldown"), "benched movement offered as a swap");
  assert.strictEqual(app.evalIn(`subFor({name:"X", sub:"Lat Pulldown"})`), "", "subFor drops a benched alternate");

  // history is untouched: it still shows in the Log and in PRs
  app.run(`db.history.push({id:"h-lp", type:"lift", flags:[], date:todayISO(), day:"B", block:1,
    exercises:[{name:"Lat Pulldown", sets:[{rep:"10",wt:"120",rpe:"7"}]}]});
    renderTrends();`);
  const log = app.evalIn(`historyLogText(db.history[db.history.length-1])`);
  assert.ok(log.includes("Lat Pulldown"), "still readable in the Log entry");
  assert.ok(app.html("prTable").includes("Lat Pulldown"), "still holds its PR");
});

/* ---- 12: the vertical-pull slot, and the add/remove round trip ---- */
test("12 — Straight-Arm Cable Pulldown takes the vertical-pull slot; benching round-trips", () => {
  const app = boot();
  app.reset(); app.toBlock(1);
  const pull = app.evalIn(`blockProgram(1).B.ex.find(x=>x.tag==="Lats · Width")`);
  assert.strictEqual(pull.name, "Straight-Arm Cable Pulldown", "vertical-pull slot");
  assert.strictEqual(pull.implement, "cable");
  assert.strictEqual(pull.sub, "DB Pullover", "home sub");

  // bench it, and it leaves the template; un-bench it and it comes straight back
  app.run(`benchAdd("Straight-Arm Cable Pulldown");`);
  assert.ok(!app.evalIn(`blockProgram(1).B.ex.map(x=>x.name)`).includes("Straight-Arm Cable Pulldown"), "benched → gone");
  app.run(`benchRemove("Straight-Arm Cable Pulldown");`);
  assert.ok(app.evalIn(`blockProgram(1).B.ex.map(x=>x.name)`).includes("Straight-Arm Cable Pulldown"), "un-benched → back");
  app.run(`renderBenched();`);
  assert.ok(app.html("benchList").includes("Lat Pulldown"), "the Vault list renders");
});

/* ---- 13: the two Block 0 templates ---- */
test("13 — Block 0 is two four-card templates at RPE 6, ~25 min, no arm finisher", () => {
  const app = boot();
  const p0 = app.evalIn("Object.keys(blockProgram(0))");
  assert.deepStrictEqual(p0, ["A", "B"], "two templates");
  ["A", "B"].forEach(d => {
    const ex = app.evalIn(`blockProgram(0).${d}.ex`);
    assert.strictEqual(ex.length, 4, `day ${d}: four cards`);
    ex.forEach(x => {
      if (x.rpeMax != null) assert.strictEqual(x.rpeMax, 6, `${x.name}: every working set is RPE 6`);
      assert.strictEqual(x.flat, true, `${x.name}: Block 0 runs flat`);
      assert.notStrictEqual(x.muscle, "Arms", `${x.name}: the arm finisher is off during Block 0`);
      assert.ok(!x.ss, `${x.name}: no supersets in Block 0`);
    });
    const est = app.evalIn(`estimateSessionMinutes(blockProgram(0).${d}.ex)`);
    assert.ok(est <= 25, `day ${d}: ~25 min, got ${est}`);
  });
  // The spec calls it a six-exercise pool; its own table lists eight slots with
  // Goblet Squat shared across both days, which is seven distinct movements.
  // The table is the operative half — the pool is asserted against it.
  const pool = new Set(app.evalIn(`["A","B"].flatMap(d=>blockProgram(0)[d].ex.map(x=>x.name))`));
  assert.deepStrictEqual([...pool].sort(), [
    "Arnold Press", "Chest-Supported Row", "DB Incline Press", "Goblet Squat",
    "Pallof Press", "Plank", "Straight-Arm Cable Pulldown",
  ], "the Block 0 pool");
  assert.strictEqual(app.evalIn(`blockProgram(0).A.ex[0].name`), app.evalIn(`blockProgram(0).B.ex[0].name`),
    "both days open on the same squat");
  assert.ok(app.evalIn(`blockProgram(0).B.ex.find(x=>x.name==="Arnold Press").cues`).includes("cut the rotation"),
    "Arnold Press carries its spec cues");
});

/* ---- 13 / verification: exactly 6 pressing sets a week, matching the cap ---- */
test("13 — Block 0 adds no pressing volume: 2 sets a session, 6 a week, = the cap", () => {
  const app = boot();
  ["A", "B"].forEach(d => {
    const press = app.evalIn(`blockProgram(0).${d}.ex.filter(x=>isPressingName(x.name)).reduce((a,x)=>a+x.sets,0)`);
    assert.strictEqual(press, 2, `day ${d}: exactly 2 pressing sets`);
  });
  assert.strictEqual(2 * 3, app.evalIn("getSettings().pressingCapPerWeek"), "3 sessions × 2 sets = the cap");
});

/* ---- 13: the A-B-A / B-A-B rotation ---- */
test("13 — Block 0 rotates A-B-A then B-A-B off the cumulative session count", () => {
  const app = boot();
  app.reset();
  const seq = [];
  for (let i = 0; i < 6; i++) { app.run(`db.program.done=${i};`); seq.push(app.evalIn("block0Day()")); }
  assert.deepStrictEqual(seq, ["A", "B", "A", "B", "A", "B"], "week 1 A-B-A, week 2 B-A-B");
});

/* ---- 13 / verification: the gate is cumulative, and wants every card done ---- */
test("13 — six completed sessions unlock Block 1, even with a week skipped", () => {
  const app = boot();
  app.reset();
  assert.strictEqual(app.evalIn("BLOCK0_GATE"), 6, "editable gate constant");
  assert.strictEqual(app.evalIn("isBlock0(db.program.i)"), true, "a fresh install starts in Block 0");

  // a session with a card left unmarked banks, shows in Log, but doesn't count
  app.run(`curDay="A"; ensureSession();
    curSession().data.forEach((x,i)=>{ x.done = i<3; x.sets.forEach(v=>{v.rep="10";v.wt="35";v.rpe="6";}); });
    $("finishBtn").onclick();`);
  assert.strictEqual(app.evalIn("db.program.done"), 0, "three of four cards is not a completed session");
  assert.strictEqual(app.evalIn("db.history.length"), 2, "…but it is still banked into Log");

  // six completed sessions, with a two-week hole in the middle
  const dates = ["2026-09-01", "2026-09-03", "2026-09-05", "2026-09-21", "2026-09-23", "2026-09-25"];
  dates.forEach(dt => { app.run(`curDay=block0Day();`); bankSession(app, dt); });

  assert.strictEqual(app.evalIn("isBlock0(db.program.i)"), false, "Block 1 unlocked");
  assert.strictEqual(app.evalIn("BLOCKS[db.program.i].name"), "Re-entry", "…and it is Block 1, not a loop back");
  assert.deepStrictEqual(app.evalIn("Object.keys(PROGRAM)"), ["A", "B", "C"], "the full A/B/C program is back");
  assert.ok(app.evalIn(`PROGRAM.A.ex.some(x=>x.ss==="B")`), "arm finisher resumes in Block 1");
  assert.strictEqual(app.evalIn("db.block0Done.date"), app.evalIn("todayISO()"), "the transition date is logged");
  assert.strictEqual(app.evalIn("db.block0Done.sessions"), 6, "…with the session count that cleared it");
});

/* ---- 13: progression math is off inside Block 0 ---- */
test("13 — Block 0 holds loads flat and surfaces no add/hold/deload prompt", () => {
  const app = boot();
  app.reset();
  app.run(`db.history=[];`);               // no prior exposure at all
  const def = `blockProgram(0).A.ex[0]`;   // Goblet Squat
  assert.strictEqual(app.evalIn(`prescribe(${def}).fresh`), true, "first exposure calibrates");
  assert.ok(/reps in the tank/.test(app.evalIn(`prescribe(${def}).why`)), "…with the calibration cue");

  // top of range at RPE 6 would normally EARN a bump — in Block 0 it must not
  app.run(`db.history.push({id:"b0-1", type:"lift", flags:[], date:todayISO(), day:"A", block:0,
    exercises:[{name:"Goblet Squat", sets:[{rep:"10",wt:"40",rpe:"6"},{rep:"10",wt:"40",rpe:"6"}]}]});`);
  const rx = app.evalIn(`prescribe(${def})`);
  assert.strictEqual(rx.wt, 40, "the load holds exactly where it was");
  assert.ok(!/\+5|Deload|Back off/.test(rx.why), `no progression prompt, got: ${rx.why}`);
  assert.ok(/flat on purpose/.test(rx.why), "and says why");
});

/* ---- 13 / verification: loads carry into Block 1 with no RECALIBRATE ---- */
test("13 — the last Block 0 load is the Block 1 prefill, with no RECALIBRATE badge", () => {
  const app = boot();
  app.reset();
  app.run(`db.history.push({id:"b0-gs", type:"lift", flags:[], date:todayISO(), day:"A", block:0,
    exercises:[{name:"Goblet Squat", sets:[{rep:"10",wt:"45",rpe:"6"},{rep:"10",wt:"45",rpe:"6"}]}]});`);
  app.toBlock(1);
  const rx = app.evalIn(`prescribe(blockProgram(1).A.ex[0])`);
  assert.strictEqual(rx.wt, 45, "the Block 0 load is the baseline");
  assert.ok(!rx.recalibrate, "the transition must not trigger RECALIBRATE");
  assert.strictEqual(rx.fresh, false, "…nor a 🆕 first-exposure state");
  assert.ok(/carried from Block 0/.test(rx.why), "and the card says where it came from");
});

/* ---- 13: the attendance strip leads Trends, and the unlock state is one-time ---- */
test("13 — the 6-box strip leads Trends during Block 0; the unlock note shows once", () => {
  const app = boot();
  app.reset();
  app.run(`db.program.done=2; renderTrends(); renderTrain();`);
  const strip = app.html("b0Strip");
  assert.ok(strip.includes("gs-box"), "six-box strip rendered on Trends");
  assert.strictEqual((strip.match(/class="gs-box["\s]/g) || []).length, 6, "six boxes");
  assert.strictEqual((strip.match(/class="gs-box on"/g) || []).length, 2, "two filled");
  assert.ok(strip.includes("2 / 6"), "count shown");
  assert.ok(app.html("gateStrip").includes("gs-box"), "…and on Train");
  app.run(`renderBlock0Vault();`);
  assert.ok(app.html("vBlock0").includes("2 / 6"), "the Vault logs where the gate stands");

  // once Block 1 is unlocked the strip goes away and the note appears exactly once
  app.run(`db.block0Done={date:"2026-09-25", sessions:6, seen:false}; db.program={i:1,done:0};
           rebuildProgram(); curDay="A"; renderTrends(); renderTrain();`);
  assert.strictEqual(app.html("b0Strip"), "", "the strip retires with Block 0");
  assert.ok(app.html("unlockNote").includes("Block 1 unlocked"), "one-time unlock state shown");
  app.run(`db.block0Done.seen=true; renderUnlockNote();`);
  assert.strictEqual(app.els.get("unlockNote").style.display, "none", "dismissed for good");
  app.run(`renderBlock0Vault();`);
  assert.ok(app.html("vBlock0").includes("2026-09-25"), "the Vault keeps the transition date");
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
