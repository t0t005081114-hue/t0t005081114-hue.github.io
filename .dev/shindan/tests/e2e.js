// 診断ページのブラウザ検証
// 使い方：リポジトリ直下で `npx http-server -p 8765 -s` などを起動し、
//   node .dev/shindan/tests/e2e.js http://127.0.0.1:8765/shindan/ [axe.min.js のパス]
"use strict";
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const S = require(path.join(__dirname, "../../../shindan/diagnosis.js"));
const URL = process.argv[2] || "http://127.0.0.1:8765/shindan/";
const AXE = process.argv[3];
const SHOTS = process.env.SHOTS || "/tmp/shindan-shots";
fs.mkdirSync(SHOTS, { recursive: true });
const ORIGIN = new globalThis.URL(URL).origin;

let pass = 0, fail = 0;
const ok = (name, cond, info) => { if (cond) { pass++; console.log("PASS", name); } else { fail++; console.log("FAIL", name, info !== undefined ? "→ " + JSON.stringify(info) : ""); } };

const REP = { A: [0, 1, 1, 0, 0, 1, 1, 0], B: [1, 3, 2, 1, 1, 2, 1, 1], C: [2, 2, 2, 2, 2, 1, 1, 2], D: [3, 1, 1, 3, 3, 1, 0, 3], E: [4, 0, 0, 4, 4, 0, 0, 0] };

async function answerAll(page, pattern) {
  for (let i = 0; i < pattern.length; i++) {
    await page.waitForFunction(n => window.__shindan.step === n, i);
    await page.locator(`#opts label.opt >> nth=${pattern[i]}`).click();
  }
  await page.waitForSelector("#s-result:not([hidden])", { timeout: 5000 });
}

