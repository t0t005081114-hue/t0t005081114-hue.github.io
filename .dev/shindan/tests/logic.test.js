// 診断ロジックの全パターン検証（Node のみで実行：node .dev/shindan/tests/logic.test.js）
"use strict";
const assert = require("assert");
const path = require("path");
const S = require(path.join(__dirname, "../../../shindan/diagnosis.js"));

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("PASS", name); } catch (e) { fail++; console.log("FAIL", name, "\n  ", e.message); } };

const sizes = S.QUESTIONS.map(q => q.options.length);
function* all(i = 0, cur = []) {
  if (i === sizes.length) { yield cur.slice(); return; }
  for (let a = 0; a < sizes[i]; a++) { cur.push(a); yield* all(i + 1, cur); cur.pop(); }
}
const ALL = [...all()];
const idx = (q, label) => { const i = S.QUESTIONS[q].options.findIndex(o => o.label.startsWith(label)); if (i < 0) throw new Error("no option " + label); return i; };

t("設問は8問・タイプは5つ", () => { assert.strictEqual(S.QUESTIONS.length, 8); assert.deepStrictEqual(Object.keys(S.TYPES).sort(), ["A","B","C","D","E"]); });
t("全パターン数 = " + sizes.join("×"), () => assert.strictEqual(ALL.length, sizes.reduce((a, b) => a * b, 1)));

t("Q1の各選択肢はちょうど1タイプに対応し、5タイプを1つずつ網羅", () => {
  const m = S.QUESTIONS[0].options.map(o => Object.keys(o.pts));
  m.forEach(k => assert.strictEqual(k.length, 1));
  assert.deepStrictEqual(m.map(k => k[0]).sort(), ["A","B","C","D","E"]);
});
t("準備度の設問（Q2/3/6/7）は E 以外に加点しない", () => {
  S.QUESTIONS.filter(q => q.kind === "ready").forEach(q => q.options.forEach(o => Object.keys(o.pts).forEach(k => assert.strictEqual(k, "E", q.id))));
});
t("分野の設問（Q1/4/5/8）は各選択肢1タイプのみ", () => {
  S.QUESTIONS.filter(q => q.kind === "topic").forEach(q => q.options.forEach(o => assert.strictEqual(Object.keys(o.pts).length, 1, q.id)));
});

const dist = { A: 0, B: 0, C: 0, D: 0, E: 0 }, rules = {};
const results = ALL.map(a => { const r = S.decide(a); dist[r.type]++; rules[r.rule] = (rules[r.rule] || 0) + 1; return [a, r]; });

t("全パターンで例外なく1タイプに決まる（予備ルール 'order' は一度も使われない）", () => {
  assert.strictEqual(rules.order || 0, 0);
  results.forEach(([a, r]) => assert.ok(S.TYPE_IDS.includes(r.type), a.join()));
});
t("決定は決まった値（同じ回答なら同じ結果）", () => {
  results.slice(0, 2000).forEach(([a, r]) => assert.strictEqual(S.decide(a.slice()).type, r.type));
});
t("結果は必ず最高点のタイプ", () => {
  results.forEach(([a, r]) => { const max = Math.max(...Object.values(r.scores)); assert.strictEqual(r.scores[r.type], max, a.join()); });
});
t("同点のときは Q1 のタイプが含まれていれば必ず Q1 のタイプ", () => {
  results.forEach(([a, r]) => { const q1 = Object.keys(S.QUESTIONS[0].options[a[0]].pts)[0]; if (r.tied.includes(q1)) assert.strictEqual(r.type, q1, a.join()); });
});
t("5タイプすべてに到達できる", () => Object.values(dist).forEach(n => assert.ok(n > 0)));
t("判定理由は全パターンで1つ以上出る", () => {
  results.forEach(([a, r]) => assert.ok(S.reasons(a, r.type).length >= 1, a.join() + " -> " + r.type));
});
t("次のステップは結果タイプ以外の A〜D", () => {
  results.forEach(([a, r]) => { assert.ok(["A","B","C","D"].includes(r.next)); assert.notStrictEqual(r.next, r.type); });
});

