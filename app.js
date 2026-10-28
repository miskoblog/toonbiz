/* ToonBiz — static, client-side only. No network calls. */
const GATE_HASH = "bd8bea04104f9ab7d7804887de60391edc860ace4240ba690c830de5eb6330de";
const KEY = "toonbiz";

/* ---------- utilities ---------- */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}
const esc = escapeHtml;
function num(v, d = 0) { const n = parseFloat(v); return isFinite(n) ? n : d; }
function round5(x) { return Math.round(x / 5) * 5; }
function fmt(n, d = 0) { return Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }
function money(n) { const r = Math.round(n * 100) / 100; return "$" + (Number.isInteger(r) ? fmt(r) : fmt(r, 2)); }
function formatSavedAt(iso) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-visible"), 1800);
}

/* ---------- shared state across tools (optional pull buttons only) ---------- */
function getShared() {
  try { return JSON.parse(localStorage.getItem(KEY + "_shared")) || {}; } catch (e) { return {}; }
}
function setShared(patch) {
  try { localStorage.setItem(KEY + "_shared", JSON.stringify(Object.assign(getShared(), patch))); } catch (e) { /* storage unavailable */ }
}

/* ---------- gate / theme / tabs ---------- */
async function sha256Hex(str) {
  const bytes = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function initGate() {
  const gate = document.getElementById("gate");
  const form = document.getElementById("gateForm");
  const input = document.getElementById("gatePassword");
  const error = document.getElementById("gateError");
  if (gate.classList.contains("is-unlocked")) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const hash = await sha256Hex(input.value.trim());
    if (hash === GATE_HASH) {
      localStorage.setItem(KEY + "_access", "granted");
      gate.classList.add("is-unlocked");
      error.classList.remove("is-visible");
    } else {
      error.classList.add("is-visible");
      input.value = ""; input.focus();
    }
  });
}

function initTheme() {
  const toggle = document.getElementById("themeToggle");
  const root = document.documentElement;
  function effectiveTheme() {
    const attr = root.getAttribute("data-theme");
    if (attr === "dark" || attr === "light") return attr;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  toggle.addEventListener("click", () => {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem(KEY + "_theme", next);
  });
}

function initTabs() {
  const btns = document.querySelectorAll(".tab-btn");
  btns.forEach((btn) => {
    btn.addEventListener("click", () => {
      btns.forEach((b) => { b.classList.remove("is-active"); b.setAttribute("aria-selected", "false"); });
      btn.classList.add("is-active");
      btn.setAttribute("aria-selected", "true");
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("is-active"));
      document.getElementById("panel-" + btn.dataset.tab).classList.add("is-active");
    });
  });
}

/* ---------- save / reopen ---------- */
function initSaveable({ toolId, listEl, getEntry, applyEntry, max = 50 }) {
  const key = `${KEY}_saved_${toolId}`;
  const read = () => { try { return JSON.parse(localStorage.getItem(key)) || []; } catch (e) { return []; } };
  const write = (entries) => { localStorage.setItem(key, JSON.stringify(entries.slice(0, max))); render(); };

  function render() {
    const entries = read();
    if (!entries.length) {
      listEl.innerHTML = `<p class="saved-empty">Nothing saved yet — fill in the tool, then press Save.</p>`;
      return;
    }
    listEl.innerHTML = entries.map((e) => `
      <div class="saved-item" data-id="${e.id}">
        <div class="saved-item-main">
          <div class="saved-item-name">${esc(e.name)}</div>
          <div class="saved-item-meta">${esc(e.meta)} · ${formatSavedAt(e.savedAt)}</div>
        </div>
        <div class="saved-actions">
          <button class="ghost-btn" data-act="open">Open</button>
          <button class="ghost-btn" data-act="delete">Delete</button>
        </div>
      </div>`).join("");
  }

  listEl.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-act]");
    if (!btn) return;
    const id = btn.closest(".saved-item").dataset.id;
    const entry = read().find((e) => e.id === id);
    if (!entry) return;
    if (btn.dataset.act === "open") { applyEntry(entry.payload); showToast("Opened"); }
    else { write(read().filter((e) => e.id !== id)); showToast("Deleted"); }
  });

  render();
  let seq = 0;
  return {
    save() {
      const entry = getEntry();
      if (!entry) { showToast("Nothing to save yet"); return; }
      write([{ id: Date.now().toString(36) + (seq++).toString(36), savedAt: new Date().toISOString(), ...entry }, ...read()]);
      showToast("Saved");
    },
  };
}

function copyText(text) {
  const done = () => showToast("Copied");
  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    ta.remove(); done();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
  else fallback();
}

/* =====================================================================
   COMPUTE FUNCTIONS (pure; called directly by tests)
   ===================================================================== */
const RATE_VIDEO = 4, RATE_STILL = 1, RATE_SCORE = 10;
const PLANS = {
  1000: { key: "1000", name: "Commercial", credits: 1000, price: 37 },
  3500: { key: "3500", name: "Commercial + Elite", credits: 3500, price: 84 },
  6000: { key: "6000", name: "Bundle", credits: 6000, price: 317 },
};

function computeCredits(v) {
  const plan = PLANS[v.plan] || PLANS[1000];
  const scenes = Math.max(0, num(v.scenes)), secs = Math.max(0, num(v.secs));
  const stills = Math.max(0, num(v.stills)), redo = Math.max(0, num(v.redo));
  const score = v.score === "yes";
  const video = scenes * secs * RATE_VIDEO;
  const stillsC = scenes * stills * RATE_STILL;
  const redoC = redo * secs * RATE_VIDEO;
  const scoreC = score ? RATE_SCORE : 0;
  const total = video + stillsC + redoC + scoreC;
  const blank = String(v.left == null ? "" : v.left).trim() === "";
  const balance = blank ? plan.credits : Math.max(0, num(v.left));
  return {
    plan, video, stillsC, redoC, scoreC, total, balance, usedFullPlan: blank,
    pct: balance > 0 ? (total / balance) * 100 : 0,
    episodesLeft: total > 0 ? Math.floor(balance / total) : 0,
    secondsBuys: balance / RATE_VIDEO,
    creditPrice: plan.price / plan.credits,
    episodeDollars: total * (plan.price / plan.credits),
    scenes, secs, stills, redo, score,
  };
}

function computeComparator(v) {
  const eps = Math.max(0, num(v.eps)), secs = Math.max(0, num(v.secs));
  const cpe = Math.max(0, num(v.cpe)), months = Math.max(0, num(v.months));
  const monthly = eps * cpe, need = monthly * months;
  const tiers = Object.values(PLANS).map((p) => {
    const covered = cpe > 0 ? Math.floor(p.credits / cpe) : 0;
    const runway = monthly > 0 ? p.credits / monthly : null;
    const shortfall = Math.max(0, need - p.credits);
    const finishedMin = (covered * secs) / 60;
    return Object.assign({}, p, {
      centsPerCredit: (p.price / p.credits) * 100, covered, runway, shortfall,
      perMinute: finishedMin > 0 ? p.price / finishedMin : null, covers: shortfall === 0,
    });
  });
  return { monthly, need, tiers, best: tiers.find((t) => t.covers) || null, eps, secs, cpe, months };
}

function computeLedger(v, shared) {
  shared = shared || getShared();
  const blank = String(v.start == null ? "" : v.start).trim() === "";
  const start = blank ? (shared.balance != null ? shared.balance : 1000) : num(v.start);
  const rows = v.rows || [];
  const withAct = rows.filter((r) => r.act != null);
  const spent = withAct.reduce((s, r) => s + r.act, 0);
  const both = rows.filter((r) => r.act != null && r.est != null);
  const sumEst = both.reduce((s, r) => s + r.est, 0), sumAct = both.reduce((s, r) => s + r.act, 0);
  const avgActual = withAct.length ? spent / withAct.length : null;
  return {
    start, rows, spent, balance: start - spent, count: rows.length,
    variancePct: sumEst > 0 ? ((sumAct - sumEst) / sumEst) * 100 : null,
    avgActual, episodesLeft: avgActual > 0 ? Math.floor((start - spent) / avgActual) : null,
  };
}

