// AI組織メーカー（/office/）の検証
// 使い方：リポジトリ直下で `npx http-server -p 8765 -s .` を起動し、
//   node .dev/office/tests/office.test.js http://127.0.0.1:8765/ [変更前スナップショット.json]
// 変更前スナップショットは snap 用の関数（下の takeSnap）で元のモックから作ったもの。省略時は「変更していないこと」の比較を飛ばす。
"use strict";
const { chromium } = require("playwright");
const fs = require("fs");
const ROOT = process.argv[2] || "http://127.0.0.1:8765/";
const BASE = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], "utf8")) : null;
const URL = ROOT + "office/";
const LINE_URL = "https://lin.ee/rWOrZ91";
const SHOTS = process.env.SHOTS || "/tmp/office-shots";
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const groups = {};
const ok = (group, name, cond, info) => {
  groups[group] = groups[group] || { pass: 0, fail: 0 };
  if (cond) { pass++; groups[group].pass++; console.log("PASS", `[${group}]`, name); }
  else { fail++; groups[group].fail++; console.log("FAIL", `[${group}]`, name, info !== undefined ? "→ " + JSON.stringify(info) : ""); }
};

const CASES = [
  ["家計簿アプリを作りたい", "dev"], ["Instagramの投稿を自動で作りたい", "sns"], ["毎朝のニュースを集めて要約したい", "research"],
  ["YouTube動画を作りたい", "video"], ["営業の見積書づくりを効率化したい", "work"], ["会議の議事録を自動で作りたい", "work"],
  ["メール返信を楽にしたい", "work"], ["育児のタスクを夫婦で分担したい", "family"], ["毎日の献立を考えたい", "family"],
  ["ブログ記事を書きたい", "writing"], ["noteで記事を売りたい", "writing"], ["BOOTHで商品を売るページを作りたい", "shop"],
  ["ネットショップの商品説明を書きたい", "shop"], ["売上のデータを集計してレポートにしたい", "data"], ["Threadsで発信したい", "sns"],
  ["在庫管理ツールがほしい", "dev"], ["なんか副業を始めたい", "general"],
];
const ORDER = ["dev", "sns", "research", "video", "work", "writing", "shop", "family", "data", "general"];
const OLD = ["アン", "ハル", "ミオ", "リン", "ソラ", "クロエ"];
const MAP = { "アン": "サク", "ハル": "レン", "ミオ": "ユイ", "リン": "ヒナ", "ソラ": "カイ", "クロエ": "ノア" };
const mapNames = s => s == null ? s : Object.keys(MAP).reduce((t, k) => t.split(k).join(MAP[k]), s);

const takeSnap = () => ({
  detect: detectOrg.toString(), keys: Object.keys(ORGS),
  orgs: Object.fromEntries(Object.entries(ORGS).map(([k, o]) => [k, {
    label: o.label, missions: o.missions,
    agents: o.agents.map(a => ({ role: a.role, tool: a.tool, duty: a.duty, task: a.task, color: a.color, hair: a.hair, name: a.name })),
    flow: o.flow.map(s => s.slice(0, 4)), effects: o.flow.map(s => s[4] ? s[4].toString() : null),
  }])),
  walk: [walkX.toString(), walkY.toString(), go.toString(), say.toString(), tick.toString(), playDay.toString()],
  consts: { TILE, CORRIDOR, desks, SPOTS, TIMES },
});

async function newPage(browser, vp) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
  const page = await ctx.newPage();
  const errs = [], fontFails = [];
  page.on("pageerror", e => errs.push(e.message));
  page.on("requestfailed", r => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) fontFails.push(r.url()); });
  page.on("console", m => { if (m.type() === "error" && !/fonts\.(googleapis|gstatic)/.test((m.location() || {}).url || "")) errs.push(m.text()); });
  return { ctx, page, errs, fontFails };
}

