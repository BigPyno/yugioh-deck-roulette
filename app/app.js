/* Deck Roulette - app locale (nessun server richiesto) */
(() => {
  "use strict";
  const DATA = window.DECK_DATA;
  const CARDS = DATA.cards; // id -> [nome, tipo, inMasterDuel]
  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;

  // ---------- persistenza leggera (facoltativa) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("dr:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("dr:" + k, JSON.stringify(v)); } catch { /* ignora */ } },
  };

  const state = {
    game: store.get("game", "TF5"),
    mode: store.get("mode", "char"),
    onlyMd: store.get("onlyMd", false),
    noRepeat: store.get("noRepeat", false),
    ydkOnlyMd: store.get("ydkOnlyMd", true),
    speedSwap: store.get("speedSwap", true),
    lvMin: 1, lvMax: 10,
    excluded: store.get("excluded", {}), // game -> [personaggi esclusi]
    drawn: new Set(store.get("drawn", [])),
    history: store.get("history", []),
    stage: "start", // start | deck
    pickedChar: null,
    items: [],
    rot: 0,
    spinning: false,
    current: null,
  };

  const gameByCode = Object.fromEntries(DATA.games.map((g) => [g.code, g]));
  if (!gameByCode[state.game]) state.game = "TF5";
  const deckKey = (g, d) => [g, d.p, d.n, d.l || "", d.v || ""].join("|");

  // ---------- utilità carte ----------
  function rowInfo(r) {
    const [key, q, z] = r;
    if (typeof key === "number") {
      const c = CARDS[key];
      return { id: key, name: c[0], type: c[1], md: !!c[2], q, z, fake: false };
    }
    const altId = r[3] || null;
    return { id: null, name: key, type: "Carta esclusiva del videogioco", md: false, q, z, fake: true,
      alt: altId ? { id: altId, name: CARDS[altId][0], md: !!CARDS[altId][2] } : null };
  }
  const deckRows = (d) => d.k.map(rowInfo);
  const fullyMd = (d) => d.k.every((r) => typeof r[0] === "number" && CARDS[r[0]][2]);
  const lvNum = (d) => { const m = /\d+/.exec(d.l || ""); return m ? +m[0] : null; };
  function category(c) {
    if (c.z === "e") return "extra";
    if (/Spell/i.test(c.type)) return "spell";
    if (/Trap/i.test(c.type)) return "trap";
    if (c.fake) return "fake";
    return "monster";
  }

  // ---------- filtri ----------
  function eligibleDecks(g) {
    const game = gameByCode[g];
    const ex = new Set(state.excluded[g] || []);
    return game.decks
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => {
        if (ex.has(d.c)) return false;
        const lv = lvNum(d);
        if (lv != null && (lv < state.lvMin || lv > state.lvMax)) return false;
        if (state.onlyMd && !fullyMd(d)) return false;
        if (state.noRepeat && state.drawn.has(deckKey(g, d))) return false;
        return true;
      });
  }

  function deckLabel(d, withChar) {
    let s = withChar ? d.c + " · " + d.n : d.n;
    const extra = [d.v, d.l ? "Lv " + d.l : null].filter(Boolean).join(", ");
    return extra ? s + " (" + extra + ")" : s;
  }

  function buildItems() {
    const el = eligibleDecks(state.game);
    if (state.mode === "deck") {
      state.items = el.map(({ d, i }) => ({ label: deckLabel(d, true), short: d.c, deck: i }));
    } else if (state.stage === "deck" && state.pickedChar) {
      state.items = el.filter(({ d }) => d.c === state.pickedChar)
        .map(({ d, i }) => ({ label: deckLabel(d, false), short: d.n, deck: i }));
    } else {
      const counts = new Map();
      el.forEach(({ d }) => counts.set(d.c, (counts.get(d.c) || 0) + 1));
      state.items = [...counts.keys()].sort((a, b) => a.localeCompare(b))
        .map((c) => ({ label: c, short: c, char: c, n: counts.get(c) }));
    }
  }

  // ---------- ruota ----------
  const canvas = $("wheel");
  const ctx = canvas.getContext("2d");
  function sizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const px = Math.round(canvas.clientWidth * dpr) || 560;
    if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
  }
  function sliceColor(i, n) {
    const hue = (i * 360 / Math.min(n, 24) + (i % 2 ? 0 : 8)) % 360;
    return `hsl(${hue} ${i % 2 ? 48 : 58}% ${i % 2 ? 30 : 38}%)`;
  }
  function drawWheel() {
    sizeCanvas();
    const W = canvas.width, R = W / 2, r = R - W * 0.03;
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.translate(R, R);
    // bordo
    ctx.beginPath(); ctx.arc(0, 0, R - 2, 0, TAU);
    ctx.fillStyle = "#2a2131"; ctx.fill();
    ctx.lineWidth = W * 0.012; ctx.strokeStyle = "#e3b54a"; ctx.stroke();
    const n = state.items.length;
    if (!n) {
      ctx.fillStyle = "#9d93a8"; ctx.font = `${W * 0.035}px Segoe UI, sans-serif`;
      ctx.textAlign = "center"; ctx.fillText("Nessun deck con questi filtri", 0, -W * 0.18);
      ctx.restore(); return;
    }
    const seg = TAU / n;
    for (let i = 0; i < n; i++) {
      const a0 = state.rot + i * seg - Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, a0, a0 + seg); ctx.closePath();
      ctx.fillStyle = n === 1 ? "hsl(350 55% 35%)" : sliceColor(i, n); ctx.fill();
      if (n <= 120) { ctx.strokeStyle = "#0d0b1088"; ctx.lineWidth = 1; ctx.stroke(); }
    }
    // etichette solo se lo spicchio è abbastanza largo
    const fs = Math.min(W * 0.034, Math.max(W * 0.016, seg * r * 0.55));
    if (seg * r >= W * 0.02 || n <= 40) {
      ctx.fillStyle = "#fff"; ctx.font = `600 ${fs}px Segoe UI, sans-serif`;
      ctx.textAlign = "right"; ctx.textBaseline = "middle";
      const maxW = r * 0.68;
      for (let i = 0; i < n; i++) {
        const a = state.rot + (i + 0.5) * seg - Math.PI / 2;
        ctx.save(); ctx.rotate(a);
        let t = n > 1 ? state.items[i].short : state.items[i].label;
        while (ctx.measureText(t).width > maxW && t.length > 3) t = t.slice(0, -2);
        if (t !== (n > 1 ? state.items[i].short : state.items[i].label)) t = t.trimEnd() + "…";
        ctx.shadowColor = "#000"; ctx.shadowBlur = 3;
        ctx.fillText(t, r - W * 0.025, 0);
        ctx.restore();
      }
    }
    // perni decorativi
    ctx.fillStyle = "#e3b54a";
    for (let i = 0; i < 24; i++) {
      const a = state.rot + i * TAU / 24;
      ctx.beginPath(); ctx.arc(Math.cos(a) * (R - W * 0.015), Math.sin(a) * (R - W * 0.015), W * 0.005, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  function indexAtPointer() {
    const n = state.items.length;
    if (!n) return -1;
    const seg = TAU / n;
    const a = ((-state.rot) % TAU + TAU) % TAU;
    return Math.floor(a / seg) % n;
  }
  function rand() {
    const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 2 ** 32;
  }
  function spin() {
    if (state.spinning) return;
    const n = state.items.length;
    if (!n) return;
    const target = Math.floor(rand() * n);
    const seg = TAU / n;
    const u = 0.15 + rand() * 0.7;
    const start = state.rot;
    const turns = 5 + Math.floor(rand() * 3);
    // rot finale tale che (-rot) mod 2π = (target+u)*seg
    let end = -(target + u) * seg;
    end += Math.ceil((start + turns * TAU - end) / TAU) * TAU;
    const dur = 5200 + rand() * 1600;
    const t0 = performance.now();
    state.spinning = true;
    $("spin").disabled = true;
    enterFocus(true);
    const ease = (t) => 1 - Math.pow(1 - t, 4);
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      state.rot = start + (end - start) * ease(t);
      drawWheel();
      const it = state.items[indexAtPointer()];
      $("ticker").textContent = it ? it.label : "";
      if (t < 1) requestAnimationFrame(frame);
      else { state.spinning = false; $("spin").disabled = false; landed(state.items[target]); }
    };
    requestAnimationFrame(frame);
  }

  // ---------- modalità "ruota al centro" ----------
  const body = document.body;
  function enterFocus(spinning) {
    body.classList.add("focus");
    body.classList.toggle("spinning", !!spinning);
    // aspetta il cambio di layout, poi porta la ruota al centro dello schermo
    requestAnimationFrame(() => setTimeout(() =>
      document.querySelector(".wheel-wrap").scrollIntoView({ behavior: "smooth", block: "center" }), 60));
  }
  function exitFocus() {
    body.classList.remove("focus", "spinning");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function revealDeck(idx) {
    body.classList.remove("spinning");
    body.classList.add("landed");
    setTimeout(() => {
      body.classList.remove("landed");
      showDeck(idx, true);
      exitFocus();
      if (state.mode === "char") resetStage(false);
      else if (state.noRepeat) { buildItems(); drawWheel(); }
    }, 1100);
  }

  function landed(item) {
    if (item.char) {
      state.pickedChar = item.char;
      state.stage = "deck";
      buildItems();
      if (state.items.length === 1) { revealDeck(state.items[0].deck); return; }
      body.classList.remove("spinning");
      state.rot = 0;
      drawWheel();
      renderStage();
      $("ticker").textContent = item.char;
    } else {
      revealDeck(item.deck);
    }
  }

  function resetStage(clearTicker = true) {
    state.stage = "start"; state.pickedChar = null;
    buildItems(); drawWheel(); renderStage();
    if (clearTicker) $("ticker").innerHTML = "&nbsp;";
  }

  function renderStage() {
    const st = $("stage");
    const n = state.items.length;
    if (state.mode === "deck") {
      st.textContent = `${n} deck in gara`;
      $("spin").textContent = "GIRA";
    } else if (state.stage === "deck") {
      st.innerHTML = `Personaggio: <b></b> · ${n} deck in gara <button class="link" type="button" id="backChar">cambia personaggio</button>`;
      st.querySelector("b").textContent = state.pickedChar;
      $("backChar").onclick = () => resetStage();
      $("spin").textContent = "DECK";
    } else {
      st.textContent = `${n} personaggi in gara · poi si gira il deck`;
      $("spin").textContent = "GIRA";
    }
  }

  // ---------- risultato ----------
  function showDeck(idx, fromSpin) {
    const game = gameByCode[state.game];
    const d = game.decks[idx];
    const key = deckKey(state.game, d);
    state.current = { g: state.game, idx };
    if (fromSpin) {
      state.drawn.add(key);
      store.set("drawn", [...state.drawn]);
      state.history = [{ g: state.game, idx, label: game.code + " · " + d.c + " · " + d.n }]
        .concat(state.history.filter((h) => !(h.g === state.game && h.idx === idx))).slice(0, 15);
      store.set("history", state.history);
      renderHistory();
    }
    const rows = deckRows(d);
    const tot = (z) => rows.filter((c) => c.z === z).reduce((a, c) => a + c.q, 0);
    const fake = rows.filter((c) => c.fake);
    const nomd = rows.filter((c) => !c.fake && !c.md);
    const main = tot("m"), extra = tot("e"), side = tot("s");

    const res = $("result");
    res.innerHTML = "";
    const head = el("div", "deck-head");
    const left = el("div");
    left.append(el("h2", null, d.n));
    const who = el("p", "who");
    who.textContent = d.c + (d.v ? " — " + d.v : "");
    left.append(who);
    if (d.j) left.append(el("div", "ja", d.j));
    const tags = el("div", "tags");
    tags.append(el("span", "tag", game.name.replace(/^Yu-Gi-Oh! /, "")));
    if (d.l) tags.append(el("span", "tag", "Livello " + d.l));
    tags.append(el("span", "tag", `Main ${main} · Extra ${extra}${side ? " · Side " + side : ""}`));
    if (!fake.length && !nomd.length) tags.append(el("span", "tag ok", "100% Master Duel"));
    if (nomd.length) tags.append(el("span", "tag warn", `${nomd.reduce((a, c) => a + c.q, 0)} carte non in Master Duel`));
    if (fake.length) tags.append(el("span", "tag bad", `${fake.reduce((a, c) => a + c.q, 0)} carte esclusive del gioco`));
    if (extra > 15) tags.append(el("span", "tag warn", "Extra Deck oltre 15"));
    left.append(tags);
    head.append(left);
    res.append(head);

    const actions = el("div", "actions");
    const bY = el("button", "btn primary", "Scarica .ydk");
    const bC = el("button", "btn", "Copia lista");
    const bT = el("button", "btn", "Scarica lista .txt");
    const bW = el("a", "btn", "Apri su Yugipedia");
    bW.href = "https://yugipedia.com/wiki/" + encodeURIComponent(d.p.replace(/ /g, "_"));
    bW.target = "_blank"; bW.rel = "noopener";
    actions.append(bY, bC, bT, bW);
    res.append(actions);
    const opt = el("label", "opt");
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = state.ydkOnlyMd;
    cb.onchange = () => { state.ydkOnlyMd = cb.checked; store.set("ydkOnlyMd", cb.checked); };
    opt.append(cb, document.createTextNode("Nel .ydk metti solo le carte presenti in Master Duel"));
    res.append(opt);
    if (rows.some((c) => c.alt)) {
      const opt2 = el("label", "opt");
      const cb2 = document.createElement("input");
      cb2.type = "checkbox"; cb2.checked = state.speedSwap;
      cb2.onchange = () => { state.speedSwap = cb2.checked; store.set("speedSwap", cb2.checked); };
      opt2.append(cb2, document.createTextNode("Nel .ydk sostituisci le Speed Spell con la Magia normale equivalente"));
      res.append(opt2);
    }
    const toast = el("div", "toast");
    res.append(toast);

    const base = fileBase(game, d);
    bY.onclick = () => {
      const { text, skipped, mainCount } = buildYdk(game, d, rows, state.ydkOnlyMd);
      download(base + ".ydk", text);
      toast.textContent = `File ${base}.ydk scaricato` + (skipped ? ` · ${skipped} carte escluse` : "") +
        (mainCount < 40 ? ` · attenzione: Main Deck da ${mainCount} carte (minimo 40 in Master Duel)` : "");
    };
    bC.onclick = async () => {
      const ok = await copyText(buildList(game, d, rows));
      toast.textContent = ok ? "Lista copiata negli appunti" : "Copia non riuscita: usa «Scarica lista .txt»";
    };
    bT.onclick = () => { download(base + ".txt", buildList(game, d, rows)); toast.textContent = `File ${base}.txt scaricato`; };

    const zones = el("div", "zones");
    for (const [z, title] of [["m", "Main Deck"], ["e", "Extra Deck"], ["s", "Side Deck"]]) {
      const zr = rows.filter((c) => c.z === z);
      if (!zr.length) continue;
      const box = el("div", "zone");
      const h = el("h3"); h.innerHTML = `${title} <b>${tot(z)}</b>`;
      box.append(h);
      const ul = el("ul", "clist");
      const order = { monster: 0, extra: 0, fake: 1, spell: 2, trap: 3 };
      zr.slice().sort((a, b) => order[category(a)] - order[category(b)] || a.name.localeCompare(b.name))
        .forEach((c) => {
          const li = el("li", category(c) + (c.fake ? (c.alt ? " swap" : " fake") : !c.md ? " nomd" : ""));
          li.append(el("span", "q", c.q + "×"));
          const n = el("span", "n");
          if (c.id) {
            const a = el("a", null, c.name);
            a.href = "https://yugipedia.com/wiki/" + encodeURIComponent(c.name.replace(/ /g, "_"));
            a.target = "_blank"; a.rel = "noopener";
            n.append(a);
          } else n.textContent = c.name;
          li.append(n);
          li.append(el("span", "t", c.fake ? (c.alt ? "Speed Spell" : "solo nel gioco") : shortType(c.type)));
          li.title = c.fake ? (c.alt ? `Esclusiva del gioco · nel .ydk può diventare «${c.alt.name}»`
            : "Carta esclusiva del videogioco: non esiste un codice per il .ydk")
            : `${c.type} · codice ${c.id}${c.md ? "" : " · non disponibile in Master Duel"}`;
          ul.append(li);
        });
      box.append(ul);
      zones.append(box);
    }
    res.append(zones);
    const lg = el("div", "legend");
    lg.innerHTML = '<span><span class="w">■</span> non presente in Master Duel</span>' +
      '<span><span class="s">■</span> Speed Spell (nel .ydk può diventare la Magia normale)</span>' +
      '<span><span class="b">■</span> esclusiva del videogioco, non importabile</span>';
    res.append(lg);
    body.classList.remove("focus", "spinning", "landed");
    if (window.innerWidth < 900) setTimeout(() => res.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function shortType(t) {
    return t.replace(/ Card$/, "").replace("Effect Monster", "Effetto").replace("Normal Monster", "Normale")
      .replace("Spell", "Magia").replace("Trap", "Trappola").replace("Monster", "Mostro");
  }
  function fileBase(game, d) {
    return [game.code, d.c, d.n].join(" - ").replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();
  }
  function buildYdk(game, d, rows, onlyMd) {
    const out = { m: [], e: [], s: [] };
    let skipped = 0;
    for (const c of rows) {
      let id = c.id, md = c.md;
      if (!id && c.alt && state.speedSwap) { id = c.alt.id; md = c.alt.md; }
      if (!id || (onlyMd && !md)) { skipped += c.q; continue; }
      for (let i = 0; i < c.q; i++) out[c.z].push(id);
    }
    const text = [
      `#created by Deck Roulette - ${game.name} - ${d.c} - ${d.n}`,
      "#main", ...out.m, "#extra", ...out.e, "!side", ...out.s, "",
    ].join("\n");
    return { text, skipped, mainCount: out.m.length };
  }
  function buildList(game, d, rows) {
    const L = [];
    L.push(`${d.n}${d.j ? " (" + d.j + ")" : ""}`);
    L.push(`${d.c}${d.v ? " — " + d.v : ""} · ${game.name}${d.l ? " · Livello " + d.l : ""}`);
    for (const [z, title] of [["m", "Main Deck"], ["e", "Extra Deck"], ["s", "Side Deck"]]) {
      const zr = rows.filter((c) => c.z === z);
      if (!zr.length) continue;
      L.push("", `${title} (${zr.reduce((a, c) => a + c.q, 0)})`);
      for (const c of zr) {
        const note = c.fake ? (c.alt ? `  [esclusiva del gioco - equivalente: ${c.alt.name}]` : "  [esclusiva del gioco]")
          : !c.md ? "  [non in Master Duel]" : "";
        L.push(`${c.q}x ${c.name}${note}`);
      }
    }
    L.push("", "Fonte: https://yugipedia.com/wiki/" + d.p.replace(/ /g, "_"));
    return L.join("\n");
  }
  function download(name, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch { /* fallback */ }
    try {
      const ta = document.createElement("textarea"); ta.value = t; document.body.append(ta);
      ta.select(); const ok = document.execCommand("copy"); ta.remove(); return ok;
    } catch { return false; }
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ---------- pannelli ----------
  function renderGames() {
    const nav = $("games"); nav.innerHTML = "";
    for (const plat of ["DS", "PSP"]) {
      const grp = el("div", "grp");
      grp.append(el("span", "plat", plat));
      DATA.games.filter((g) => g.platform === plat).forEach((g) => {
        const b = el("button", "chip" + (g.code === state.game ? " on" : ""));
        b.type = "button";
        b.textContent = g.name.replace(/^Yu-Gi-Oh! (5D's |GX |ARC-V )?/, "").replace(/World Championship /, "WC ");
        b.append(el("small", null, g.decks.length));
        b.title = `${g.name} (${g.year}) · ${g.decks.length} deck`;
        b.onclick = () => { if (state.spinning) return; state.game = g.code; store.set("game", g.code); onGameChange(); };
        grp.append(b);
      });
      nav.append(grp);
    }
  }
  function renderChars() {
    const game = gameByCode[state.game];
    const ex = new Set(state.excluded[state.game] || []);
    const q = $("charSearch").value.trim().toLowerCase();
    const counts = new Map();
    game.decks.forEach((d) => counts.set(d.c, (counts.get(d.c) || 0) + 1));
    const box = $("chars"); box.innerHTML = "";
    [...counts.keys()].sort((a, b) => a.localeCompare(b)).forEach((c) => {
      if (q && !c.toLowerCase().includes(q)) return;
      const lab = el("label", ex.has(c) ? "off" : "");
      const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !ex.has(c);
      cb.onchange = () => { toggleChar(c, cb.checked); lab.classList.toggle("off", !cb.checked); };
      lab.append(cb, el("span", null, c), el("small", null, counts.get(c)));
      lab.title = c;
      box.append(lab);
    });
    $("poolCount").textContent = `${counts.size - ex.size}/${counts.size} personaggi attivi`;
  }
  function toggleChar(c, on) {
    const ex = new Set(state.excluded[state.game] || []);
    on ? ex.delete(c) : ex.add(c);
    state.excluded[state.game] = [...ex];
    store.set("excluded", state.excluded);
    refresh();
  }
  function renderHistory() {
    const ol = $("history"); ol.innerHTML = "";
    if (!state.history.length) { ol.append(el("li", null, "nessuna")); return; }
    state.history.forEach((h) => {
      const li = el("li"); const b = el("button", null, h.label); b.type = "button";
      b.onclick = () => { if (gameByCode[h.g] && gameByCode[h.g].decks[h.idx]) {
        if (h.g !== state.game) { state.game = h.g; onGameChange(); }
        showDeck(h.idx, false); } };
      li.append(b); ol.append(li);
    });
  }
  function onGameChange() {
    const game = gameByCode[state.game];
    $("gameTitle").textContent = `${game.name} · ${game.platform} ${game.year}`;
    const hasLv = game.decks.some((d) => lvNum(d) != null);
    $("levelRow").style.display = hasLv ? "" : "none";
    if (hasLv) {
      const lvs = game.decks.map(lvNum).filter((x) => x != null);
      const lo = Math.min(...lvs), hi = Math.max(...lvs);
      Object.assign($("lvMin"), { min: lo, max: hi, value: lo });
      Object.assign($("lvMax"), { min: lo, max: hi, value: hi });
      state.lvMin = lo; state.lvMax = hi;
    } else { state.lvMin = -Infinity; state.lvMax = Infinity; }
    renderGames();
    renderChars();
    state.rot = 0;
    resetStage();
  }
  function refresh() {
    if (state.spinning) return;
    renderChars();
    if (state.stage === "deck") { buildItems(); if (!state.items.length) resetStage(); else { drawWheel(); renderStage(); } }
    else resetStage();
  }

  // ---------- eventi ----------
  $("spin").onclick = spin;
  document.querySelectorAll('input[name="mode"]').forEach((r) => {
    r.checked = r.value === state.mode;
    r.onchange = () => { if (state.spinning) return; state.mode = r.value; store.set("mode", r.value); resetStage(); };
  });
  $("onlyMd").checked = state.onlyMd;
  $("onlyMd").onchange = (e) => { state.onlyMd = e.target.checked; store.set("onlyMd", state.onlyMd); refresh(); };
  $("noRepeat").checked = state.noRepeat;
  $("noRepeat").onchange = (e) => { state.noRepeat = e.target.checked; store.set("noRepeat", state.noRepeat); refresh(); };
  $("resetHistory").onclick = () => { state.drawn.clear(); store.set("drawn", []); state.history = []; store.set("history", []); renderHistory(); refresh(); };
  const lvChange = () => {
    let a = +$("lvMin").value, b = +$("lvMax").value;
    if (a > b) [a, b] = [b, a];
    state.lvMin = a; state.lvMax = b; refresh();
  };
  $("lvMin").onchange = lvChange; $("lvMax").onchange = lvChange;
  $("charSearch").oninput = renderChars;
  const setVisible = (on) => {
    const q = $("charSearch").value.trim().toLowerCase();
    const all = [...new Set(gameByCode[state.game].decks.map((d) => d.c))];
    const vis = all.filter((c) => !q || c.toLowerCase().includes(q));
    const ex = new Set(state.excluded[state.game] || []);
    vis.forEach((c) => (on ? ex.delete(c) : ex.add(c)));
    state.excluded[state.game] = [...ex]; store.set("excluded", state.excluded); refresh();
  };
  $("allOn").onclick = () => setVisible(true);
  $("allOff").onclick = () => setVisible(false);
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !/INPUT|TEXTAREA|BUTTON|A/.test(document.activeElement.tagName)) { e.preventDefault(); spin(); }
  });
  window.addEventListener("resize", () => drawWheel());
  if (window.ResizeObserver) new ResizeObserver(() => { if (!state.spinning) drawWheel(); }).observe(canvas);
  body.classList.add("focus"); // all'avvio la ruota è al centro

  const totalDecks = DATA.games.reduce((a, g) => a + g.decks.length, 0);
  $("meta").textContent = `${DATA.games.length} giochi · ${totalDecks} deck · dati del ${DATA.generated}`;
  renderHistory();
  onGameChange();
})();