const CLIENT_TYPES = {
  local: ["Local business", 1.0], church: ["Church / ministry", 0.8], kids: ["Kids channel creator", 0.9],
  nonprofit: ["Nonprofit", 0.7], product: ["Product seller", 1.3],
};
const DELIVERABLES = {
  ad: ["30-second ad", "pAd", 1], episode: ["1-2 minute episode", "pEp", 1],
  series: ["4-episode series", "pSeries", 4], shorts: ["Shorts pack of 5", "pShorts", 5],
};
function computePrice(v) {
  const t = CLIENT_TYPES[v.ctype] || CLIENT_TYPES.local;
  const d = DELIVERABLES[v.deliv] || DELIVERABLES.ad;
  const base = Math.max(0, num(v[d[1]]));
  const rounds = Math.max(1, Math.floor(num(v.rounds, 1)));
  const revF = 1 + 0.1 * (rounds - 1), rushF = v.rush ? 1.25 : 1, adsF = v.ads ? 1.35 : 1;
  const target = round5(base * t[1] * revF * rushF * adsF);
  const low = round5(0.8 * target), premium = round5(1.35 * target);
  const credits = Math.max(0, num(v.cpv)) * d[2];
  const cost = credits * Math.max(0, num(v.cpc));
  const hours = Math.max(0, num(v.hours));
  const margin = target - cost;
  return {
    typeName: t[0], typeMult: t[1], delivName: d[0], videos: d[2], base, rounds, revF, rushF, adsF,
    target, low, premium, credits, cost, margin,
    marginPct: target > 0 ? (margin / target) * 100 : 0,
    hourly: hours > 0 ? margin / hours : null, hours,
    multiple: cost > 0 ? target / cost : null,
  };
}

const VIDEO_TYPES = { ad: "30-second ad", episode: "1-2 minute episode", shorts: "Shorts pack of 5", series: "Series episode" };
const TERMS = {
  split: "50% to start, 50% on approval of the final video",
  upfront: "100% upfront before work begins",
  delivery: "100% on delivery of the final video",
  monthly: "Billed monthly in advance",
};
function computeProposal(v) {
  const price = Math.max(0, num(v.price));
  const better = { videos: 4, perVideo: price * 0.85, total: Math.round(4 * price * 0.85) };
  const bestMonthly = Math.round(4 * price * 0.75);
  return {
    price,
    good: { videos: 1, formats: 1, revisions: 1, total: Math.round(price) },
    better: { videos: 4, formats: 3, revisions: 2, perVideo: Math.round(better.perVideo * 100) / 100, total: better.total },
    best: { videosPerMonth: 4, months: 3, perVideo: Math.round(price * 0.75 * 100) / 100, monthly: bestMonthly, total: bestMonthly * 3 },
    typeName: VIDEO_TYPES[v.vtype] || VIDEO_TYPES.ad, terms: TERMS[v.terms] || TERMS.split,
  };
}

const PITCH_TYPES = {
  local: { label: "local businesses", feed: "stand out in a feed full of stock footage", ask: "a short animated spot for your social pages", diy: "You could, and some owners enjoy it. The catch is the time: scripting, timing and editing a clean animated spot takes most people many evenings. I turn it around so you can stay on the floor of the business." },
  church: { label: "churches and ministries", feed: "share a message or an announcement in a way people actually watch", ask: "a short animated video for your congregation and online community", diy: "You could, and a volunteer may be willing. The risk is it lands on one busy person every week. I can take the production off your team so they can focus on people." },
  kids: { label: "kids channel creators", feed: "publish steady episodes without building an animation team", ask: "animated episodes for your channel", diy: "You could, and plenty of creators do. The catch is consistency: one episode is a project, a channel is a pipeline. I can be the pipeline so you can focus on the audience." },
  nonprofit: { label: "nonprofits", feed: "explain your mission in under a minute", ask: "a short animated video about your mission", diy: "You could, and your team may already be stretched thin. I can handle production so your staff stay on programs, and you approve everything before it is finished." },
  product: { label: "product sellers", feed: "show your product in a short animated ad", ask: "a short animated ad for your product page and social channels", diy: "You could, but each product needs its own ad and the time adds up. I can produce them in a consistent style so your listings stay fresh." },
};
const OBJ_PRICE = {
  local: "I keep it simple on purpose. Start with one video so you can see the result before committing to more.",
  church: "I price with ministries in mind, and I would rather scope a smaller piece than cut quality. Start with one video and add more later.",
  kids: "I get it, a channel runs on tight margins. Start with one episode, and if it works we can look at a bundle that brings the per-video cost down.",
  nonprofit: "I know budgets are tight. I would rather trim the scope than the quality, so we can do a shorter piece or fewer scenes.",
  product: "Think of it per ad instead of per project. One video can sit on a product page, in ads and on social, and a bundle brings the per-video price down.",
};
function computePitch(v) {
  const t = PITCH_TYPES[v.ctype] || PITCH_TYPES.local;
  const me = (v.me || "").trim() || "[Your name]";
  const first = (v.first || "").trim() || "there";
  const biz = (v.biz || "").trim() || "your business";
  const offer = (v.offer || "").trim() || "a short animated video";
  const priceN = num(v.price);
  const price = priceN > 0 ? money(priceN) : "a fixed price";
  const noticed = (v.noticed || "").trim();
  const email = v.channel !== "dm";
  const opener = noticed
    ? `I noticed ${noticed.replace(/[.\s]+$/, "")}.`
    : `I came across ${biz} and had an idea.`;
  const storyboard = "Before anything is animated you would see a storyboard of still frames and approve it. Only then do I animate it.";
  const deliver = "You get an HD MP4 with no watermark, produced under RocketToons' commercial license.";
  const first_msg = email
    ? `Subject: A short animated video for ${biz}\n\nHi ${first},\n\n${opener} I make short animated videos for ${t.label}, to help them ${t.feed}. I think ${offer} could work well for ${biz}.\n\n${storyboard} ${deliver}\n\nIt is ${price} for ${offer}. Want me to send a one-page scope and price sheet?\n\nThanks,\n${me}`
    : `Hi ${first}, ${opener} I make short animated videos for ${t.label}. I think ${offer} could work for ${biz}. You approve a storyboard of stills before anything animates. It is ${price}. Want a one-page scope and price sheet?\n- ${me}`;
  const day3 = email
    ? `Subject: Re: A short animated video for ${biz}\n\nHi ${first},\n\nJust floating this back up. If it helps, I can send the storyboard idea for ${offer} so you can see the direction before deciding anything.\n\nThanks,\n${me}`
    : `Hi ${first}, floating this back up. Happy to send a quick storyboard idea for ${offer} so you can see the direction first. - ${me}`;
  const day7 = email
    ? `Subject: Should I close this out?\n\nHi ${first},\n\nI will not keep nudging. If a short animated video is not a priority for ${biz} right now, no problem. If it is, reply "yes" and I will send the one-page scope and price sheet.\n\nThanks,\n${me}`
    : `Hi ${first}, last nudge from me. If a short animated video is not a priority for ${biz}, no problem. If it is, reply "yes" and I will send the scope sheet. - ${me}`;
  const objections = [
    { label: "\"It's too expensive\"", text: `${OBJ_PRICE[v.ctype] || OBJ_PRICE.local} The price for ${offer} is ${price}, and I can show you what is included line by line.` },
    { label: "\"AI looks cheap\"", text: `That is a fair worry, and it is why nothing is animated until you approve a storyboard of stills. You see the look, the characters and the story first, and we adjust until it fits ${biz}. The final is an HD MP4 with no watermark.` },
    { label: "\"Who owns it?\"", text: `You receive the finished HD MP4 with no watermark, produced under RocketToons' commercial license. I am not a lawyer, so for the exact terms please read that license, and I will list what you receive in the scope sheet.` },
    { label: "\"I'll do it myself\"", text: t.diy },
  ];
  return { first_msg, day3, day7, objections, email, typeLabel: t.label };
}