// ---- 初心者・時間・目的の整合性 ----
t("完全な初心者（未経験・週1h未満・スマホ中心・小さく）は、分野の4問が全部そろわない限り E", () => {
  const n = 0, h = 0, pc = 0, small = 0;
  results.filter(([a]) => a[1] === n && a[2] === h && a[5] === pc && a[6] === small).forEach(([a, r]) => {
    const topics = [0, 3, 4, 7].map(q => Object.keys(S.QUESTIONS[q].options[a[q]].pts)[0]);
    const allSame = topics.every(x => x === topics[0]) && topics[0] !== "E";
    assert.strictEqual(r.type, allSame ? topics[0] : "E", a.join());
  });
});
t("経験者（ツール作成経験・3h以上・PC得意・しっかり）は E にならない（ただし Q1/Q4/Q5 で『まだ』系を選んだ場合を除く）", () => {
  results.filter(([a]) => a[1] === 3 && a[2] === 2 && a[5] === 2 && a[6] === 1).forEach(([a, r]) => {
    const vague = a[0] === 4 || a[3] === 4 || a[4] === 4;
    if (!vague) assert.notStrictEqual(r.type, "E", a.join());
  });
});
t("readiness は 0〜8、4以上は準備度の設問で初心者寄り", () => results.forEach(([a, r]) => assert.ok(r.readiness >= 0 && r.readiness <= 8)));

// ---- 代表例 ----
const rep = [
  ["A 生活管理を楽にしたい（会話のみ・1〜3h）", [0, 1, 1, 0, 0, 1, 1, 0], "A"],
  ["B 調べものを整理したい経験者", [1, 3, 2, 1, 1, 2, 1, 1], "B"],
  ["C 仕事の進捗管理（文章作成経験・3h以上）", [2, 2, 2, 2, 2, 1, 1, 2], "C"],
  ["D 発信・副業（会話のみ）", [3, 1, 1, 3, 3, 1, 0, 3], "D"],
  ["E AI未経験・時間少・決まっていない", [4, 0, 0, 4, 4, 0, 0, 0], "E"],
  ["E 生活目的だが未経験・時間少・回答がばらつく", [0, 0, 0, 2, 3, 0, 0, 1], "E"],
  ["A 未経験でも生活目的が4問一致", [0, 0, 0, 0, 0, 0, 0, 0], "A"],
  ["C 仕事目的・経験者・使う場面は家（3/4一致）", [2, 3, 2, 2, 2, 2, 1, 0], "C"],
];
rep.forEach(([name, a, want]) => t("代表例：" + name, () => assert.strictEqual(S.decide(a).type, want, JSON.stringify(S.decide(a)))));

// ---- 境界条件 ----
t("境界：初心者E=8 vs 分野9点（4問一致）→ 分野", () => { const r = S.decide([3, 0, 0, 3, 3, 0, 0, 3]); assert.strictEqual(r.scores.D, 9); assert.strictEqual(r.scores.E, 8); assert.strictEqual(r.type, "D"); });
t("境界：初心者E=8 vs 分野7点（3問一致）→ E", () => { const r = S.decide([3, 0, 0, 3, 3, 0, 0, 0]); assert.strictEqual(r.scores.D, 7); assert.strictEqual(r.type, "E"); });
t("境界：同点 B=7 vs E=7 → Q1(B) 優先", () => { const r = S.decide([1, 0, 1, 1, 1, 0, 0, 2]); assert.strictEqual(r.scores.B, 7); assert.strictEqual(r.scores.E, 7); assert.strictEqual(r.type, "B"); assert.strictEqual(r.rule, "q1"); });
t("同点には必ず Q1 のタイプか E が含まれる（それ以外の同点処理は不要）", () => {
  results.forEach(([a, r]) => { if (r.tied.length > 1) { const q1 = Object.keys(S.QUESTIONS[0].options[a[0]].pts)[0]; assert.ok(r.tied.includes(q1) || r.tied.includes("E"), a.join()); } });
});
t("境界：同点で E が含まれ Q1 が含まれない → E", () => {
  const found = results.find(([a, r]) => r.rule === "e");
  assert.ok(found); assert.strictEqual(found[1].type, "E");
});
t("不正な回答は拒否（7問だけ・範囲外・小数）", () => {
  assert.throws(() => S.decide([0, 0, 0, 0, 0, 0, 0]));
  assert.throws(() => S.decide([0, 0, 0, 0, 0, 0, 0, 9]));
  assert.throws(() => S.decide([0.5, 0, 0, 0, 0, 0, 0, 0]));
  assert.throws(() => S.decide([0, 0, 0, 0, 0, 0, 0, null]));
});

