/* ウゴキラボ｜AIでまず何を作るか診断 — 画面の動作
 * 外部への通信は一切しない（CSP の connect-src 'none' でも禁止）。
 * 外部サイトが開くのは、利用者が LINE / X / Threads のボタンを押したときだけ。
 */
(function () {
  "use strict";
  var S = window.Shindan;

  // 診断専用の友だち追加URL（LINE公式アカウント側で診断経由の追加を区別するため）
  var LINE_URL = "https://lin.ee/wvWY1Xo";
  var PAGE_URL = "https://t0t005081114-hue.github.io/shindan/";
  var TYPE_COLOR = { A: "--tA", B: "--tB", C: "--tC", D: "--tD", E: "--tE" };

  var $ = function (id) { return document.getElementById(id); };
  var reduce = function () { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; };
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "text") el.textContent = attrs[k];
      else if (k === "cls") el.className = attrs[k];
      else el.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c != null) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  var N = S.QUESTIONS.length;
  var answers = new Array(N).fill(null);
  var step = 0;
  var advTimer = null, lastPointer = 0, result = null;

  /* ---------- 画面切り替え ---------- */
  function show(id, focusEl) {
    ["s-intro", "s-quiz", "s-calc", "s-result"].forEach(function (s) { $(s).hidden = s !== id; });
    window.scrollTo(0, 0);
    if (focusEl) focusEl.focus({ preventScroll: true });
  }

  /* ---------- 導入 ---------- */
  S.TYPE_IDS.forEach(function (t) {
    $("peek").appendChild(h("li", null, [h("span", { cls: "tl tl-" + t, text: t, "aria-hidden": "true" }), S.TYPES[t].name]));
  });
  $("start").addEventListener("click", function () { step = 0; renderQ(0); show("s-quiz", $("qtext")); });

  /* ---------- 質問 ---------- */
  var dots = $("dots");
  for (var i = 0; i < N; i++) dots.appendChild(h("span"));

  function renderQ(dir) {
    var q = S.QUESTIONS[step];
    $("qnum").textContent = "Q" + (step + 1);
    $("qlabel").textContent = q.text;
    var opts = clear($("opts"));
    q.options.forEach(function (o, i) {
      var input = h("input", { type: "radio", name: "q", value: String(i), id: "o" + i });
      if (answers[step] === i) input.checked = true;
      opts.appendChild(h("label", { cls: "opt", "for": "o" + i }, [input, h("span", { cls: "rd", "aria-hidden": "true" }), h("span", { text: o.label })]));
    });
    updateNav();
    clear($("count")).appendChild(document.createTextNode(String(step + 1)));
    $("count").appendChild(h("small", { text: " / " + N }));
    $("bar").setAttribute("aria-valuenow", String(step + 1));
    $("bar").setAttribute("aria-valuetext", N + "問中" + (step + 1) + "問目");
    $("bar").firstElementChild.style.width = (step / N * 100) + "%";
    Array.prototype.forEach.call(dots.children, function (d, i) {
      d.className = (i < step ? "on" : "") + (i === step ? " now" : "");
    });
    $("back").setAttribute("aria-label", step === 0 ? "最初の画面に戻る" : "前の質問に戻る");
    var fs = $("qfs");
    fs.classList.remove("enter", "enter-back");
    if (dir) { void fs.offsetWidth; fs.classList.add(dir > 0 ? "enter" : "enter-back"); }
    $("live").textContent = N + "問中" + (step + 1) + "問目";
  }
  function updateNav() {
    var answered = answers[step] !== null;
    $("next").disabled = !answered;
    $("next").textContent = step === N - 1 ? "結果を見る" : "次へ";
    $("hint").textContent = answered ? " " : "選ぶと次へ進みます";
  }
  function goNext() {
    clearTimeout(advTimer); advTimer = null;
    if (answers[step] === null) return; // 未回答では進めない
    if (step < N - 1) { step++; renderQ(1); $("qtext").focus({ preventScroll: true }); window.scrollTo(0, 0); }
    else finish();
  }
  function goBack() {
    clearTimeout(advTimer); advTimer = null;
    if (step === 0) { show("s-intro", $("start")); return; }
    step--; renderQ(-1); $("qtext").focus({ preventScroll: true }); window.scrollTo(0, 0);
  }
  var opts = $("opts");
  var pointerOpt = null;
  opts.addEventListener("pointerdown", function (e) {
    var lb = e.target.closest ? e.target.closest("label.opt") : null;
    lastPointer = Date.now(); pointerOpt = lb ? lb.getAttribute("for") : null;
  });
  opts.addEventListener("change", function (e) {
    if (e.target.name !== "q") return;
    answers[step] = Number(e.target.value);
    updateNav();
  });
  // 指やマウスで選んだときだけ自動で次へ（キーボードの矢印移動では進まない）
  opts.addEventListener("click", function (e) {
    // 直前に「その選択肢」を指やマウスで押したときだけ（矢印キーで選んだ時は進まない）
    if (e.target.name !== "q" || advTimer || pointerOpt !== e.target.id || Date.now() - lastPointer > 1500) return;
    pointerOpt = null;
    answers[step] = Number(e.target.value);
    updateNav();
    advTimer = setTimeout(goNext, reduce() ? 80 : 280);
  });
  opts.addEventListener("keydown", function (e) {
    pointerOpt = null; lastPointer = 0;
    if (e.key === "Enter" && e.target.name === "q") { e.preventDefault(); goNext(); }
  });
  $("qform").addEventListener("submit", function (e) { e.preventDefault(); goNext(); });
  $("back").addEventListener("click", goBack);

  /* ---------- 集計 ---------- */
  function finish() {
    if (!S.validate(answers)) { // 念のため：未回答があれば最初の未回答へ
      step = answers.indexOf(null); renderQ(0); show("s-quiz", $("qtext")); return;
    }
    result = S.decide(answers);
    $("bar").firstElementChild.style.width = "100%";
    if (reduce()) { renderResult(); return; }
    show("s-calc");
    setTimeout(renderResult, 900);
  }

  /* ---------- 結果 ---------- */
  function renderResult() {
    var r = result, id = r.type, T = S.TYPES[id];
    $("s-result").style.setProperty("--tc", "var(" + TYPE_COLOR[id] + ")");
    $("res-badge").textContent = id;
    clear($("res-h")).appendChild(h("span", { cls: "sr", text: id + " " }));
    $("res-h").appendChild(document.createTextNode(T.name));
    $("res-catch").textContent = T.catch;
    $("res-summary").textContent = T.summary;

    // 判定理由
    var ul = clear($("res-reasons"));
    S.reasons(answers, id).forEach(function (t) { ul.appendChild(h("li", { text: "「" + t + "」と答えた" })); });
    var why = "8問の答えをタイプごとの点数にして、いちばん点が高かったタイプです。";
    if (r.rule === "q1") why = "ほかのタイプと同じ点数でしたが、Q1で選んだ「いちばん楽にしたいこと」を優先しました。";
    if (r.rule === "e") why = "ほかのタイプと同じ点数でしたが、最初は小さく始めるほうが続きやすいため「まず1作型」を優先しました。";
    $("res-why").textContent = why;
    var pace = $("res-pace");
    pace.hidden = !(r.readiness >= 4 && id !== "E");
    if (!pace.hidden) {
      clear(pace).appendChild(h("b", { text: "ゆっくりペースでOK：" }));
      pace.appendChild(document.createTextNode("AIの経験や使える時間の答えから、1日15分ずつ進めるのがおすすめです。Day 3（AIに作ってもらう）まで進めば、もう大きな一歩です。"));
    }
    var bars = clear($("res-bars"));
    var max = Math.max(1, Math.max.apply(null, S.TYPE_IDS.map(function (t) { return r.scores[t]; })));
    S.TYPE_IDS.forEach(function (t) {
      var fill = h("i");
      fill.dataset.w = (r.scores[t] / max * 100) + "%";
      bars.appendChild(h("div", { cls: "row" + (t === id ? " win" : ""), role: "listitem", "aria-label": t + " " + S.TYPES[t].name + "：" + r.scores[t] + "点" + (t === id ? "（あなたのタイプ）" : "") }, [
        h("span", { cls: "nm", "aria-hidden": "true" }, [h("span", { cls: "tl tl-" + t, text: t }), S.TYPES[t].name]),
        h("span", { cls: "tr", "aria-hidden": "true" }, [fill]),
        h("span", { cls: "pt", text: String(r.scores[t]), "aria-hidden": "true" })
      ]));
    });

    // 最初に作るもの
    $("res-tool").textContent = T.tool;
    $("res-tooldesc").textContent = T.toolDesc;
    var mock = clear($("res-mock")), scr = h("div", { cls: "scr" });
    scr.appendChild(h("div", { cls: "mt", text: T.mock.title }));
    T.mock.rows.forEach(function (row) { scr.appendChild(h("div", { cls: "mr" }, [h("span", { text: row[0] }), h("span", { text: row[1] })])); });
    scr.appendChild(h("div", { cls: "mb", text: T.mock.btn }));
    mock.appendChild(scr);
    $("res-image").textContent = T.image;
    var feat = clear($("res-feat"));
    T.features.forEach(function (f) { feat.appendChild(h("li", { text: f })); });

    // 7日間
    var days = clear($("res-days"));
    T.days.forEach(function (d, i) {
      days.appendChild(h("li", { cls: "day" }, [
        h("div", { cls: "dn", "aria-hidden": "true" }, [h("small", { text: "DAY" }), h("b", { text: String(i + 1) })]),
        h("div", null, [h("h3", null, [h("span", { cls: "sr", text: "Day " + (i + 1) + "：" }), d.t]), h("p", { text: d.d }), h("p", { cls: "ok", text: d.done })])
      ]));
    });

    // 制作指示・つまずき・作例・次
    $("res-prompt").textContent = S.prompt(id);
    $("res-fix").textContent = S.FIX_PROMPT;
    var pits = clear($("res-pits"));
    T.pitfalls.forEach(function (p) { pits.appendChild(h("div", { cls: "pit" }, [h("b", { text: p[0] }), h("p", { text: p[1] })])); });
    $("res-ex").textContent = T.example.text;
    var exl = clear($("res-ex-link"));
    if (T.example.href) exl.appendChild(h("a", { href: T.example.href, text: T.example.label + " →" }));
    var nx = S.TYPES[r.next];
    $("res-next-tl").hidden = !(r.scores[r.next] > 0);
    $("res-next-tl").className = "tl tl-" + r.next;
    $("res-next-tl").textContent = r.next;
    $("res-next").textContent = r.scores[r.next] > 0
      ? "次は「" + r.next + " " + nx.name + "」の「" + nx.tool + "」がおすすめです。今回の答えで、" + id + "の次に点数が高かったタイプです。"
      : "1作できたら、この診断をもう一度受けてみてください。作りたいものが見えてきているはずです。";

    // LINE・シェア
    $("line-btn").href = LINE_URL;
    var text = "「AIでまず何を作るか診断」の結果は【" + id + " " + T.name + "】でした。\n最初の1作は「" + T.tool + "」。\n#ウゴキラボ";
    shareText = text + "\n" + PAGE_URL;
    $("share-x").href = "https://x.com/intent/tweet?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(PAGE_URL);
    $("share-th").href = "https://www.threads.net/intent/post?text=" + encodeURIComponent(shareText);
    $("share-native").hidden = typeof navigator.share !== "function";
    $("copied").textContent = ""; $("manual").hidden = true;

    show("s-result", $("res-h"));
    // 演出
    var burst = clear($("burst"));
    if (!reduce()) for (var k = 0; k < 18; k++) {
      var sp = h("i");
      sp.style.setProperty("--x", (5 + Math.random() * 90) + "%");
      sp.style.setProperty("--y", (20 + Math.random() * 70) + "%");
      sp.style.setProperty("--s", (5 + Math.random() * 9) + "px");
      sp.style.setProperty("--d", (Math.random() * .5) + "s");
      burst.appendChild(sp);
    }
    revealSections();
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      Array.prototype.forEach.call(bars.querySelectorAll("i"), function (f) { f.style.width = f.dataset.w; });
    }); });
  }

  var io = null;
  function revealSections() {
    var els = document.querySelectorAll("#s-result .fade");
    Array.prototype.forEach.call(els, function (el) { el.classList.remove("in"); });
    if (reduce() || !("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(els, function (el) { el.classList.add("in"); }); return;
    }
    if (io) io.disconnect();
    io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    Array.prototype.forEach.call(els, function (el) { io.observe(el); });
  }

  /* ---------- コピー・共有 ---------- */
  var shareText = "";
  function copyText(t) {
    var fallback = function () {
      try {
        var ta = document.createElement("textarea");
        ta.value = t; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.top = "0"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, t.length);
        var ok = document.execCommand("copy"); document.body.removeChild(ta); return ok;
      } catch (e) { return false; }
    };
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(t).then(function () { return true; }, function () { return fallback(); });
    }
    return Promise.resolve(fallback());
  }
  var toastTimer;
  function toast(msg) {
    var el = $("toast"); el.textContent = msg; el.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2200);
  }
  function selectEl(el) {
    var rg = document.createRange(); rg.selectNodeContents(el);
    var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rg);
  }
  function bindCopy(btnId, srcId, okMsg) {
    $(btnId).addEventListener("click", function () {
      var src = $(srcId);
      copyText(src.textContent).then(function (ok) {
        if (ok) toast(okMsg);
        else { selectEl(src); toast("自動でコピーできませんでした。選択された本文をコピーしてください"); }
      });
    });
  }
  bindCopy("copy-prompt", "res-prompt", "制作指示をコピーしました");
  bindCopy("copy-fix", "res-fix", "コピーしました");
  $("copy-share").addEventListener("click", function () {
    copyText(shareText).then(function (ok) {
      if (ok) { $("copied").textContent = "コピーしました。好きな場所に貼り付けて共有できます"; $("manual").hidden = true; }
      else { $("copied").textContent = ""; $("manual").hidden = false; var ta = $("manual-text"); ta.value = shareText; ta.focus(); ta.select(); }
    });
  });
  $("share-native").addEventListener("click", function () {
    navigator.share({ title: "AIでまず何を作るか診断｜ウゴキラボ", text: shareText.replace("\n" + PAGE_URL, ""), url: PAGE_URL })
      .catch(function () { /* 利用者が閉じた場合など。何もしない */ });
  });

  /* ---------- 再診断 ---------- */
  $("retry").addEventListener("click", function () {
    answers = new Array(N).fill(null); step = 0; result = null;
    renderQ(0); show("s-quiz", $("qtext"));
  });

  // テスト用の読み取り口（外部送信なし・状態の参照のみ）
  window.__shindan = { get answers() { return answers.slice(); }, get step() { return step; }, get result() { return result; } };
})();