(async () => {
  const browser = await chromium.launch();
  for (const vp of [{ n: "SP", width: 375, height: 740, mobile: true }, { n: "SP-S", width: 320, height: 640, mobile: true }, { n: "TAB", width: 768, height: 1024, mobile: true }, { n: "PC", width: 1280, height: 860 }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
    const page = await ctx.newPage();
    const errs = [], ext = [];
    page.on("pageerror", e => errs.push(e.message));
    page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errs.push(m.type() + ": " + m.text()); });
    page.on("request", r => { if (!r.url().startsWith(ORIGIN) && !r.url().startsWith("data:")) ext.push(r.url()); });
    const P = vp.n;
    await page.goto(URL);
    ok(`${P} 導入画面が表示`, await page.isVisible("#s-intro"));
    const intro = await page.textContent("#s-intro");
    ok(`${P} 開始画面に「8問・約1分」「無料・登録不要」「分かること」「開始ボタン」`, intro.includes("全8問・約1分") && intro.includes("無料・登録不要") && intro.includes("最初に作る1つのツール") && intro.includes("Day 1〜Day 7") && await page.isVisible("#start"));
    await page.screenshot({ path: `${SHOTS}/${P}-intro.png`, fullPage: true });

    // 開始 → Q1
    await page.click("#start");
    ok(`${P} Q1が表示され見出しにフォーカス`, await page.evaluate(() => document.activeElement.id === "qtext" && document.getElementById("qnum").textContent === "Q1"));
    ok(`${P} 未回答では「次へ」が無効`, await page.isDisabled("#next"));
    await page.evaluate(() => document.getElementById("qform").requestSubmit());
    ok(`${P} 未回答で送信しても進まない`, await page.evaluate(() => window.__shindan.step) === 0);
    await page.screenshot({ path: `${SHOTS}/${P}-q1.png` });

    // 戻る（Q1）→ 導入へ
    await page.click("#back");
    ok(`${P} Q1で戻ると導入画面`, await page.isVisible("#s-intro"));
    await page.click("#start");

    // 回答 → 自動で次へ・戻ると回答保持・変更が判定に反映
    await page.locator("#opts label.opt >> nth=2").click();
    await page.waitForFunction(() => window.__shindan.step === 1);
    ok(`${P} 選ぶと自動でQ2へ`, true);
    ok(`${P} 進捗表示 2 / 8`, (await page.textContent("#count")).replace(/\s/g, "") === "質問2/8");
    await page.locator("#opts label.opt >> nth=1").click();
    await page.waitForFunction(() => window.__shindan.step === 2);
    await page.click("#back");
    ok(`${P} 戻るとQ2の回答（2番目）が選択済み`, await page.isChecked("#o1"));
    ok(`${P} 戻った画面では「次へ」が有効`, await page.isEnabled("#next"));
    await page.click("#back");
    ok(`${P} Q1の回答（3番目）も保持`, await page.isChecked("#o2"));
    // キーボード：矢印で変更しても自動では進まない／Enterで進む
    await page.focus("#o2");
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(500);
    ok(`${P} 矢印キーで選び直しても勝手に進まない`, await page.evaluate(() => window.__shindan.step) === 0);
    ok(`${P} 矢印キーの変更が回答に反映`, (await page.evaluate(() => window.__shindan.answers[0])) === 3);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__shindan.step === 1);
    ok(`${P} Enterで次へ`, true);
    ok(`${P} 前の回答（Q2）は保持されたまま`, await page.isChecked("#o1"));
    // 同じ選択肢を再タップしても進める
    await page.locator("#opts label.opt >> nth=1").click();
    await page.waitForFunction(() => window.__shindan.step === 2);
    ok(`${P} 選択済みの選択肢を再タップしても次へ`, true);
    // 残りを回答（Q1は変更後の3 = D）
    const pat = [3, 1, 1, 3, 3, 1, 0, 3];
    for (let i = 2; i < 8; i++) {
      await page.waitForFunction(n => window.__shindan.step === n, i);
      if (i === 7) ok(`${P} 最後の質問のボタンは「結果を見る」`, (await page.textContent("#next")) === "結果を見る");
      await page.locator(`#opts label.opt >> nth=${pat[i]}`).click();
    }
    await page.waitForSelector("#s-result:not([hidden])");
    const got = await page.evaluate(() => window.__shindan.result.type);
    ok(`${P} 回答変更後の判定がロジックと一致（${got}）`, got === S.decide(pat).type && got === "D", got);
    ok(`${P} 画面の回答とロジックへ渡した回答が一致`, JSON.stringify(await page.evaluate(() => window.__shindan.answers)) === JSON.stringify(pat));

    // 5タイプすべて
    for (const t of S.TYPE_IDS) {
      await page.click("#retry");
      ok(`${P}[${t}] 再診断で回答がリセット`, await page.evaluate(() => window.__shindan.answers.every(a => a === null) && window.__shindan.step === 0));
      await answerAll(page, REP[t]);
      await page.waitForTimeout(150);
      const info = await page.evaluate(() => ({
        type: window.__shindan.result.type, h: document.getElementById("res-h").textContent,
        focus: document.activeElement.id,
        days: [...document.querySelectorAll("#res-days .day")].map(d => ({ t: d.querySelector("h3").textContent, ok: d.querySelector(".ok").textContent })),
        feat: document.querySelectorAll("#res-feat li").length, reasons: document.querySelectorAll("#res-reasons li").length,
        prompt: document.getElementById("res-prompt").textContent, mock: document.querySelectorAll("#res-mock .mr").length,
        pits: document.querySelectorAll("#res-pits .pit").length, bars: document.querySelectorAll("#res-bars .row").length,
        line: document.getElementById("line-btn").href, x: document.getElementById("share-x").href, th: document.getElementById("share-th").href,
        hscroll: document.documentElement.scrollWidth - window.innerWidth,
        exLinks: [...document.querySelectorAll("#res-ex-link a")].map(a => a.getAttribute("href")),
        heroTool: document.getElementById("res-hero-tool").textContent,
        pace: document.getElementById("res-pace").dataset.pace, paceText: document.getElementById("res-pace").textContent,
        order: [...document.querySelectorAll("#s-result [data-sec]")].map(e => e.dataset.sec).join(","),
        heroToolSize: parseFloat(getComputedStyle(document.getElementById("res-hero-tool")).fontSize),
        heroToolTop: document.getElementById("res-hero-tool").getBoundingClientRect().top + scrollY,
        daysTop: document.getElementById("res-days").getBoundingClientRect().top + scrollY,
      }));
      ok(`${P}[${t}] 判定タイプ`, info.type === t, info.type);
      ok(`${P}[${t}] 結果見出しにフォーカス`, info.focus === "res-h");
      ok(`${P}[${t}] Day1〜7 が7件・各日に完了条件`, info.days.length === 7 && info.days.every((d, i) => d.t.startsWith("Day " + (i + 1)) && d.ok.length > 3), info.days.length);
      ok(`${P}[${t}] 機能・理由・制作指示・完成イメージ・つまずき・点数バー`, info.feat >= 4 && info.reasons >= 1 && info.prompt.includes(S.TYPES[t].tool) && info.mock === 3 && info.pits === 3 && info.bars === 5, info);
      ok(`${P}[${t}] LINE / X / Threads のリンク形式`, info.line === "https://lin.ee/wvWY1Xo" && info.x.startsWith("https://x.com/intent/tweet?text=") && info.th.startsWith("https://www.threads.net/intent/post?text="));
      ok(`${P}[${t}] 横スクロールが出ない`, info.hscroll <= 0, info.hscroll);
      ok(`${P}[${t}] 結果の並び順（理由→作るもの→完成形→7日間→制作指示→LINE→共有→再診断）`, info.order === "reason,tool,image,days,prompt,line,share,again", info.order);
      ok(`${P}[${t}] 最初に作るものを冒頭に大きく表示（7日間より上・22px以上）`, info.heroTool === S.TYPES[t].tool && info.heroToolSize >= 22 && info.heroToolTop < info.daysTop, [info.heroTool, info.heroToolSize]);
      ok(`${P}[${t}] ペースの案内（準備度に応じて）`, info.pace === S.pace(S.decide(REP[t]).readiness).id && info.paceText.length > 10, info.pace);
      for (const href of info.exLinks) ok(`${P}[${t}] 作例リンク ${href} が実在`, fs.existsSync(path.join(__dirname, "../../../shindan", href, "index.html")));
      // 全セクションをスクロールして表示 → スクリーンショット
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 300) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 30)); } });
      await page.waitForTimeout(700);
      ok(`${P}[${t}] スクロール後に全セクションが表示状態`, await page.evaluate(() => [...document.querySelectorAll("#s-result .fade")].every(e => e.classList.contains("in"))));
      if (P !== "SP-S" || t === "A") await page.screenshot({ path: `${SHOTS}/${P}-result-${t}.png`, fullPage: true });
    }

    // コピー（通常）
    await page.click("#copy-share");
    await page.waitForTimeout(200);
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(e => "ERR " + e.message));
    ok(`${P} 結果の文章とURLをコピー`, clip.includes("【E まず1作型】") && clip.includes("https://t0t005081114-hue.github.io/shindan/"), clip);
    await page.click("#copy-prompt");
    await page.waitForTimeout(200);
    ok(`${P} 制作指示をコピー`, (await page.evaluate(() => navigator.clipboard.readText())).startsWith("あなたはWeb制作の先生です"));
    ok(`${P} コピー完了のお知らせ表示`, (await page.textContent("#toast")).includes("コピーしました"));
    ok(`${P} コピーボタン自体も「コピーしました ✓」に変わる`, (await page.textContent("#copy-prompt")).includes("コピーしました"));
    await page.waitForTimeout(2200);
    ok(`${P} 2秒後にボタンの文字が元に戻る`, (await page.textContent("#copy-prompt")) === "制作指示をコピー");
    // コピー（共有もクリップボードも使えない環境）
    await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true }); document.execCommand = () => false; });
    await page.click("#copy-share");
    await page.waitForTimeout(150);
    ok(`${P} コピー不可の環境では手動コピー欄を表示`, await page.isVisible("#manual-text") && (await page.inputValue("#manual-text")).includes("shindan/"));
    ok(`${P} navigator.share が無い環境では「ほかのアプリ」ボタン非表示`, await page.evaluate(() => typeof navigator.share === "function") || await page.isHidden("#share-native"));

    // すべてのリンク
    const links = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map(a => a.getAttribute("href")));
    const allowedExt = [/^https:\/\/lin\.ee\/wvWY1Xo$/, /^https:\/\/x\.com\/intent\/tweet\?/, /^https:\/\/www\.threads\.net\/intent\/post\?/];
    const bad = links.filter(h => /^https?:/.test(h) ? !allowedExt.some(r => r.test(h)) : !fs.existsSync(path.join(__dirname, "../../../shindan", h.split("#")[0], h.endsWith("/") ? "index.html" : "")));
    ok(`${P} リンク切れ・想定外の外部リンクがない`, bad.length === 0 && !links.includes("#"), bad);

    // アクセシビリティ（axe-core）
    if (AXE) {
      await page.evaluate(fs.readFileSync(AXE, "utf8")).catch(e => errs.push("axe inject: " + e.message));
      const hasAxe = await page.evaluate(() => typeof window.axe === "object");
      if (hasAxe) {
        await page.evaluate(() => { document.querySelectorAll(".fade").forEach(e => e.classList.add("in")); });
        await page.waitForTimeout(600);
        const res = await page.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] }).then(r => r.violations.map(v => v.id + "(" + v.nodes.length + "): " + v.nodes.slice(0, 2).map(n => n.target.join(" ")).join(" | "))));
        ok(`${P} axe：結果画面の違反なし`, res.length === 0, res);
        await page.click("#retry");
        const res2 = await page.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] }).then(r => r.violations.map(v => v.id + ": " + v.nodes.slice(0, 2).map(n => n.target.join(" ")).join(" | "))));
        ok(`${P} axe：質問画面の違反なし`, res2.length === 0, res2);
      } else ok(`${P} axe を読み込めた`, false, "CSP などで読み込めず");
    }

    ok(`${P} 外部への通信が0件`, ext.length === 0, ext);
    ok(`${P} コンソールエラー・警告なし`, errs.filter(e => !e.startsWith("axe inject")).length === 0, errs);
    await ctx.close();
  }

  // 動きを減らす設定
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", e => errs.push(e.message));
    await page.goto(URL);
    await page.click("#start");
    const t0 = Date.now();
    await answerAll(page, REP.A);
    ok("RM 動きを減らす設定：集計の待ち時間を省略して結果へ", await page.isVisible("#s-result"));
    ok("RM 全セクションがすぐ表示（スクロール不要）", await page.evaluate(() => [...document.querySelectorAll("#s-result .fade")].every(e => getComputedStyle(e).opacity === "1")));
    ok("RM 紙吹雪の演出なし", await page.evaluate(() => document.querySelectorAll("#burst i").length === 0));
    ok("RM エラーなし", errs.length === 0, errs);
    console.log("   (RM 8問の操作〜結果: " + (Date.now() - t0) + "ms)");
    await ctx.close();
  }

  // コピー表示のリセット（再診断・結果切替・遅れて完了するコピー）
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, reducedMotion: "reduce" });
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", e => errs.push(e.message)); page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
    await page.goto(URL); await page.click("#start");
    await answerAll(page, REP.E);
    const label = id => page.textContent(id);
    // 連続コピー：最後の成功から約2秒で戻る
    await page.click("#copy-prompt"); await page.waitForTimeout(1000);
    await page.click("#copy-prompt"); await page.waitForTimeout(1500);
    ok("CP 連続コピー：2回目から1.5秒後はまだ「コピーしました ✓」", (await label("#copy-prompt")).includes("コピーしました"));
    await page.waitForTimeout(800);
    ok("CP 連続コピー：2回目から約2秒後に元の文字・色に戻る", (await label("#copy-prompt")) === "制作指示をコピー" && !(await page.getAttribute("#copy-prompt", "class")).includes("done"));
    // コピー直後（2秒以内）に再診断して結果まで進む
    await page.click("#copy-prompt"); await page.click("#copy-share"); await page.waitForTimeout(150);
    ok("CP 前提：コピー成功表示が出ている", (await label("#copy-share")).includes("コピーしました"));
    const t0 = Date.now();
    await page.click("#retry"); await answerAll(page, REP.A);
    const fresh = async () => page.evaluate(() => ({
      p: document.getElementById("copy-prompt").textContent, f: document.getElementById("copy-fix").textContent, s: document.getElementById("copy-share").textContent,
      done: document.querySelectorAll("#s-result .btn.done").length, copied: document.getElementById("copied").textContent,
      manual: !document.getElementById("manual").hidden, toast: document.getElementById("toast").classList.contains("show"), type: window.__shindan.result.type }));
    let st = await fresh();
    ok(`CP コピー後${Date.now() - t0}msで再診断完了：新しい結果に成功表示が残らない`, st.type === "A" && st.p === "制作指示をコピー" && st.f === "この文をコピー" && st.s === "結果の文章とURLをコピー" && st.done === 0 && st.copied === "" && !st.manual && !st.toast, st);
    ok("CP 前提：再診断は2秒以内に完了", Date.now() - t0 < 2000, Date.now() - t0);
    // 遅れて完了するコピー（成功）：結果切替後に完了しても新しい画面を変えない
    await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => new Promise(r => setTimeout(r, 2500)) } }); });
    await page.click("#copy-prompt"); await page.click("#copy-share");
    await page.click("#retry"); await answerAll(page, REP.C);
    await page.waitForTimeout(3000);
    st = await fresh();
    ok("CP 遅れて成功したコピーは、切替後の画面に成功表示を出さない", st.type === "C" && st.done === 0 && st.copied === "" && !st.toast && st.p === "制作指示をコピー" && st.s === "結果の文章とURLをコピー", st);
    // 遅れて失敗したコピー：切替後の画面に手動コピー欄を出さない
    await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => new Promise((_, j) => setTimeout(() => j(new Error("x")), 2500)) } }); document.execCommand = () => false; });
    await page.click("#copy-share"); await page.click("#copy-prompt");
    await page.click("#retry"); await answerAll(page, REP.D);
    await page.waitForTimeout(3000);
    st = await fresh();
    ok("CP 遅れて失敗したコピーは、切替後の画面に手動コピー欄やお知らせを出さない", st.type === "D" && !st.manual && !st.toast && st.copied === "", st);
    // 同じ画面での失敗は、従来どおり手動コピー欄が使える
    await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined }); });
    await page.click("#copy-share"); await page.waitForTimeout(200);
    ok("CP コピー失敗時は手動コピー欄が出て、今の結果の文章が入る", await page.isVisible("#manual-text") && (await page.inputValue("#manual-text")).includes("【D 発信・コンテンツ型】"));
    await page.click("#copy-prompt"); await page.waitForTimeout(200);
    ok("CP 制作指示のコピー失敗時は本文が選択され、案内が出る", (await page.evaluate(() => window.getSelection().toString())).startsWith("あなたはWeb制作の先生です") && (await page.textContent("#toast")).includes("自動でコピーできませんでした"));
    // ペース案内と計画の整合（E型：ゆっくりペース）
    await page.click("#retry"); await answerAll(page, REP.E);
    const paceText = await page.textContent("#res-pace");
    ok("CP E型のゆっくりペース案内に日付がなく、Day 1 で制作指示を使う計画と矛盾しない", !/Day\s*\d/.test(paceText) && paceText.includes("画面が動くところまで") && (await page.textContent("#res-days .day:first-child")).includes("AIへの制作指示"), paceText);
    ok("CP エラーなし", errs.length === 0, errs);
    await ctx.close();
  }

  // 1分以内に終わるか（通常設定・自動で次へ）
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(URL);
    const t0 = Date.now();
    await page.click("#start");
    await answerAll(page, REP.C);
    const ms = Date.now() - t0;
    ok(`タップ操作だけで結果まで到達（待ち時間の合計 ${ms}ms、人の読む時間は含まない）`, ms < 10000, ms);
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