// ---- 固定ID・再計算・ペース ----
t("全選択肢に固定IDがあり、重複しない（形式 q番号-英字）", () => {
  const ids = S.QUESTIONS.flatMap((q, i) => q.options.map(o => o.id));
  ids.forEach(id => assert.ok(/^q[1-8]-[a-z0-9]+$/.test(id), id));
  assert.strictEqual(new Set(ids).size, ids.length);
  S.QUESTIONS.forEach((q, i) => q.options.forEach(o => assert.ok(o.id.startsWith("q" + (i + 1) + "-"), o.id)));
});
t("固定IDの一覧が変わっていない（IDを変えると共有・記録が壊れるため）", () => {
  assert.strictEqual(S.QUESTIONS.map(q => q.options.map(o => o.id).join(",")).join("|"),
    "q1-life,q1-research,q1-work,q1-post,q1-unsure|q2-none,q2-chat,q2-docs,q2-built|q3-lt1h,q3-1to3h,q3-gt3h|q4-money,q4-scattered,q4-progress,q4-writing,q4-none|q5-manager,q5-stock,q5-board,q5-drafts,q5-undecided|q6-phone,q6-ok,q6-good|q7-small,q7-solid|q8-home,q8-study,q8-work,q8-sns");
});
t("全パターンで 回答番号→ID→回答番号 が元に戻る", () => {
  results.forEach(([a]) => assert.deepStrictEqual(S.fromIds(S.toIds(a)), a));
});
t("回答を変えても点数は重複加算されない（毎回回答から計算し直す）", () => {
  const a = [0, 1, 1, 0, 0, 1, 1, 0];
  const before = JSON.stringify(S.score(a));
  for (let k = 0; k < 5; k++) S.decide(a);
  const changed = a.slice(); changed[0] = 2; S.decide(changed);
  assert.strictEqual(JSON.stringify(S.score(a)), before);
  const total = s => Object.values(s).reduce((x, y) => x + y, 0);
  results.forEach(([a, r]) => {
    const expect = a.reduce((sum, x, i) => sum + Object.values(S.QUESTIONS[i].options[x].pts).reduce((p, q) => p + q, 0), 0);
    assert.strictEqual(total(r.scores), expect, a.join());
  });
});
t("ペース：準備度4以上はゆっくり、3以下は標準（タイプとは別に決まる）", () => {
  assert.strictEqual(S.pace(4).id, "slow"); assert.strictEqual(S.pace(8).id, "slow");
  assert.strictEqual(S.pace(3).id, "normal"); assert.strictEqual(S.pace(0).id, "normal");
  // 初心者でも分野がそろえば分野タイプ＋ゆっくりペース
  const r = S.decide([0, 0, 0, 0, 0, 0, 0, 0]); assert.strictEqual(r.type, "A"); assert.strictEqual(S.pace(r.readiness).id, "slow");
});

t("ペースの案内文に日付（Day ◯）を書かない（E型はDay 1、他はDay 3に制作開始のため）", () => {
  [0, 3, 4, 8].forEach(r => assert.ok(!/Day\s*\d/.test(S.pace(r).text), S.pace(r).text));
  assert.ok(S.TYPES.E.days[0].d.includes("AIへの制作指示") && S.TYPES.A.days[2].d.includes("制作指示"));
});

// ---- 原稿 ----
t("全タイプ：Day1〜7 が7つ・各日に作業と完了条件・機能・つまずき3つ・制作指示", () => {
  S.TYPE_IDS.forEach(k => {
    const T = S.TYPES[k];
    ["name", "catch", "summary", "tool", "toolDesc", "image"].forEach(f => assert.ok(T[f] && T[f].length >= 3, k + "." + f));
    assert.ok(!/人。$/.test(T.catch), k + " キャッチコピーで性格を言い切らない");
    assert.strictEqual(T.days.length, 7, k);
    T.days.forEach((d, i) => { assert.ok(d.t && d.d && d.done, k + " day" + (i + 1)); });
    assert.ok(T.features.length >= 4 && T.features.length <= 6, k + " features");
    assert.strictEqual(T.pitfalls.length, 3, k);
    const p = S.prompt(k); assert.ok(p.includes(T.tool) && p.includes("HTMLファイル1つ"), k);
  });
});
t("公開文言に、存在しない特典・未確定の表現・依頼形の誘導がない", () => {
  const all = JSON.stringify(S.TYPES) + S.FIX_PROMPT;
  ["タイプ別", "配布中", "公開予定", "近日公開", "登録してください", "プロフィールから", "稼げ", "収益化", "CRM", "/tools/"].forEach(w => assert.ok(!all.includes(w), w));
});
t("作例リンクは、リポジトリ内に実在するページだけ", () => {
  const fs = require("fs");
  S.TYPE_IDS.forEach(k => { const ex = S.TYPES[k].example; if (ex.href) assert.ok(fs.existsSync(path.join(__dirname, "../../../shindan", ex.href, "index.html")), k + " " + ex.href); });
});

console.log("\n分布:", JSON.stringify(dist), " 同点処理:", JSON.stringify(rules));
console.log("readiness>=4 の割合:", (results.filter(([, r]) => r.readiness >= 4).length / ALL.length * 100).toFixed(1) + "%");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