(async () => {
  const browser = await chromium.launch();

  // ===== 判定テスト・整合性・変更していないこと =====
  {
    const { ctx, page, errs } = await newPage(browser, { width: 1280, height: 900 });
    await page.goto(URL);
    const got = await page.evaluate(cs => cs.map(([t]) => detectOrg(t)), CASES);
    CASES.forEach(([t, want], i) => ok("判定", `「${t}」→ ${want}`, got[i] === want, got[i]));

    const snap = await page.evaluate(takeSnap);
    ok("固定", "組織パターンは10種・名前と順序が指定どおり", JSON.stringify(snap.keys) === JSON.stringify(ORDER), snap.keys);
    for (const k of ORDER) {
      const o = snap.orgs[k];
      ok("整合性", `${k}：ミッション数（${o.missions.length}）＝flowのステップ数（${o.flow.length}）`, o.missions.length === o.flow.length);
      ok("整合性", `${k}：flow内の社員番号が範囲内（0〜${o.agents.length - 1}）`, o.flow.every(s => Number.isInteger(s[0]) && s[0] >= 0 && s[0] < o.agents.length), o.flow.map(s => s[0]));
      ok("整合性", `${k}：行き先が studio/meeting/boss/cafe/null のいずれか`, o.flow.every(s => ["studio", "meeting", "boss", "cafe", null].includes(s[1])), o.flow.map(s => s[1]));
    }
    if (BASE) {
      ok("固定", "判定ロジック detectOrg（キーワードと優先順位）が変更前と同一", snap.detect === BASE.detect);
      ok("固定", "歩行・吹き出し・時計・上演の処理が変更前と同一", JSON.stringify(snap.walk) === JSON.stringify(BASE.walk));
      ok("固定", "机・通路・行き先・時刻の定数が変更前と同一", JSON.stringify(snap.consts) === JSON.stringify(BASE.consts));
      for (const k of ORDER) {
        const a = snap.orgs[k], b = BASE.orgs[k];
        const strip = o => ({ label: o.label, missions: o.missions, agents: o.agents.map(x => ({ ...x, name: mapNames(x.name) })), flow: o.flow.map(s => [s[0], s[1], s[2], mapNames(s[3])]) });
        ok("固定", `${k}：ラベル・ミッション・担当・色・髪色・flow が変更前と同一（社員名の付け替えのみ）`, JSON.stringify(strip(a)) === JSON.stringify(strip(b)) && JSON.stringify(a.agents.map(x => x.name)) === JSON.stringify(b.agents.map(x => mapNames(x.name))));
        const removed = b.effects.map((e, i) => e && !a.effects[i] ? i : null).filter(x => x !== null);
        ok("固定", `${k}：flow の追加処理は bump の削除だけ（${removed.length}件削除・残り0件）`, a.effects.every(e => e === null) && b.effects.every(e => e === null || /bump\(/.test(e)));
      }
    }
    ok("動作", "エラーなし（判定ページ）", errs.length === 0, errs);
    await ctx.close();
  }

  // ===== 表示チェック（ソース＋全10組織を表示した画面） =====
  {
    const { ctx, page, errs, fontFails } = await newPage(browser, { width: 1280, height: 900 });
    const res = await page.goto(URL);
    const src = await res.text();
    ok("表示", "<title> が指定どおり", (await page.title()) === "AI組織メーカー｜作りたいものを入れると、必要なAI組織が出てくる｜ウゴキラボ");
    ok("表示", "meta description が指定どおり", (await page.getAttribute('meta[name="description"]', "content")) === "作りたいものを入力すると、必要なAIの役割分担（組織の編成案）が分かります。AI社員が歩いて働く様子で流れを確認できます。");
    ok("表示", "DotGothic16 の読み込みを継続", /fonts\.googleapis\.com\/css2\?family=DotGothic16/.test(src));
    ok("表示", "ソースに「モック」がない", !src.includes("モック"));
    ok("表示", "ソースに旧社員名がない", OLD.every(n => !src.includes(n)), OLD.filter(n => src.includes(n)));
    ok("表示", "SNS数値の要素と bump がない", !/id="sns[123]"|bump\(|Threads いいね|Instagram いいね|フォロワー/.test(src));
    ok("表示", "「AIが判定」等の実態と異なる表現がない", !/AIが判定|AIが分析|AIが考え|AIが自動で判定|AI判定|ダミー/.test(src));
    ok("表示", "viewport でピンチ拡大を禁止していない", !/user-scalable\s*=\s*no|maximum-scale/.test(src));
    const texts = [];
    for (const k of ORDER) {
      await page.evaluate(k => { const org = buildOrg(k, "テスト"); }, k);
      texts.push(await page.evaluate(() => document.body.innerText));
    }
    const all = texts.join("\n");
    ok("表示", "全10組織の画面表示に旧社員名がない", OLD.every(n => !all.includes(n)), OLD.filter(n => all.includes(n)));
    ok("表示", "全10組織の画面表示に「モック」「いいね数」「フォロワー」がない", !/モック|Threads いいね|Instagram いいね|フォロワー/.test(all));
    ok("表示", "全10組織の画面に新しい社員名だけが出る", await page.evaluate(() => Object.values(ORGS).every(o => o.agents.every(a => ["サク", "レン", "ユイ", "ヒナ", "カイ", "ノア"].includes(a.name)))));
    const side = await page.textContent(".side");
    ok("表示", "左サイドバーに時計とミッションが残り、SNS数値はない", /\d\d:\d\d/.test(side) && side.includes("きょうの ミッション") && !/いいね|フォロワー/.test(side));
    const line = await page.evaluate(() => { const a = document.getElementById("lineBtn"); const r = a.getBoundingClientRect(); const org = document.querySelector(".org").getBoundingClientRect();
      return { href: a.getAttribute("href"), text: a.textContent, bg: getComputedStyle(a).backgroundColor, color: getComputedStyle(a).color, h: r.height, below: r.top > org.bottom, head: document.getElementById("line-h").textContent, target: a.target, rel: a.rel }; });
    ok("LINE", "LINEボタンのリンク先がOffice専用URL", line.href === LINE_URL, line.href);
    ok("LINE", "見出しとボタン文言が指定どおり", line.head === "無料サンプルはLINEに置いてあります。" && line.text === "LINEで受け取る", line);
    ok("LINE", "背景が /shindan/ と同じ濃い緑（#00803A）・白文字", line.bg === "rgb(0, 128, 58)" && line.color === "rgb(255, 255, 255)", line);
    ok("LINE", "編成表の下に配置・タップ領域44px以上・新しいタブで開く", line.below && line.h >= 44 && line.target === "_blank" && /noopener/.test(line.rel), line);
    const foot = await page.evaluate(() => { const f = document.querySelector(".foot"); return { text: f.innerText, href: f.querySelector("a").getAttribute("href"), link: f.querySelector("a").textContent }; });
    ok("表示", "公開用フッター（文言・../ への戻りリンク）", foot.text.includes("ウゴキラボの無料ツールです。編成案は作りたいものの種類に合わせたパターンから提案しています。") && foot.href === "../" && foot.link === "ウゴキラボのトップへ", foot);
    ok("動作", "エラーなし（表示チェック）", errs.length === 0, errs);
    if (fontFails.length) console.log("   (参考) フォントの読み込みはこの環境の通信制限で失敗:", fontFails.length, "件");
    await ctx.close();
  }

  // ===== 入力→生成→上演（PC） =====
  {
    const { ctx, page, errs } = await newPage(browser, { width: 1280, height: 900 });
    await page.goto(URL);
    await page.fill("#goal", "家計簿アプリを作りたい");
    await page.press("#goal", "Enter");
    await page.waitForFunction(() => document.getElementById("orgName").textContent.startsWith("開発チーム型"), null, { timeout: 5000 });
    ok("動作", "入力→生成：開発チーム型が表示され、編成表に5人", (await page.locator("#orgrows .orgrow").count()) === 5);
    const p0 = await page.evaluate(() => [...document.querySelectorAll(".char")].map(c => c.style.left + "," + c.style.top).join("|"));
    const t0 = Date.now();
    await page.waitForFunction(() => document.getElementById("mcount").textContent === "5/5", null, { timeout: 90000 });
    ok("動作", `上演：ミッションが 5/5 まで進む（${Math.round((Date.now() - t0) / 1000)}秒）`, true);
    ok("動作", "上演中に社員が歩き、時計が進む", await page.evaluate(p0 => [...document.querySelectorAll(".char")].map(c => c.style.left + "," + c.style.top).join("|") !== p0 || document.getElementById("clock").textContent !== "09:00", p0));
    ok("動作", "上演の最後のセリフが新しい社員名", (await page.textContent("#dialog")).includes("ヒナは") || (await page.textContent("#dialog")).includes("ミッションは 全部できた"));
    // 例ボタンで別の組織に切り替え
    await page.click('[data-ex="育児のタスクを夫婦で分担したい"]');
    await page.waitForFunction(() => document.getElementById("orgName").textContent.startsWith("生活サポート型"), null, { timeout: 5000 });
    ok("動作", "例ボタンで生活サポート型に切り替わる", true);
    ok("動作", "エラーなし（上演）", errs.length === 0, errs);
    await page.screenshot({ path: `${SHOTS}/PC-1280.png`, fullPage: true });
    await ctx.close();
  }

  // ===== PC表示が変更前と同じ（1180px以上は縮小しない） =====
  for (const w of [1180, 1280]) {
    const geo = async url => {
      const { ctx, page } = await newPage(browser, { width: w, height: 900 });
      await page.goto(url);
      // 舞台（.stage）の左上を基準にした位置と大きさで比べる（下にLINE・フッターを足したため、縦の中央寄せで舞台全体の上端だけは動きうる）
      const g = await page.evaluate(() => { const st = document.querySelector(".stage").getBoundingClientRect();
        return Object.fromEntries([".stage", ".builder", ".side", ".office", ".rooms", ".floor", ".dialog", ".org"].map(s => {
          const r = document.querySelector(s).getBoundingClientRect();
          return [s, s === ".stage" ? [Math.round(r.left), Math.round(r.width), Math.round(r.height)] : [Math.round(r.left - st.left), Math.round(r.top - st.top), Math.round(r.width), Math.round(r.height)]]; })); });
      g.stageTop = await page.evaluate(() => Math.round(document.querySelector(".stage").getBoundingClientRect().top));
      const t = await page.evaluate(() => (document.querySelector(".wrap") || {}).style ? document.querySelector(".wrap").style.transform : "");
      await ctx.close(); return { g, t };
    };
    const now = await geo(URL);
    ok("PC", `${w}px：舞台を縮小しない`, now.t === "", now.t);
    if (process.argv[4]) {
      const before = await geo(process.argv[4]);
      const { stageTop: a, ...ng } = now.g, { stageTop: b, ...bg } = before.g;
      ok("PC", `${w}px：舞台の幅・位置と、入力欄・サイドバー・オフィス・会話・編成表の配置と大きさが変更前と同じ`, JSON.stringify(ng) === JSON.stringify(bg), { now: ng, before: bg });
      console.log(`   (参考) ${w}px：舞台全体の上端 変更前 ${b}px → 変更後 ${a}px（下にLINE・フッターを足したため）`);
    }
  }

  // ===== スマホ・タブレット：舞台だけ縮小 =====
  for (const vp of [{ width: 320, height: 640, mobile: true }, { width: 375, height: 740, mobile: true }, { width: 768, height: 1024, mobile: true }]) {
    const { ctx, page, errs } = await newPage(browser, vp);
    await page.goto(URL);
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const wrap = document.getElementById("wrap"), sc = document.getElementById("scaler");
      const k = parseFloat((wrap.style.transform.match(/scale\(([\d.]+)\)/) || [])[1] || "1");
      const sr = sc.getBoundingClientRect(), wr = wrap.getBoundingClientRect(), dr = document.querySelector(".dialog").getBoundingClientRect();
      const notScaled = s => { const e = document.querySelector(s); return Math.abs(e.getBoundingClientRect().width - e.offsetWidth) < 1; };
      return {
        k, hscroll: document.documentElement.scrollWidth - window.innerWidth,
        wrapFits: wr.right <= sr.right + 1 && wr.left >= sr.left - 1,
        heightOk: Math.abs(sr.height - Math.ceil(wrap.offsetHeight * k)) <= 1 && Math.abs(wr.height - sr.height) <= 1.5,
        dialogRightAfter: Math.abs(dr.top - sr.bottom) <= 1,
        unscaled: notScaled(".builder") && notScaled(".dialog") && notScaled(".org"),
        inputFont: getComputedStyle(document.getElementById("goal")).fontSize,
        dialogFont: getComputedStyle(document.querySelector(".dialog")).fontSize,
        orgFont: getComputedStyle(document.querySelector(".orgrow")).fontSize,
        stageInside: !document.querySelector(".builder").closest("#scaler") && !document.querySelector(".org").closest("#scaler"),
      };
    });
    const P = vp.width + "px";
    ok("スマホ", `${P}：舞台だけを縮小（倍率 ${m.k.toFixed(3)}）`, m.k < 1 && m.k > 0.2 && m.wrapFits && m.stageInside, m);
    ok("スマホ", `${P}：縮小後の高さ分だけ余白を確保（下の会話ウィンドウと重ならず、すき間もない）`, m.heightOk && m.dialogRightAfter, m);
    ok("スマホ", `${P}：入力欄・会話・編成表は等倍（入力16px・会話16px・編成表13px）`, m.unscaled && m.inputFont === "16px" && m.dialogFont === "16px" && m.orgFont === "13px", m);
    ok("スマホ", `${P}：横スクロールが出ない`, m.hscroll <= 0, m.hscroll);
    await page.click('[data-ex="YouTube動画を作りたい"]');
    await page.waitForFunction(() => document.getElementById("orgName").textContent.startsWith("映像チーム型"), null, { timeout: 5000 });
    await page.waitForTimeout(2500);
    ok("スマホ", `${P}：入力→生成→上演が動く（社員が舞台の中を歩く）`, await page.evaluate(() => [...document.querySelectorAll(".char")].length === 5));
    ok("スマホ", `${P}：エラーなし`, errs.length === 0, errs);
    await page.screenshot({ path: `${SHOTS}/SP-${vp.width}.png`, fullPage: true });
    await ctx.close();
  }

  // ===== ハブ =====
  for (const w of [375, 1280]) {
    const { ctx, page, errs } = await newPage(browser, { width: w, height: 800 });
    await page.goto(ROOT);
    const rows = await page.$$eval(".tools .row", rs => rs.map(r => [r.getAttribute("href"), r.querySelector("b").textContent, r.querySelector(".chip").textContent, (r.querySelector("span") || {}).textContent]));
    const i = rows.findIndex(r => r[0] === "office/");
    ok("ハブ", `${w}px：AI組織メーカーの行が診断の行の直後にある`, i > 0 && rows[i - 1][0] === "shindan/", rows.map(r => r[1]));
    ok("ハブ", `${w}px：行のタイトル・説明・チップが指定どおり`, i >= 0 && rows[i][1] === "AI組織メーカー" && rows[i][2] === "公開中" && rows[i][3] === "作りたいものを入れるだけで、必要なAI組織の編成案が出てきます。社員が歩いて働く様子も見られます。", rows[i]);
    await page.click('.tools a[href="office/"]');
    await page.waitForLoadState();
    ok("ハブ", `${w}px：行のリンクで /office/ が開く`, page.url().endsWith("/office/") && (await page.title()).startsWith("AI組織メーカー"), page.url());
    ok("ハブ", `${w}px：エラーなし`, errs.length === 0, errs);
    await ctx.close();
  }

  await browser.close();
  console.log("\n項目別：", Object.entries(groups).map(([g, v]) => `${g} ${v.pass}/${v.pass + v.fail}`).join("、"));
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