const NICHES = {
  faith: ["Faith", 1.0], nursery: ["Nursery", 0.7], drama: ["Drama", 1.0], sitcom: ["Sitcom", 1.1],
  anime: ["Anime", 0.9], bedtime: ["Bedtime", 0.7], explainers: ["Explainers", 1.4],
};
const BASE_VIEWS = 66.5e9;
function computeReality(v) {
  const n = NICHES[v.niche] || NICHES.faith;
  const mix = [num(v.mYT), num(v.mSH), num(v.mFB), num(v.mIG)].map((x) => Math.max(0, x));
  const rpm = [num(v.rYT), num(v.rSH), num(v.rFB), num(v.rIG)];
  const sum = mix.reduce((a, b) => a + b, 0);
  const shares = mix.map((m) => (sum > 0 ? m / sum : 0));
  const blended = shares.reduce((s, sh, i) => s + sh * rpm[i], 0);
  const rpmEff = blended * n[1];
  const slices = [0.001, 0.01, 0.1].map((pct) => {
    const views = BASE_VIEWS * (pct / 100);
    const yearly = (views / 1000) * rpmEff;
    return { pct, views, yearly, monthly: yearly / 12 };
  });
  const goal = Math.max(0, num(v.goal)), epw = Math.max(0, num(v.epw));
  const reqYearly = rpmEff > 0 ? ((goal * 12) / rpmEff) * 1000 : null;
  const epsYear = epw * 52;
  return {
    nicheName: n[0], nicheMult: n[1], shares, blended, rpmEff, slices, goal, epw,
    reqYearly, reqPct: reqYearly != null ? (reqYearly / BASE_VIEWS) * 100 : null,
    perEpisode: reqYearly != null && epsYear > 0 ? reqYearly / epsYear : null,
  };
}

