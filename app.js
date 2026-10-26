/* Loan Calc — all maths runs locally, in whole cents so totals add up exactly. */
(function () {
  "use strict";
  var $ = S3.$, $$ = S3.$$;
  var KEY = "loan.v1";
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var state = { unit: "y", view: "year", res: null, base: null, start: null };

  // Accepts "250,000", "6.5", Arabic-Indic digits and the Arabic decimal mark.
  function num(v) {
    v = String(v == null ? "" : v)
      .replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x660; })
      .replace(/[۰-۹]/g, function (d) { return d.charCodeAt(0) - 0x6F0; })
      .replace(/٫/g, ".").replace(/[,\s_٬]/g, "");
    return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(v) ? parseFloat(v) : NaN;
  }

  function monthlyPayment(P, annual, n) {
    var r = annual / 1200;
    if (!r) return P / n;
    return P * r / (1 - Math.pow(1 + r, -n));
  }

  // Schedule in integer cents. The final payment absorbs the rounding remainder so the balance ends at exactly 0.
  function amortize(P, annual, n, extra) {
    var r = annual / 1200, bal = Math.round(P * 100), pay = Math.round(monthlyPayment(P, annual, n) * 100);
    var ex = Math.round((extra || 0) * 100), rows = [];
    for (var i = 1; i <= n && bal > 0; i++) {
      var interest = Math.round(bal * r);
      var princ = i === n ? bal : Math.max(0, Math.min(bal, pay - interest));
      var x = Math.min(bal - princ, ex);
      bal -= princ + x;
      rows.push({ n: i, interest: interest, principal: princ, extra: x, payment: interest + princ + x, balance: bal });
    }
    var ti = 0, tp = 0;
    rows.forEach(function (row) { ti += row.interest; tp += row.payment; });
    return { payment: pay, rows: rows, interest: ti, total: tp };
  }

  function addMonths(ym, k) { var t = ym.y * 12 + ym.m + k; return { y: Math.floor(t / 12), m: t % 12 }; }
  function ymLabel(ym) { return MONTHS[ym.m] + " " + ym.y; }
  function money(c) { return (c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function plain(c) { return (c / 100).toFixed(2); }
  function dur(n) {
    var y = Math.floor(n / 12), m = n % 12, s = [];
    if (y) s.push(y + (y === 1 ? " year" : " years"));
    if (m) s.push(m + (m === 1 ? " month" : " months"));
    return s.join(" ") || "0 months";
  }

  function defaultStart() { var d = new Date(); return addMonths({ y: d.getFullYear(), m: d.getMonth() }, 1); }
  function parseStart(v) { var m = /^(\d{4})-(\d{2})$/.exec(v || ""); return m ? { y: +m[1], m: +m[2] - 1 } : null; }
  function fmtStart(ym) { return ym.y + "-" + String(ym.m + 1).padStart(2, "0"); }

  // Group months into calendar years (based on the first payment month).
  function byYear(rows, start) {
    var out = [], cur = null;
    rows.forEach(function (r) {
      var ym = addMonths(start, r.n - 1);
      if (!cur || cur.year !== ym.y) { cur = { year: ym.y, interest: 0, principal: 0, extra: 0, payment: 0, balance: 0 }; out.push(cur); }
      cur.interest += r.interest; cur.principal += r.principal; cur.extra += r.extra; cur.payment += r.payment; cur.balance = r.balance;
    });
    return out;
  }

  // ---------- chart ----------
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    var steps = [1, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (var i = 0; steps[i] < f - 1e-9; i++);
    return steps[i] * p;
  }
  function compact(v) { return Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(v); }

  function drawChart() {
    var cv = $("#chart"), W = cv.clientWidth, H = cv.clientHeight, dpr = window.devicePixelRatio || 1;
    if (!W || !H) return;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    var g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    var res = state.res;
    if (!res) return;
    var years = byYear(res.rows, state.start), P = res.rows.length ? res.rows[0].balance + res.rows[0].principal + res.rows[0].extra : 0;
    var font = getComputedStyle(document.body).fontFamily;
    var pl = 46, pr = 46, pt = 10, pb = 24, cw = W - pl - pr, ch = H - pt - pb;
    var maxBar = niceMax(Math.max.apply(null, years.map(function (y) { return (y.principal + y.extra + y.interest) / 100; }).concat([0]))), maxBal = niceMax(P / 100);
    g.font = "11px " + font; g.textBaseline = "middle";
    g.strokeStyle = cssVar("--line"); g.fillStyle = cssVar("--text-3"); g.lineWidth = 1;
    for (var t = 0; t <= 4; t++) {
      var y = pt + ch - ch * t / 4;
      g.beginPath(); g.moveTo(pl, Math.round(y) + .5); g.lineTo(W - pr, Math.round(y) + .5); g.stroke();
      g.textAlign = "right"; g.fillText(compact(maxBar * t / 4), pl - 6, y);
      g.textAlign = "left"; g.fillText(compact(maxBal * t / 4), W - pr + 6, y);
    }
    var n = years.length, slot = cw / Math.max(n, 1), bw = Math.max(2, Math.min(28, slot * 0.66));
    var cP = cssVar("--accent"), cI = cssVar("--coffee");
    var every = Math.ceil(n / Math.max(1, Math.floor(cw / 44)));
    years.forEach(function (yr, i) {
      var x = pl + slot * i + (slot - bw) / 2;
      var hp = (yr.principal + yr.extra) / 100 / maxBar * ch, hi = yr.interest / 100 / maxBar * ch;
      g.fillStyle = cP; g.fillRect(x, pt + ch - hp, bw, hp);
      g.fillStyle = cI; g.fillRect(x, pt + ch - hp - hi, bw, hi);
      if (i % every === 0) { g.fillStyle = cssVar("--text-3"); g.textAlign = "center"; g.fillText(String(yr.year), x + bw / 2, H - pb / 2 + 2); }
    });
    g.strokeStyle = cssVar("--text-2"); g.lineWidth = 2; g.lineJoin = "round"; g.beginPath();
    g.moveTo(pl, pt + ch - P / 100 / maxBal * ch);
    years.forEach(function (yr, i) { g.lineTo(pl + slot * (i + 1), pt + ch - yr.balance / 100 / maxBal * ch); });
    g.stroke();
  }

  // ---------- UI ----------
  function seg(el, value, onPick) {
    $$("button", el).forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.v === value));
      b.addEventListener("click", function () {
        $$("button", el).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        onPick(b.dataset.v);
      });
    });
  }
  function stat(label, value, cls) { return '<div class="stat ' + (cls || "") + '"><b>' + S3.esc(value) + "</b><span>" + S3.esc(label) + "</span></div>"; }

  function read() {
    var P = num($("#amount").value), rate = num($("#rate").value), term = num($("#term").value), extra = $("#extra").value.trim() ? num($("#extra").value) : 0;
    var n = state.unit === "y" ? Math.round(term * 12) : Math.round(term);
    if (!(P > 0)) return { err: "Enter a loan amount above 0." };
    if (!(rate >= 0) || rate > 100) return { err: "Enter an interest rate between 0 and 100%." };
    if (!(n >= 1) || n > 1200) return { err: "Enter a term between 1 month and 100 years." };
    if (!(extra >= 0)) return { err: "Extra payment must be 0 or more." };
    return { P: P, rate: rate, n: n, extra: extra };
  }

  function save() {
    S3.store(KEY, { amount: $("#amount").value, rate: $("#rate").value, term: $("#term").value, extra: $("#extra").value, start: $("#start").value, unit: state.unit, view: state.view });
  }

  function render() {
    var inp = read();
    state.start = parseStart($("#start").value) || defaultStart();
    save();
    $("#err").textContent = inp.err || "";
    if (inp.err) {
      state.res = null; $("#stats").innerHTML = ""; $("#saved").hidden = true;
      $("#table").innerHTML = '<tr><td class="empty"><b>Nothing to show yet</b>Fill in the loan details.</td></tr>';
      drawChart(); return;
    }
    var res = amortize(inp.P, inp.rate, inp.n, inp.extra), base = inp.extra ? amortize(inp.P, inp.rate, inp.n, 0) : res;
    state.res = res; state.base = base; state.inp = inp;
    var payoff = addMonths(state.start, res.rows.length - 1);
    $("#stats").innerHTML =
      stat("monthly payment" + (inp.extra ? " + " + money(Math.round(inp.extra * 100)) + " extra" : ""), money(res.payment), "main") +
      stat("total interest", money(res.interest)) +
      stat("total paid", money(res.total)) +
      stat("paid off in " + dur(res.rows.length), ymLabel(payoff));
    var saved = $("#saved");
    if (inp.extra && res.rows.length < base.rows.length) {
      saved.hidden = false;
      saved.innerHTML = "Extra payments save <b>" + S3.esc(money(base.interest - res.interest)) + "</b> in interest and finish <b>" +
        S3.esc(dur(base.rows.length - res.rows.length)) + "</b> sooner.";
    } else saved.hidden = true;
    drawChart(); renderTable();
  }

  function renderTable() {
    var res = state.res;
    if (!res) return;
    var hasExtra = res.rows.some(function (r) { return r.extra > 0; });
    var head = "<thead><tr><th>" + (state.view === "year" ? "Year" : "#") + "</th>" + (state.view === "month" ? "<th>Date</th>" : "") +
      '<th class="num">Payment</th><th class="num">Principal</th>' + (hasExtra ? '<th class="num">Extra</th>' : "") +
      '<th class="num">Interest</th><th class="num">Balance</th></tr></thead>';
    var rows = state.view === "year" ? byYear(res.rows, state.start).map(function (y) { y.label = y.year; return y; }) : res.rows;
    var body = rows.map(function (r) {
      return "<tr><td>" + (state.view === "year" ? r.label : r.n) + "</td>" + (state.view === "month" ? "<td>" + ymLabel(addMonths(state.start, r.n - 1)) + "</td>" : "") +
        '<td class="num">' + money(r.payment) + '</td><td class="num">' + money(r.principal) + "</td>" +
        (hasExtra ? '<td class="num">' + money(r.extra) + "</td>" : "") +
        '<td class="num">' + money(r.interest) + '</td><td class="num">' + money(r.balance) + "</td></tr>";
    }).join("");
    $("#table").innerHTML = head + "<tbody>" + body + "</tbody>";
  }

  function summary() {
    var r = state.res, i = state.inp;
    return "Loan " + money(Math.round(i.P * 100)) + " at " + i.rate + "% for " + dur(i.n) + "\n" +
      "Monthly payment: " + money(r.payment) + (i.extra ? " (+ " + money(Math.round(i.extra * 100)) + " extra)" : "") + "\n" +
      "Total interest: " + money(r.interest) + "\nTotal paid: " + money(r.total) + "\n" +
      "Paid off: " + ymLabel(addMonths(state.start, r.rows.length - 1)) + " (" + dur(r.rows.length) + ")";
  }

  function csv() {
    var lines = ["No,Date,Payment,Principal,Extra,Interest,Balance"];
    state.res.rows.forEach(function (r) {
      var ym = addMonths(state.start, r.n - 1);
      lines.push([r.n, fmtStart(ym), plain(r.payment), plain(r.principal), plain(r.extra), plain(r.interest), plain(r.balance)].join(","));
    });
    return lines.join("\n") + "\n";
  }

  // ---------- wiring ----------
  var saved = S3.store(KEY) || {};
  $("#amount").value = saved.amount != null ? saved.amount : "250,000";
  $("#rate").value = saved.rate != null ? saved.rate : "6.5";
  $("#term").value = saved.term != null ? saved.term : "30";
  $("#extra").value = saved.extra || "";
  $("#start").value = saved.start || fmtStart(defaultStart());
  state.unit = saved.unit === "m" ? "m" : "y";
  state.view = saved.view === "month" ? "month" : "year";

  seg($("#unit"), state.unit, function (v) {
    var t = num($("#term").value);
    if (t > 0 && v !== state.unit) $("#term").value = v === "m" ? String(Math.round(t * 12)) : String(+(t / 12).toFixed(2));
    state.unit = v; render();
  });
  seg($("#view"), state.view, function (v) { state.view = v; save(); renderTable(); });
  $$("#amount, #rate, #term, #extra, #start").forEach(function (el) { el.addEventListener("input", render); });
  $("#copy").addEventListener("click", function () {
    if (!state.res) return S3.toast("Fill in the loan first", "error");
    S3.copy(summary()); S3.done();
  });
  $("#csv").addEventListener("click", function () {
    if (!state.res) return S3.toast("Fill in the loan first", "error");
    S3.download(csv(), "amortization.csv", "text/csv"); S3.done();
  });
  if (window.ResizeObserver) new ResizeObserver(S3.debounce(drawChart, 60)).observe($("#chart"));
  new MutationObserver(drawChart).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  render();

  window.S3_DEMO = function () {
    $("#amount").value = "200,000"; $("#rate").value = "6"; $("#term").value = "30"; $("#extra").value = "150";
    $("#unit button[data-v=y]").click(); $("#view button[data-v=year]").click(); render();
  };

  // Self-test run by scripts/smoke.py — known answers.
  window.S3_SELFTEST = function () {
    var a = amortize(200000, 6, 360, 0);                       // classic: 1,199.10 / month
    var sumP = a.rows.reduce(function (s, r) { return s + r.principal; }, 0);
    var z = amortize(1000, 0, 3, 0);                            // 0%: 333.33, 333.33, 333.34
    var e = amortize(200000, 6, 360, 200);                      // extra payments shorten the loan
    var eP = e.rows.reduce(function (s, r) { return s + r.principal + r.extra; }, 0);
    var b = amortize(10000, 5, 12, 0);                          // 856.07 / month
    return a.payment === 119910 && a.rows.length === 360 && sumP === 20000000 && a.rows[359].balance === 0 &&
      Math.abs(a.interest - 23167638) < 200 &&
      z.payment === 33333 && z.interest === 0 && z.rows[2].payment === 33334 &&
      e.rows.length < 300 && eP === 20000000 && e.interest < a.interest &&
      b.payment === 85607 && num("200,000") === 200000 && num("٦٫٥") === 6.5 &&
      addMonths({ y: 2026, m: 11 }, 1).y === 2027 && addMonths({ y: 2026, m: 11 }, 1).m === 0;
  };
})();