const PLATFORMS = [
  { k: "pYT", name: "YouTube", fmts: ["16:9", "9:16"] },
  { k: "pFB", name: "Facebook", fmts: ["1:1", "16:9", "9:16"] },
  { k: "pIG", name: "Instagram", fmts: ["9:16", "1:1"] },
  { k: "pLI", name: "LinkedIn", fmts: ["1:1", "16:9"] },
];
const FORMATS = [{ k: "f169", name: "16:9" }, { k: "f916", name: "9:16" }, { k: "f11", name: "1:1" }];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
}
function fmtDay(ms) {
  const d = new Date(ms);
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
function isoDay(ms) { return new Date(ms).toISOString().slice(0, 10); }
function computeCadence(v) {
  const n = Math.min(7, Math.max(1, Math.floor(num(v.epw, 1))));
  const cpe = Math.max(0, num(v.cpe)), now = Math.max(0, num(v.credits));
  const fmts = FORMATS.filter((f) => v[f.k]).map((f) => f.name);
  const pairs = [];
  PLATFORMS.forEach((p) => { if (v[p.k]) p.fmts.forEach((f) => { if (fmts.includes(f)) pairs.push(`${p.name} ${f}`); }); });
  const start = parseDay(v.start);
  const weeks = [];
  let firstBad = null;
  for (let w = 0; w < 12; w++) {
    const eps = [];
    for (let i = 0; i < n; i++) {
      const k = w * n + i + 1;
      const remaining = now - k * cpe;
      const date = start == null ? null : start + (w * 7 + Math.floor((i * 7) / n)) * 86400000;
      const ok = remaining >= 0;
      eps.push({ k, date, remaining, ok });
      if (!ok && !firstBad) firstBad = { k, date, week: w + 1 };
    }
    weeks.push({ week: w + 1, eps, posts: eps.length * pairs.length, remaining: eps[eps.length - 1].remaining });
  }
  return { n, cpe, now, pairs, weeks, firstBad, totalEpisodes: 12 * n, totalCredits: 12 * n * cpe, startValid: start != null };
}

function computeScoreboard(v) {
  const required = Math.max(0, num(v.required)), cpc = Math.max(0, num(v.cpc));
  const map = new Map();
  (v.rows || []).forEach((r) => {
    const key = r.series.trim().toLowerCase();
    if (!map.has(key)) map.set(key, { series: r.series.trim(), rows: [] });
    map.get(key).rows.push(r);
  });
  const series = [...map.values()].map((s) => {
    const count = s.rows.length;
    const avgViews = s.rows.reduce((a, r) => a + r.views, 0) / count;
    const avgCredits = s.rows.reduce((a, r) => a + r.credits, 0) / count;
    const ratio = required > 0 ? avgViews / required : null;
    let verdict;
    if (count < 3) verdict = "Too early";
    else if (ratio == null) verdict = "Too early";
    else if (ratio >= 1) verdict = "Keep";
    else if (ratio >= 0.4) verdict = "Change";
    else verdict = "Stop";
    return {
      series: s.series, count, avgViews, avgCredits, ratio, verdict,
      costPer1k: avgViews > 0 ? ((avgCredits * cpc) / avgViews) * 1000 : null,
      platforms: [...new Set(s.rows.map((r) => r.platform))],
    };
  });
  return { required, cpc, series, rowCount: (v.rows || []).length };
}

/* =====================================================================
   TOOL FRAMEWORK
   ===================================================================== */
const TOOLS = [];
const planOpts = [["1000", "Commercial — 1,000 credits ($37)"], ["3500", "Commercial + Elite — 3,500 credits ($84)"], ["6000", "Bundle — 6,000 credits ($317)"]];
const ctypeOpts = Object.entries(CLIENT_TYPES).map(([k, t]) => [k, `${t[0]} (x${t[1].toFixed(1)})`]);

function statHtml(label, value, note) {
  return `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div>${note ? `<div class="stat-note">${note}</div>` : ""}</div>`;
}
function placeholder(msg) { return `<p class="output-placeholder">${msg}</p>`; }

/* ---- 1a Episode Credit Calculator ---- */
TOOLS.push({
  id: "calc", tab: "credit", sub: "Episode Credit Calculator", title: "Episode Credit Calculator",
  intro: "Price an episode in credits before you render. Rate card: video 4 credits per second, still image 1, AI-composed score 10. Story, voices, captions and exports are free. Assumption: a re-rendered clip is billed at the video rate; line and voice fixes are free.",
  outLabel: "Episode Cost", savedLabel: "Episode Costs",
  fields: [
    { k: "plan", label: "Plan", type: "select", opts: planOpts, def: "1000" },
    { k: "left", label: "Credits left (blank = full plan)", type: "number", def: "", placeholder: "Full plan balance" },
    { k: "scenes", label: "Scenes", type: "number", def: "6" },
    { k: "secs", label: "Seconds per scene", type: "number", def: "5" },
    { k: "stills", label: "Stills per scene", type: "number", def: "1" },
    { k: "redo", label: "Clips to re-render", type: "number", def: "1" },
    { k: "score", label: "AI-composed score", type: "select", opts: [["no", "No (free)"], ["yes", "Yes (10 credits)"]], def: "no" },
  ],
  compute: computeCredits,
  render(r) {
    return `<div class="big-num">${fmt(r.total)} credits</div>
      <div class="big-sub">per episode · about ${money(r.episodeDollars)} at the ${r.plan.name} price (${(r.creditPrice * 100).toFixed(1)}¢ per credit)</div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Line</th><th>Working</th><th class="num">Credits</th></tr></thead><tbody>
        <tr><td>Video</td><td>${fmt(r.scenes)} scenes × ${fmt(r.secs)} s × ${RATE_VIDEO}</td><td class="num">${fmt(r.video)}</td></tr>
        <tr><td>Stills</td><td>${fmt(r.scenes)} scenes × ${fmt(r.stills)} × ${RATE_STILL}</td><td class="num">${fmt(r.stillsC)}</td></tr>
        <tr><td>Re-renders</td><td>${fmt(r.redo)} clips × ${fmt(r.secs)} s × ${RATE_VIDEO}</td><td class="num">${fmt(r.redoC)}</td></tr>
        <tr><td>AI-composed score</td><td>${r.score ? "included" : "not used"}</td><td class="num">${fmt(r.scoreC)}</td></tr>
        <tr class="total"><td>Total</td><td></td><td class="num">${fmt(r.total)}</td></tr></tbody></table></div>
      <div class="stat-grid">
        ${statHtml("% of balance", fmt(r.pct, 1) + "%", `of ${fmt(r.balance)} credits${r.usedFullPlan ? " (full plan)" : ""}`)}
        ${statHtml("Episodes left", fmt(r.episodesLeft), "at this episode size")}
        ${statHtml("Video your balance buys", fmt(r.secondsBuys) + " s", "at 4 credits per second")}
      </div>
      <p class="note">Rate card used: 4 credits per second of video. Vendor pages are inconsistent about what 1,000 credits buys (5, 10 or 15 second clips); only 5 seconds matches the rate card (1,000 credits = 250 seconds).</p>`;
  },
  text(r) {
    return `Episode credit estimate (${r.plan.name})\nTotal: ${r.total} credits\nVideo ${r.video} + stills ${r.stillsC} + re-renders ${r.redoC} + score ${r.scoreC}\n${fmt(r.pct, 1)}% of ${r.balance} credits · ${r.episodesLeft} episodes left · ${r.secondsBuys} s of video buys`;
  },
  entry: (r) => ({ name: `${r.total} credits · ${r.scenes}×${r.secs}s`, meta: `${r.plan.name}, ${r.episodesLeft} episodes left` }),
  publish: (r) => ({ plan: r.plan.key, balance: r.balance, creditsPerEpisode: r.total, creditPrice: r.creditPrice }),
});

/* ---- 1b Plan & Runway Comparator ---- */
TOOLS.push({
  id: "comparator", tab: "credit", sub: "Plan & Runway Comparator", title: "Plan & Runway Comparator",
  intro: "How far do credits go at your pace? A comparison only, never a nudge to upgrade. Credits are one-time, with no monthly top-up. Note that Elite adds 2,500 credits for $47 (about 1.9¢ per credit) versus 3.7¢ per credit on the front end.",
  outLabel: "Plan Comparison", savedLabel: "Comparisons",
  fields: [
    { k: "eps", label: "Episodes per month", type: "number", def: "4" },
    { k: "secs", label: "Seconds per episode", type: "number", def: "30" },
    { k: "cpe", label: "Credits per episode", type: "number", def: "146" },
    { k: "months", label: "Months credits should last", type: "number", def: "3" },
  ],
  pulls: [{ label: "Pull credits per episode", get: () => { const s = getShared(); return s.creditsPerEpisode != null ? { cpe: s.creditsPerEpisode } : null; } }],
  compute: computeComparator,
  render(r) {
    const cards = r.tiers.map((t) => `<div class="tier-card${r.best && r.best.key === t.key ? " is-pick" : ""}">
      <h3>${t.name}</h3><div class="price">${money(t.price)}</div>
      <dl><dt>Credits</dt><dd>${fmt(t.credits)}</dd>
      <dt>Cents per credit</dt><dd>${t.centsPerCredit.toFixed(2)}¢</dd>
      <dt>Episodes covered</dt><dd>${fmt(t.covered)}</dd>
      <dt>Months of runway</dt><dd>${t.runway == null ? "n/a" : t.runway.toFixed(1)}</dd>
      <dt>Shortfall for ${fmt(r.months)} months</dt><dd>${t.shortfall > 0 ? `<span class="neg">${fmt(t.shortfall)} credits short</span>` : "None"}</dd>
      <dt>Cost per finished minute</dt><dd>${t.perMinute == null ? "n/a" : money(t.perMinute)}</dd></dl></div>`).join("");
    const verdict = r.need <= 0 ? "Enter episodes, credits and months to compare."
      : r.best ? `Smallest tier that covers ${fmt(r.months)} months (${fmt(r.need)} credits): <strong>${r.best.name}</strong>.`
      : `No tier covers ${fmt(r.months)} months at this pace (${fmt(r.need)} credits needed).`;
    return `<div class="tier-grid">${cards}</div><div class="callout">${verdict}</div>
      <p class="note">You need ${fmt(r.monthly)} credits per month at this pace. Elite adds 2,500 credits for $47 (about 1.9¢ per credit); the front end is 3.7¢ per credit. Bundle includes all upgrades and bonuses. Credits are one-time; there is no monthly top-up. This is a comparison, not a recommendation to upgrade.</p>`;
  },
  text(r) {
    return `Plan comparison (${r.eps} episodes/month × ${r.cpe} credits, ${r.months} months = ${r.need} credits)\n` +
      r.tiers.map((t) => `${t.name} ${money(t.price)}: ${t.centsPerCredit.toFixed(2)}¢/credit, ${t.covered} episodes, ${t.runway == null ? "n/a" : t.runway.toFixed(1)} months, short ${t.shortfall}, ${t.perMinute == null ? "n/a" : money(t.perMinute)}/finished minute`).join("\n");
  },
  entry: (r) => ({ name: `${r.eps}/month × ${r.cpe} credits`, meta: r.best ? `${r.best.name} covers ${r.months} months` : "No tier covers target" }),
});

/* ---- 1c Credit Ledger ---- */
TOOLS.push({
  id: "ledger", tab: "credit", sub: "Credit Ledger", title: "Credit Ledger",
  intro: "Log what each finished episode really cost and compare it with your estimate. The balance starts from the calculator unless you type your own.",
  outLabel: "Ledger", savedLabel: "Ledger Snapshots",
  fields: [{ k: "start", label: "Starting balance", type: "number", def: "", placeholder: "Blank = calculator balance" }],
  pulls: [{ label: "Pull balance from calculator", get: () => { const s = getShared(); return s.balance != null ? { start: s.balance } : null; } }],
  rows: {
    addLabel: "Add Entry",
    cols: [
      { k: "name", label: "Episode name", type: "text", wide: true },
      { k: "est", label: "Estimated credits", type: "number" },
      { k: "act", label: "Actual credits", type: "number" },
    ],
    make(vals) {
      const name = (vals.name || "").trim();
      if (!name) return { error: "Add an episode name" };
      const est = String(vals.est).trim() === "" ? null : num(vals.est, null);
      const act = String(vals.act).trim() === "" ? null : num(vals.act, null);
      if (act == null) return { error: "Add the actual credits" };
      return { row: { name, est, act } };
    },
    label: (r) => `${r.name}: est ${r.est == null ? "—" : fmt(r.est)}, actual ${fmt(r.act)}`,
  },
  compute: (v) => computeLedger(v),
  render(r) {
    if (!r.count) return `<div class="big-num">${fmt(r.balance)} credits</div><div class="big-sub">starting balance — add an entry to begin</div>`;
    const body = r.rows.map((x) => `<tr><td>${esc(x.name)}</td><td class="num">${x.est == null ? "—" : fmt(x.est)}</td><td class="num">${fmt(x.act)}</td></tr>`).join("");
    return `<div class="big-num">${fmt(r.balance)} credits</div><div class="big-sub">balance after ${r.count} episode${r.count === 1 ? "" : "s"} (started at ${fmt(r.start)})</div>
      <div class="stat-grid">
        ${statHtml("Estimate variance", r.variancePct == null ? "n/a" : (r.variancePct > 0 ? "+" : "") + r.variancePct.toFixed(1) + "%", "actual vs estimate")}
        ${statHtml("Average actual", r.avgActual == null ? "n/a" : fmt(r.avgActual, 1), "credits per episode")}
        ${statHtml("Episodes left", r.episodesLeft == null ? "n/a" : fmt(r.episodesLeft), "at real spend")}
      </div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Episode</th><th class="num">Estimated</th><th class="num">Actual</th></tr></thead><tbody>${body}</tbody></table></div>`;
  },
  text(r) {
    return `Credit ledger: balance ${r.balance} (start ${r.start})\n` + r.rows.map((x) => `${x.name}: est ${x.est == null ? "-" : x.est}, actual ${x.act}`).join("\n") +
      `\nVariance ${r.variancePct == null ? "n/a" : r.variancePct.toFixed(1) + "%"} · average actual ${r.avgActual == null ? "n/a" : r.avgActual.toFixed(1)} · episodes left ${r.episodesLeft == null ? "n/a" : r.episodesLeft}`;
  },
  canSave: (r) => r.count > 0,
  entry: (r) => ({ name: `Ledger · ${r.count} episode${r.count === 1 ? "" : "s"}`, meta: `balance ${fmt(r.balance)}` }),
});

/* ---- 2d Client Price Calculator ---- */
TOOLS.push({
  id: "price", tab: "quote", sub: "Client Price Calculator", title: "Client Price Calculator",
  intro: "Client type × deliverable × revisions × rush × usage gives a target price, with a lower and a premium option. The base prices are editable assumptions anchored near the vendor's sample payments (+$250 kids episode, +$150 bakery ad, +$400 church 4-episode series), not benchmarks.",
  outLabel: "Your Price", savedLabel: "Quotes",
  fields: [
    { k: "ctype", label: "Client type", type: "select", opts: ctypeOpts, def: "local" },
    { k: "deliv", label: "Deliverable", type: "select", opts: Object.entries(DELIVERABLES).map(([k, d]) => [k, d[0]]), def: "ad" },
    { k: "rounds", label: "Revision rounds", type: "number", def: "2", hint: "+10% for each round beyond the first." },
    { k: "rush", label: "Rush delivery (+25%)", type: "checkbox", def: false },
    { k: "ads", label: "Paid ads usage (+35%)", type: "checkbox", def: false },
    { type: "title", label: "Your costs" },
    { k: "cpv", label: "Credits per video", type: "number", def: "146" },
    { k: "cpc", label: "Cost per credit ($)", type: "number", def: "0.037", step: "any" },
    { k: "hours", label: "Hours you'll spend", type: "number", def: "3" },
    { type: "title", label: "Base prices (editable assumptions)" },
    { k: "pAd", label: "30-second ad ($)", type: "number", def: "150" },
    { k: "pEp", label: "1-2 minute episode ($)", type: "number", def: "250" },
    { k: "pSeries", label: "4-episode series ($)", type: "number", def: "600" },
    { k: "pShorts", label: "Shorts pack of 5 ($)", type: "number", def: "200" },
  ],
  pulls: [
    { label: "Pull credits per episode", get: () => { const s = getShared(); return s.creditsPerEpisode != null ? { cpv: s.creditsPerEpisode } : null; } },
    { label: "Pull cost per credit", get: () => { const s = getShared(); return s.creditPrice != null ? { cpc: Math.round(s.creditPrice * 10000) / 10000 } : null; } },
  ],
  compute: computePrice,
  render(r) {
    return `<div class="big-num">${money(r.target)}</div>
      <div class="big-sub">target price · ${esc(r.typeName)} · ${esc(r.delivName)}</div>
      <div class="stat-grid">
        ${statHtml("Low option", money(r.low), "0.8 × target")}
        ${statHtml("Target", money(r.target), "rounded to $5")}
        ${statHtml("Premium option", money(r.premium), "1.35 × target")}
      </div>
      <div class="table-wrap"><table class="data"><tbody>
        <tr><td>Base price</td><td class="num">${money(r.base)}</td></tr>
        <tr><td>Client type multiplier</td><td class="num">× ${r.typeMult.toFixed(1)}</td></tr>
        <tr><td>Revisions (${r.rounds} round${r.rounds === 1 ? "" : "s"})</td><td class="num">× ${r.revF.toFixed(2)}</td></tr>
        <tr><td>Rush</td><td class="num">× ${r.rushF.toFixed(2)}</td></tr>
        <tr><td>Paid ads usage</td><td class="num">× ${r.adsF.toFixed(2)}</td></tr></tbody></table></div>
      <div class="stat-grid">
        ${statHtml("Credit cost", money(r.cost), `${fmt(r.credits)} credits`)}
        ${statHtml("Margin", money(r.margin), fmt(r.marginPct, 1) + "% of target")}
        ${statHtml("Hourly rate", r.hourly == null ? "n/a" : money(r.hourly), `margin over ${fmt(r.hours, 1)} hours`)}
        ${statHtml("Target ÷ cost", r.multiple == null ? "n/a" : fmt(r.multiple, 1) + "×", "price vs credit cost")}
      </div>
      <p class="note">Rounded to the nearest $5. Hourly rate is margin after credit cost divided by your hours. Adjust the base prices to your market.</p>`;
  },
  text(r) {
    return `Quote: ${r.typeName}, ${r.delivName}\nTarget ${money(r.target)} (low ${money(r.low)}, premium ${money(r.premium)})\nCredit cost ${money(r.cost)}, margin ${money(r.margin)} (${fmt(r.marginPct, 1)}%), hourly ${r.hourly == null ? "n/a" : money(r.hourly)}`;
  },
  entry: (r) => ({ name: `${r.typeName} · ${money(r.target)}`, meta: r.delivName }),
  publish: (r) => ({ lastQuote: { target: r.target, low: r.low, premium: r.premium, type: r.typeName, deliverable: r.delivName } }),
});

/* ---- 2e Package & Proposal Builder ---- */
TOOLS.push({
  id: "proposal", tab: "quote", sub: "Package & Proposal Builder", title: "Package & One-Page Proposal Builder",
  intro: "Three packages built from one single-video price, laid out as a printable one-page scope-and-price sheet. It is not a contract and not legal advice.",
  outLabel: "Proposal", savedLabel: "Proposals", print: true,
  fields: [
    { k: "me", label: "Your name / studio", type: "text", def: "" },
    { k: "contact", label: "Client contact", type: "text", def: "" },
    { k: "biz", label: "Client business", type: "text", def: "" },
    { k: "purpose", label: "What the videos are for", type: "text", def: "", placeholder: "e.g. social media promotion" },
    { k: "vtype", label: "Video type", type: "select", opts: Object.entries(VIDEO_TYPES), def: "ad" },
    { k: "price", label: "Single-video price ($)", type: "number", def: "150" },
    { k: "terms", label: "Payment terms", type: "select", opts: Object.entries(TERMS), def: "split" },
    { k: "date", label: "Proposal date", type: "date", def: "", optional: true },
  ],
  pulls: [{ label: "Pull price from Client Price Calculator", get: () => { const s = getShared(); return s.lastQuote ? { price: s.lastQuote.target } : null; } }],
  compute: computeProposal,
  render(r, v) {
    const me = esc((v.me || "").trim() || "Your studio"), contact = esc((v.contact || "").trim() || "Client contact"), biz = esc((v.biz || "").trim() || "Client business");
    const purpose = (v.purpose || "").trim();
    return `<div class="paper">
      <h2>Video Package Proposal</h2>
      <p class="paper-meta">Prepared by ${me} for ${contact}, ${biz}${v.date ? " · " + esc(v.date) : ""}</p>
      <p>${purpose ? `Purpose: short animated videos for ${esc(purpose)}.` : "Purpose: short animated videos for your business."} Format: ${esc(r.typeName)}. Before anything is animated you will review and approve a storyboard of still frames.</p>
      <div class="pk-grid">
        <div class="pk"><span class="tag">Good</span><div class="pk-price">${money(r.good.total)}</div>
          <ul><li>1 video</li><li>1 format</li><li>1 revision</li></ul></div>
        <div class="pk rec"><span class="tag">Better · Recommended</span><div class="pk-price">${money(r.better.total)}</div>
          <ul><li>4 videos (15% off, ${money(r.better.perVideo)} each)</li><li>All 3 formats: 16:9, 9:16, 1:1</li><li>2 revisions</li></ul></div>
        <div class="pk"><span class="tag">Best · Monthly retainer</span><div class="pk-price">${money(r.best.monthly)} / month</div>
          <ul><li>4 videos per month for 3 months</li><li>25% off per video (${money(r.best.perVideo)} each)</li><li>${money(r.best.total)} over the 3 months</li></ul></div>
      </div>
      <p><strong>Payment terms:</strong> ${esc(r.terms)}.</p>
      <p><strong>Delivery:</strong> HD MP4, no watermark, produced under RocketToons' commercial license.</p>
      <p class="fine">This is a scope-and-price sheet only. It is not a contract and is not legal advice. To proceed, reply with the package you choose.</p>
    </div>`;
  },
  text(r, v) {
    return `Video package proposal for ${(v.biz || "").trim() || "client"} (${r.typeName})\nGood: ${money(r.good.total)} — 1 video, 1 format, 1 revision\nBetter (recommended): ${money(r.better.total)} — 4 videos at 15% off, 16:9 + 9:16 + 1:1, 2 revisions\nBest: ${money(r.best.monthly)}/month — 4 videos/month for 3 months at 25% off per video (${money(r.best.total)} total)\nPayment terms: ${r.terms}\nHD MP4, no watermark, produced under RocketToons' commercial license. Scope-and-price sheet only; not a contract, not legal advice.`;
  },
  entry: (r, v) => ({ name: `${(v.biz || "").trim() || "Proposal"} · ${money(r.better.total)}`, meta: `${r.typeName}, single ${money(r.price)}` }),
});

/* ---- 2f Pitch & Objection Writer ---- */
TOOLS.push({
  id: "pitch", tab: "quote", sub: "Pitch & Objection Writer", title: "Pitch & Objection Writer",
  intro: "A first message, a day-3 follow-up, a day-7 nudge and four objection replies, tailored to the client type. It always mentions the storyboard-of-stills approval before anything animates.",
  outLabel: "Messages", savedLabel: "Pitches",
  fields: [
    { k: "me", label: "Your name", type: "text", def: "" },
    { k: "first", label: "Client first name", type: "text", def: "" },
    { k: "biz", label: "Business name", type: "text", def: "" },
    { k: "ctype", label: "Client type", type: "select", opts: Object.entries(CLIENT_TYPES).map(([k, t]) => [k, t[0]]), def: "local" },
    { k: "offer", label: "What you're offering", type: "text", def: "a 30-second animated ad" },
    { k: "price", label: "Price ($)", type: "number", def: "150" },
    { k: "channel", label: "Message type", type: "select", opts: [["email", "Email"], ["dm", "DM"]], def: "email" },
    { k: "noticed", label: "Something you noticed (optional)", type: "text", def: "", placeholder: "e.g. your bakery posts every morning" },
  ],
  compute: computePitch,
  render(r) {
    const m = (h, t) => `<div class="msg"><h3>${h}</h3><p>${esc(t)}</p></div>`;
    return m(r.email ? "First message (email)" : "First message (DM)", r.first_msg) + m("Day-3 follow-up", r.day3) + m("Day-7 nudge", r.day7) +
      r.objections.map((o) => m("Objection · " + o.label, o.text)).join("");
  },
  text(r) {
    return [r.first_msg, "--- Day 3 ---\n" + r.day3, "--- Day 7 ---\n" + r.day7, ...r.objections.map((o) => `--- ${o.label} ---\n${o.text}`)].join("\n\n");
  },
  entry: (r, v) => ({ name: `${(v.biz || "").trim() || "Pitch"} · ${r.email ? "Email" : "DM"}`, meta: r.typeLabel }),
});

/* ---- 3g Slice-to-Income Reality Check ---- */
TOOLS.push({
  id: "reality", tab: "runway", sub: "Slice-to-Income Reality Check", title: "Slice-to-Income Reality Check",
  intro: "What would a tiny slice of the 66.5B views (Pinkfong, 2025) pay, and how many views per episode would your monthly goal really need?",
  outLabel: "Reality Check", savedLabel: "Reality Checks",
  fields: [
    { k: "niche", label: "Niche", type: "select", opts: Object.entries(NICHES).map(([k, n]) => [k, `${n[0]} (RPM x${n[1].toFixed(1)})`]), def: "faith" },
    { k: "epw", label: "Episodes per week", type: "number", def: "2" },
    { k: "goal", label: "Monthly income goal ($)", type: "number", def: "1000" },
    { type: "title", label: "View mix (%), normalised to 100" },
    { k: "mYT", label: "YouTube long-form (%)", type: "number", def: "40" },
    { k: "mSH", label: "YouTube Shorts (%)", type: "number", def: "30" },
    { k: "mFB", label: "Facebook (%)", type: "number", def: "20" },
    { k: "mIG", label: "Instagram (%)", type: "number", def: "10" },
    { type: "title", label: "RPM per 1,000 views ($, editable)" },
    { k: "rYT", label: "YouTube long-form RPM ($)", type: "number", def: "2.00", step: "any" },
    { k: "rSH", label: "YouTube Shorts RPM ($)", type: "number", def: "0.05", step: "any" },
    { k: "rFB", label: "Facebook RPM ($)", type: "number", def: "0.60", step: "any" },
    { k: "rIG", label: "Instagram RPM ($)", type: "number", def: "0.10", step: "any" },
  ],
  compute: computeReality,
  render(r) {
    const rows = r.slices.map((s) => `<tr><td>${s.pct}%</td><td class="num">${fmt(s.views)}</td><td class="num">${money(s.yearly)}</td><td class="num">${money(s.monthly)}</td></tr>`).join("");
    return `<div class="disclaimer"><strong>Illustrative, not a promise.</strong> These numbers use sample RPMs. Replace the RPMs with your own analytics before you plan around them.</div>
      <div class="stat-grid">
        ${statHtml("Blended RPM", money(r.rpmEff), `per 1,000 views (${esc(r.nicheName)} ×${r.nicheMult.toFixed(1)})`)}
        ${statHtml("Views needed per year", r.reqYearly == null ? "n/a" : fmt(r.reqYearly), `for ${money(r.goal)}/month`)}
        ${statHtml("Share of 66.5B", r.reqPct == null ? "n/a" : r.reqPct.toFixed(4) + "%", "of the base views")}
        ${statHtml("Views per episode", r.perEpisode == null ? "n/a" : fmt(r.perEpisode), `at ${fmt(r.epw, 1)} episodes/week`)}
      </div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Slice of 66.5B</th><th class="num">Views per year</th><th class="num">Revenue / year</th><th class="num">Revenue / month</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="note">Base: 66.5B views (Pinkfong, 2025). View mix is normalised, so it does not need to add up to 100.</p>`;
  },
  text(r) {
    return `Slice-to-income reality check (illustrative, not a promise; replace RPMs with your own analytics)\nBlended RPM ${money(r.rpmEff)} per 1,000 views (${r.nicheName})\n` +
      r.slices.map((s) => `${s.pct}% of 66.5B = ${fmt(s.views)} views = ${money(s.yearly)}/year`).join("\n") +
      `\nGoal ${money(r.goal)}/month needs ${r.reqYearly == null ? "n/a" : fmt(r.reqYearly)} views/year (${r.reqPct == null ? "n/a" : r.reqPct.toFixed(4)}% of 66.5B) = ${r.perEpisode == null ? "n/a" : fmt(r.perEpisode)} views per episode`;
  },
  entry: (r) => ({ name: `${r.nicheName} · ${money(r.goal)}/month goal`, meta: r.perEpisode == null ? "n/a" : `${fmt(r.perEpisode)} views per episode` }),
  publish: (r) => (r.perEpisode == null ? {} : { requiredViews: Math.round(r.perEpisode) }),
});

/* ---- 3h Series Cadence Planner ---- */
TOOLS.push({
  id: "cadence", tab: "runway", sub: "Series Cadence Planner", title: "Series Cadence Planner",
  intro: "A 12-week publishing grid that shows when your credits run out. Planning only: it does not post or schedule anything.",
  outLabel: "12-Week Plan", savedLabel: "Plans", print: true,
  fields: [
    { k: "start", label: "First publish date", type: "date", def: "2026-10-31" },
    { k: "epw", label: "Episodes per week", type: "number", def: "2" },
    { k: "cpe", label: "Credits per episode", type: "number", def: "146" },
    { k: "credits", label: "Credits you have now", type: "number", def: "1000" },
    { type: "group", label: "Formats", items: [{ k: "f169", label: "16:9", def: true }, { k: "f916", label: "9:16", def: true }, { k: "f11", label: "1:1", def: false }] },
    { type: "group", label: "Platforms", items: [{ k: "pYT", label: "YouTube", def: true }, { k: "pFB", label: "Facebook", def: false }, { k: "pIG", label: "Instagram", def: true }, { k: "pLI", label: "LinkedIn", def: false }] },
  ],
  pulls: [
    { label: "Pull credits per episode", get: () => { const s = getShared(); return s.creditsPerEpisode != null ? { cpe: s.creditsPerEpisode } : null; } },
    { label: "Pull credits left", get: () => { const s = getShared(); return s.balance != null ? { credits: s.balance } : null; } },
  ],
  compute: computeCadence,
  render(r) {
    if (!r.startValid) return placeholder("Pick a first publish date to build the grid.");
    const rows = r.weeks.map((w) => `<tr><td>${w.week}</td><td>${w.eps.map((e) => `<div class="${e.ok ? "" : "bad"}">Ep ${e.k} · ${fmtDay(e.date)} · ${e.ok ? fmt(e.remaining) + " left" : "short " + fmt(-e.remaining)}</div>`).join("")}</td><td class="num">${w.posts}</td></tr>`).join("");
    const warn = r.firstBad
      ? `<p class="bad">First episode you cannot afford: Ep ${r.firstBad.k} on ${fmtDay(r.firstBad.date)} (${isoDay(r.firstBad.date)}, week ${r.firstBad.week}).</p>`
      : `<p>Your credits cover all ${r.totalEpisodes} episodes in the 12 weeks.</p>`;
    return `<div class="paper"><h2>12-Week Cadence Plan</h2>
      <p class="paper-meta">${r.n} episode${r.n === 1 ? "" : "s"} per week · ${fmt(r.cpe)} credits each · ${fmt(r.now)} credits now · 12 weeks would use ${fmt(r.totalCredits)} credits</p>
      ${warn}
      <p><strong>Posts per episode (${r.pairs.length}):</strong> ${r.pairs.length ? esc(r.pairs.join(" · ")) : "none selected"}</p>
      <div class="table-wrap"><table class="data"><thead><tr><th>Week</th><th>Episodes, date and credits remaining</th><th class="num">Posts</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="fine">Planning only. This does not post or schedule anything.</p></div>`;
  },
  text(r) {
    if (!r.startValid) return "Pick a first publish date.";
    return `12-week cadence: ${r.n}/week, ${r.cpe} credits each, ${r.now} credits now\nPosts per episode (${r.pairs.length}): ${r.pairs.join(", ") || "none"}\n` +
      r.weeks.map((w) => `Week ${w.week}: ` + w.eps.map((e) => `Ep ${e.k} ${isoDay(e.date)} (${e.ok ? e.remaining + " left" : "short " + -e.remaining})`).join("; ")).join("\n") +
      `\n${r.firstBad ? `First episode you cannot afford: Ep ${r.firstBad.k} on ${isoDay(r.firstBad.date)}` : "Credits cover all 12 weeks"}`;
  },
  entry: (r, v) => ({ name: `${r.n}/week from ${v.start || "no date"}`, meta: r.firstBad ? `runs out at Ep ${r.firstBad.k}` : "credits cover 12 weeks" }),
});

/* ---- 3i Channel Scoreboard ---- */
TOOLS.push({
  id: "scoreboard", tab: "runway", sub: "Channel Scoreboard", title: "Channel Scoreboard",
  intro: "Log what each episode actually did and get a verdict per series. Manual entry only; it does not replace the analytics you get with Elite.",
  outLabel: "Scoreboard", savedLabel: "Scoreboards",
  fields: [
    { k: "required", label: "Required views per episode", type: "number", def: "10000" },
    { k: "cpc", label: "Cost per credit ($)", type: "number", def: "0.037", step: "any" },
  ],
  pulls: [
    { label: "Pull required views per episode", get: () => { const s = getShared(); return s.requiredViews != null ? { required: s.requiredViews } : null; } },
    { label: "Pull cost per credit", get: () => { const s = getShared(); return s.creditPrice != null ? { cpc: Math.round(s.creditPrice * 10000) / 10000 } : null; } },
  ],
  rows: {
    addLabel: "Add Entry",
    cols: [
      { k: "series", label: "Series", type: "text", wide: true },
      { k: "platform", label: "Platform", type: "select", opts: [["YouTube", "YouTube"], ["Facebook", "Facebook"], ["Instagram", "Instagram"], ["LinkedIn", "LinkedIn"], ["Other", "Other"]] },
      { k: "date", label: "Date", type: "date" },
      { k: "views", label: "Views", type: "number" },
      { k: "credits", label: "Credits used", type: "number" },
    ],
    make(vals) {
      const series = (vals.series || "").trim();
      if (!series) return { error: "Add a series name" };
      if (String(vals.views).trim() === "" || String(vals.credits).trim() === "") return { error: "Add views and credits" };
      return { row: { series, platform: vals.platform || "YouTube", date: vals.date || "", views: Math.max(0, num(vals.views)), credits: Math.max(0, num(vals.credits)) } };
    },
    label: (r) => `${r.series} · ${r.platform} · ${r.date || "no date"}: ${fmt(r.views)} views, ${fmt(r.credits)} credits`,
  },
  compute: computeScoreboard,
  render(r) {
    if (!r.series.length) return placeholder("Add an entry to see a verdict per series. Fewer than 3 episodes shows Too early.");
    const cls = { "Too early": "early", Keep: "keep", Change: "change", Stop: "stop" };
    const rows = r.series.map((s) => `<tr><td>${esc(s.series)}</td><td class="num">${s.count}</td><td class="num">${fmt(s.avgViews)}</td><td class="num">${fmt(s.avgCredits, 1)}</td><td class="num">${s.costPer1k == null ? "n/a" : money(s.costPer1k)}</td><td><span class="pill ${cls[s.verdict]}">${s.verdict}</span></td></tr>`).join("");
    return `<div class="table-wrap"><table class="data"><thead><tr><th>Series</th><th class="num">Episodes</th><th class="num">Avg views</th><th class="num">Avg credits</th><th class="num">Cost / 1,000 views</th><th>Verdict</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="note">Verdicts compare average views with your required ${fmt(r.required)} views per episode: Too early (fewer than 3 episodes), Keep (at or above 100%), Change (40% to 99%), Stop (under 40%).</p>`;
  },
  text(r) {
    return `Channel scoreboard (required ${r.required} views/episode)\n` + r.series.map((s) => `${s.series}: ${s.count} episodes, avg ${Math.round(s.avgViews)} views, ${s.avgCredits.toFixed(1)} credits, ${s.costPer1k == null ? "n/a" : money(s.costPer1k)} per 1,000 views — ${s.verdict}`).join("\n");
  },
  canSave: (r) => r.rowCount > 0,
  entry: (r) => ({ name: `Scoreboard · ${r.series.length} series`, meta: `${r.rowCount} episode${r.rowCount === 1 ? "" : "s"} logged` }),
});

/* ---------- tool builder ---------- */
function flatFields(spec) {
  const out = [];
  spec.fields.forEach((f) => {
    if (f.type === "group") f.items.forEach((i) => out.push({ k: i.k, type: "checkbox", def: i.def }));
    else if (f.k) out.push(f);
  });
  return out;
}

function fieldHtml(spec, f) {
  if (f.type === "title") return `<div class="group-title">${f.label}</div>`;
  if (f.type === "group") {
    return `<fieldset class="field"><legend>${f.label}</legend>${f.items.map((i) => `<label class="check"><input type="checkbox" data-f="${i.k}" /> ${i.label}</label>`).join("")}</fieldset>`;
  }
  const id = `f-${spec.id}-${f.k}`;
  if (f.type === "checkbox") return `<div class="field"><label class="check" for="${id}"><input type="checkbox" id="${id}" data-f="${f.k}" /> ${f.label}</label></div>`;
  const label = `<label for="${id}">${f.label}${f.optional ? ' <span class="optional">(optional)</span>' : ""}</label>`;
  const hint = f.hint ? `<p class="hint">${f.hint}</p>` : "";
  if (f.type === "select") return `<div class="field">${label}<select id="${id}" data-f="${f.k}">${f.opts.map((o) => `<option value="${o[0]}">${o[1]}</option>`).join("")}</select>${hint}</div>`;
  return `<div class="field">${label}<input id="${id}" data-f="${f.k}" type="${f.type}"${f.type === "number" ? ` step="${f.step || "any"}" inputmode="decimal"` : ""}${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ""} />${hint}</div>`;
}

function buildTool(spec) {
  const sec = document.createElement("section");
  sec.className = "subpanel";
  sec.id = "sub-" + spec.id;
  const rowsHtml = spec.rows ? `<div class="rows-box"><div class="rows-add">${spec.rows.cols.map((c) => {
    const id = `r-${spec.id}-${c.k}`;
    const input = c.type === "select" ? `<select id="${id}" data-r="${c.k}">${c.opts.map((o) => `<option value="${o[0]}">${o[1]}</option>`).join("")}</select>` : `<input id="${id}" data-r="${c.k}" type="${c.type}"${c.type === "number" ? ' step="any" inputmode="decimal"' : ""} />`;
    return `<div class="${c.wide ? "wide" : ""}"><label for="${id}">${c.label}</label>${input}</div>`;
  }).join("")}<div class="wide"><button type="button" class="primary-btn" data-act="addrow">${spec.rows.addLabel}</button></div></div><div class="rows-list" data-rows-list></div></div>` : "";
  sec.innerHTML = `
    <div class="tool-intro"><h2>${spec.title}</h2><p>${spec.intro}</p></div>
    <div class="workspace">
      <div class="form-card">
        ${spec.fields.map((f) => fieldHtml(spec, f)).join("")}
        ${spec.pulls ? `<div class="pull-row">${spec.pulls.map((p, i) => `<button type="button" class="ghost-btn" data-pull="${i}">${p.label}</button>`).join("")}</div>` : ""}
        ${rowsHtml}
      </div>
      <div class="out-col">
        <div class="output-card">
          <div class="output-head"><span class="output-label">${spec.outLabel}</span>
            <div class="output-actions"><button type="button" class="ghost-btn" data-act="save">Save</button><button type="button" class="ghost-btn" data-act="copy">Copy</button>${spec.print ? '<button type="button" class="ghost-btn" data-act="print">Print</button>' : ""}</div></div>
          <div class="out-body" data-out aria-live="polite"></div>
        </div>
        <div class="output-card saved-card"><div class="output-head"><span class="output-label">Saved ${spec.savedLabel}</span></div><div class="saved-list" data-saved></div></div>
      </div>
    </div>`;

  const st = { vals: null, res: null, rows: [] };
  const fields = flatFields(spec);
  const outEl = sec.querySelector("[data-out]");
  const autoKey = `${KEY}_auto_${spec.id}`;

  function read() {
    const vals = {};
    fields.forEach((f) => {
      const el = sec.querySelector(`[data-f="${f.k}"]`);
      vals[f.k] = el.type === "checkbox" ? el.checked : el.value;
    });
    if (spec.rows) vals.rows = st.rows.map((r) => Object.assign({}, r));
    return vals;
  }
  function write(vals) {
    fields.forEach((f) => {
      const el = sec.querySelector(`[data-f="${f.k}"]`);
      const v = vals && f.k in vals ? vals[f.k] : f.def;
      if (el.type === "checkbox") el.checked = !!v; else el.value = v == null ? "" : v;
    });
    if (spec.rows) st.rows = ((vals && vals.rows) || []).map((r) => Object.assign({}, r));
  }
  function renderRows() {
    if (!spec.rows) return;
    const list = sec.querySelector("[data-rows-list]");
    list.innerHTML = st.rows.map((r, i) => `<div class="row-item"><span>${esc(spec.rows.label(r))}</span><button type="button" class="ghost-btn" data-remove="${i}">Remove</button></div>`).join("");
  }
  function update(persist = true) {
    st.vals = read();
    st.res = spec.compute(st.vals);
    outEl.innerHTML = spec.render(st.res, st.vals);
    renderRows();
    if (persist) { try { localStorage.setItem(autoKey, JSON.stringify(st.vals)); } catch (e) { /* ignore */ } }
    if (spec.publish) setShared(spec.publish(st.res, st.vals));
  }

  const saveable = initSaveable({
    toolId: spec.id,
    listEl: sec.querySelector("[data-saved]"),
    getEntry: () => {
      if (!st.res || (spec.canSave && !spec.canSave(st.res, st.vals))) return null;
      const e = spec.entry(st.res, st.vals);
      return { name: e.name, meta: e.meta, payload: st.vals };
    },
    applyEntry: (payload) => { write(payload); update(); },
  });

  sec.addEventListener("input", () => update());
  sec.addEventListener("change", () => update());
  sec.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button");
    if (!btn || btn.closest("[data-saved]")) return;
    const act = btn.dataset.act;
    if (act === "save") saveable.save();
    else if (act === "copy") copyText(spec.text(st.res, st.vals));
    else if (act === "print") window.print();
    else if (act === "addrow") {
      const vals = {};
      spec.rows.cols.forEach((c) => { vals[c.k] = sec.querySelector(`[data-r="${c.k}"]`).value; });
      const made = spec.rows.make(vals);
      if (made.error) { showToast(made.error); return; }
      st.rows.push(made.row);
      spec.rows.cols.forEach((c) => { if (c.type !== "select" && c.type !== "date") sec.querySelector(`[data-r="${c.k}"]`).value = ""; });
      update();
    } else if (btn.dataset.remove != null) {
      st.rows.splice(Number(btn.dataset.remove), 1);
      update();
    } else if (btn.dataset.pull != null) {
      const patch = spec.pulls[Number(btn.dataset.pull)].get();
      if (!patch) { showToast("Nothing to pull yet"); return; }
      Object.keys(patch).forEach((k) => { sec.querySelector(`[data-f="${k}"]`).value = patch[k]; });
      update();
      showToast("Pulled");
    }
  });

  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(autoKey)); } catch (e) { stored = null; }
  write(stored);
  update(false);
  return sec;
}

function initTools() {
  const byTab = {};
  TOOLS.forEach((t) => { (byTab[t.tab] = byTab[t.tab] || []).push(t); });
  Object.keys(byTab).forEach((tab) => {
    const panel = document.getElementById("panel-" + tab);
    const subtabs = panel.querySelector(".subtabs"), holder = panel.querySelector(".subpanels");
    byTab[tab].forEach((spec, i) => {
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "seg-btn" + (i === 0 ? " is-active" : ""); btn.dataset.sub = spec.id;
      btn.setAttribute("role", "tab"); btn.textContent = spec.sub;
      subtabs.appendChild(btn);
      const sec = buildTool(spec);
      if (i === 0) sec.classList.add("is-active");
      holder.appendChild(sec);
    });
    subtabs.addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-sub]");
      if (!b) return;
      subtabs.querySelectorAll(".seg-btn").forEach((x) => x.classList.toggle("is-active", x === b));
      holder.querySelectorAll(".subpanel").forEach((p) => p.classList.toggle("is-active", p.id === "sub-" + b.dataset.sub));
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initGate();
  initTheme();
  initTabs();
  initTools();
});
