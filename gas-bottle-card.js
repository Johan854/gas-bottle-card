/*
 * Gas Bottle Card (FR)
 * Carte Home Assistant pour une bouteille de gaz pesée (balance ESPHome) : bouteille illustrée qui se vide, pourcentage,
 * kilos restants, couleur selon le seuil, estimation du temps restant d'après l'historique et alerte de mesure incohérente.
 * Style verre, thème clair/sombre automatique, éditeur visuel, textes en français.
 */
const CARD_VERSION = "1.0.0";

const DEFAULTS = {
  title: "Bouteille de gaz",
  theme: "auto",
  entity: "",
  kg_entity: "",
  capacity_kg: 6,
  good_kg: 4,
  low_kg: 2,
  history_days: 14,
  show_estimate: true,
  image: "",
  image_opacity: 0.18,
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const gone = (st) => !st || st.state === "unavailable" || st.state === "unknown" || st.state === "";
const fmt = (n, d = 1) => Number(n).toFixed(d).replace(".", ",");

class GasBottleCard extends HTMLElement {
  static getConfigElement() { return document.createElement("gas-bottle-card-editor"); }
  static getStubConfig(hass) {
    const id = hass && Object.keys(hass.states).find((e) => /^sensor\..*(gaz|gas)/i.test(e));
    return { ...DEFAULTS, entity: id || "" };
  }

  constructor() { super(); this.attachShadow({ mode: "open" }); this._sig = ""; this._hist = null; this._histAt = 0; }

  setConfig(config) {
    if (!config) throw new Error("Configuration invalide");
    this._config = { ...DEFAULTS, ...config };
    this._sig = ""; this._hist = null; this._histAt = 0;
    if (this._hass) { this._render(); this._loadHistory(); }
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    const c = this._config;
    const sig = [c.entity, c.kg_entity].map((e) => { const s = hass.states[e]; return s ? s.state : "x"; }).join("|") + (this._isDark() ? "d" : "l");
    if (sig !== this._sig) { this._sig = sig; this._render(); }
    this._loadHistory();
  }

  getCardSize() { return 4; }

  _isDark() {
    const t = this._config && this._config.theme;
    if (t === "dark") return true;
    if (t === "light") return false;
    const dm = this._hass && this._hass.themes && this._hass.themes.darkMode;
    return typeof dm === "boolean" ? dm : !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
  _more(id) { if (id) this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: id } })); }

  async _loadHistory() {
    const c = this._config, h = this._hass;
    if (!c || !h || !c.entity || !c.show_estimate || this._busy || Date.now() - this._histAt < 30 * 60 * 1000) return;
    this._busy = true; this._histAt = Date.now();
    try {
      const days = Math.max(2, Math.min(60, Number(c.history_days) || 14));
      const end = new Date(), start = new Date(end.getTime() - days * 86400000);
      const res = await h.callWS({ type: "history/history_during_period", start_time: start.toISOString(), end_time: end.toISOString(), entity_ids: [c.entity], minimal_response: true, no_attributes: true, significant_changes_only: false });
      const arr = (res && (res[c.entity] || (Array.isArray(res) ? res[0] : null))) || [];
      this._hist = arr.map((p) => ({ t: (p.lu || p.last_updated || 0) * (p.lu ? 1000 : 1), v: Number(p.s ?? p.state) })).filter((p) => isFinite(p.v) && isFinite(p.t) && p.v >= -5 && p.v <= 105);
    } catch (e) { this._hist = []; }
    this._busy = false;
    this._render();
  }

  /* Consommation moyenne (%/jour) : on lisse par heure puis on cumule uniquement les baisses (les hausses = dérive ou changement de bouteille). */
  _rate() {
    const hist = this._hist;
    if (!hist || hist.length < 20) return null;
    const buckets = new Map();
    hist.forEach((p) => { const k = Math.floor(p.t / 3600000); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(p.v); });
    const keys = [...buckets.keys()].sort((a, b) => a - b);
    if (keys.length < 24) return null;
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    const pts = keys.map((k) => ({ k, v: med(buckets.get(k)) }));
    let drop = 0, hrs = 0;
    for (let i = 1; i < pts.length; i++) {
      const dt = pts[i].k - pts[i - 1].k, dv = pts[i].v - pts[i - 1].v;
      if (dt > 6) continue;
      hrs += dt;
      if (dv < 0 && dv > -15) drop += -dv;
    }
    if (hrs < 24) return null;
    const perDay = (drop / hrs) * 24;
    return perDay > 0.2 ? perDay : null;
  }

  _read() {
    const c = this._config, h = this._hass;
    const st = h.states[c.entity], kst = c.kg_entity ? h.states[c.kg_entity] : null;
    const cap = Number(c.capacity_kg) || 6;
    if (!c.entity) return { err: "config" };
    if (gone(st) && (!kst || gone(kst))) return { err: "off" };
    const raw = gone(st) ? NaN : Number(st.state);
    const rawKg = kst && !gone(kst) && isFinite(Number(kst.state)) ? Number(kst.state) : NaN;
    const pctRaw = isFinite(raw) ? raw : isFinite(rawKg) ? (rawKg / cap) * 100 : NaN;
    if (!isFinite(pctRaw)) return { err: "off" };
    const kgRaw = isFinite(rawKg) ? rawKg : (pctRaw / 100) * cap;
    const incoherent = pctRaw < -2 || pctRaw > 103 || kgRaw < -0.15 * cap || kgRaw > cap * 1.03;
    const pct = Math.max(0, Math.min(100, pctRaw));
    const kg = Math.max(0, Math.min(cap, kgRaw));
    return { pct, kg, incoherent, pctRaw, cap };
  }

  _render() {
    const c = this._config, h = this._hass;
    if (!c || !h) return;
    const dark = this._isDark();
    const r = this._read();
    const good = Number(c.good_kg) || 4, low = Number(c.low_kg) || 2;
    let lvl = "na", big = "—", sub = "", alert = "", est = "";
    if (r.err === "config") sub = "Choisis le capteur de la bouteille dans l'éditeur.";
    else if (r.err === "off") { sub = "Capteur hors ligne"; alert = `<div class="al warn glass"><ha-icon icon="mdi:wifi-off"></ha-icon><span>Le capteur ne répond pas. Vérifie l'alimentation de la balance.</span></div>`; }
    else {
      lvl = r.kg >= good ? "ok" : r.kg >= low ? "mid" : "crit";
      big = Math.round(r.pct) + "<small>%</small>";
      sub = `${fmt(r.kg)} kg de gaz sur ${fmt(r.cap, r.cap % 1 ? 1 : 0)} kg`;
      if (r.incoherent) alert = `<div class="al warn glass"><ha-icon icon="mdi:alert-circle-outline"></ha-icon><span>Mesure incohérente (${fmt(r.pctRaw, 0)} %). Une bouteille ne peut pas dépasser 100 % : vérifie la balance.</span></div>`;
      else if (lvl === "crit") alert = `<div class="al crit glass"><ha-icon icon="mdi:fire-alert"></ha-icon><span>Bouteille presque vide : à remplacer rapidement.</span></div>`;
      else if (lvl === "mid") alert = `<div class="al mid glass"><ha-icon icon="mdi:gas-cylinder"></ha-icon><span>Niveau bas : pense à prévoir une bouteille de rechange.</span></div>`;
      if (c.show_estimate && !r.incoherent) {
        const rate = this._rate();
        if (rate) {
          const days = r.pct / rate;
          const when = new Date(Date.now() + days * 86400000);
          const ds = days < 1 ? "moins d'un jour" : days < 60 ? `environ ${Math.round(days)} jour${Math.round(days) > 1 ? "s" : ""}` : `plus de ${Math.floor(days / 30)} mois`;
          est = `<div class="est glass"><ha-icon icon="mdi:timer-sand"></ha-icon><div><div class="e1">Reste ${ds}</div><div class="e2">≈ ${fmt(rate)} % par jour${days < 365 ? ` · vide vers le ${when.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}` : ""}</div></div></div>`;
        } else if (this._hist === null) est = `<div class="est glass"><ha-icon icon="mdi:timer-sand"></ha-icon><div><div class="e1">Estimation en cours…</div></div></div>`;
        else est = `<div class="est glass"><ha-icon icon="mdi:timer-sand"></ha-icon><div><div class="e1">Estimation indisponible</div><div class="e2">Pas assez de données fiables dans l'historique.</div></div></div>`;
      }
    }

    const p = r.pct == null ? 0 : r.pct;
    const bg = c.image ? `<div class="bgimg" style="background-image:url('${esc(c.image)}');opacity:${Number(c.image_opacity) || 0.18}"></div>` : "";
    const bottle = `<svg class="bottle ${lvl}" viewBox="0 0 120 230" role="img" aria-label="Bouteille de gaz">
      <defs><clipPath id="gb-body"><path d="M24 208 Q24 218 36 218 H84 Q96 218 96 208 V96 Q96 64 60 64 Q24 64 24 96 Z"/></clipPath>
        <linearGradient id="gb-shine" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset=".25" stop-color="#fff" stop-opacity=".38"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
      <ellipse cx="60" cy="223" rx="40" ry="5" class="shadow"/>
      <path class="shell" d="M24 208 Q24 218 36 218 H84 Q96 218 96 208 V96 Q96 64 60 64 Q24 64 24 96 Z"/>
      <g clip-path="url(#gb-body)"><g class="liq" style="transform:translateY(${(100 - p) * 1.54}px)">
        <g class="wv"><path d="M-120 66 q15 -6 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 V230 H-120 Z"/></g>
        <path class="wv2" d="M-60 68 q15 5 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 V230 H-60 Z"/></g>
        ${[25, 50, 75].map((m) => `<line class="tick" x1="24" x2="34" y1="${218 - 1.54 * m}" y2="${218 - 1.54 * m}"/>`).join("")}</g>
      <path d="M24 208 Q24 218 36 218 H84 Q96 218 96 208 V96 Q96 64 60 64 Q24 64 24 96 Z" fill="url(#gb-shine)"/>
      <path class="shell-l" d="M24 208 Q24 218 36 218 H84 Q96 218 96 208 V96 Q96 64 60 64 Q24 64 24 96 Z" fill="none"/>
      <rect class="metal" x="42" y="46" width="36" height="16" rx="5"/>
      <rect class="metal" x="53" y="26" width="14" height="22" rx="3"/>
      <path class="metal-s" d="M40 30 H80" />
      <rect class="metal" x="46" y="20" width="28" height="8" rx="4"/>
    </svg>`;

    this.shadowRoot.innerHTML = `<style>
      * { box-sizing:border-box; }
      ha-card.dark { --gb-text:#f4f6fb; --gb-muted:#a9afc0; --gb-bg:linear-gradient(160deg,#1b1e32 0%,#241a2a 55%,#2d1519 100%); --gb-border:rgba(255,255,255,.14); --gb-shadow:0 .6em 2em rgba(0,0,0,.35);
        --gb-glass:rgba(255,255,255,.07); --gb-glass-b:rgba(255,255,255,.13); --gb-ok:#3ddc84; --gb-mid:#4aa8ff; --gb-crit:#ff5a5f; --gb-warn:#ffb86b; --gb-na:#8a90a2; --gb-shell:rgba(255,255,255,.1); --gb-metal:#7b8196; }
      ha-card.light { --gb-text:#1c2030; --gb-muted:#5d6477; --gb-bg:linear-gradient(160deg,#f8f9fd 0%,#eef1f8 55%,#f8eff0 100%); --gb-border:rgba(20,24,40,.12); --gb-shadow:0 .4em 1.4em rgba(20,24,40,.12);
        --gb-glass:rgba(255,255,255,.7); --gb-glass-b:rgba(20,24,40,.1); --gb-ok:#1a9d55; --gb-mid:#1f78d1; --gb-crit:#d32f35; --gb-warn:#c77a14; --gb-na:#8a90a2; --gb-shell:rgba(20,24,40,.06); --gb-metal:#9aa1b5; }
      ha-card { position:relative; container-type:inline-size; display:flex; flex-direction:column; gap:12px; padding:16px; color:var(--gb-text); border-radius:24px; border:1px solid var(--gb-border); background:var(--gb-bg); box-shadow:var(--gb-shadow); overflow:hidden; }
      ha-card > * { position:relative; }
      .bgimg { position:absolute !important; inset:0; background-size:cover; background-position:center; pointer-events:none; }
      ha-icon { --mdc-icon-size:1.35em; flex:none; }
      button { font:inherit; color:inherit; background:none; border:0; padding:0; text-align:left; cursor:pointer; -webkit-tap-highlight-color:transparent; }
      .t { font-weight:700; font-size:1.05em; }
      .glass { background:var(--gb-glass); border:1px solid var(--gb-glass-b); -webkit-backdrop-filter:blur(18px) saturate(140%); backdrop-filter:blur(18px) saturate(140%); }
      .main { display:grid; grid-template-columns:minmax(0,9em) 1fr; gap:14px; align-items:center; }
      @container (max-width: 300px) { .main { grid-template-columns:1fr; justify-items:center; text-align:center; } }
      .bwrap { width:100%; max-width:9em; margin:0 auto; } .bottle { width:100%; height:auto; display:block; overflow:visible; }
      .shadow { fill:rgba(0,0,0,.25); } .shell { fill:var(--gb-shell); } .shell-l { stroke:var(--gb-glass-b); stroke-width:2; }
      .metal { fill:var(--gb-metal); } .metal-s { stroke:none; } .tick { stroke:var(--gb-glass-b); stroke-width:2; }
      .liq { transition:transform 1s ease; fill:var(--gb-na); }
      .bottle.ok .liq { fill:var(--gb-ok); } .bottle.mid .liq { fill:var(--gb-mid); } .bottle.crit .liq { fill:var(--gb-crit); }
      .liq .wv path, .liq path { opacity:.9; } .wv2 { opacity:.45 !important; }
      .wv { animation:gb-w 5s linear infinite; } .wv2 { animation:gb-w2 7s linear infinite; }
      @keyframes gb-w { to { transform:translateX(60px); } } @keyframes gb-w2 { to { transform:translateX(-60px); } }
      .info { min-width:0; display:flex; flex-direction:column; gap:.2em; }
      .big { font-size:3em; font-weight:800; line-height:1; font-variant-numeric:tabular-nums; } .big small { font-size:.45em; font-weight:700; margin-left:.1em; }
      .info.ok .big { color:var(--gb-ok); } .info.mid .big { color:var(--gb-mid); } .info.crit .big { color:var(--gb-crit); } .info.na .big { color:var(--gb-na); }
      .sub { color:var(--gb-muted); font-size:.9em; }
      .est, .al { display:flex; align-items:center; gap:.7em; padding:10px 14px; border-radius:18px; font-size:.9em; }
      .est ha-icon { color:var(--gb-muted); } .e1 { font-weight:700; } .e2 { font-size:.85em; color:var(--gb-muted); }
      .al.warn ha-icon { color:var(--gb-warn); } .al.mid ha-icon { color:var(--gb-mid); } .al.crit ha-icon { color:var(--gb-crit); }
      .al.crit { border-color:var(--gb-crit); animation:gb-p 2s ease-in-out infinite; }
      @keyframes gb-p { 50% { box-shadow:0 0 0 3px color-mix(in srgb, var(--gb-crit) 30%, transparent); } }
      @media (prefers-reduced-motion: reduce) { .wv, .wv2, .al.crit { animation:none; } .liq { transition:none; } }
    </style>
    <ha-card class="${dark ? "dark" : "light"}">${bg}
      ${c.title ? `<div class="t">${esc(c.title)}</div>` : ""}
      <button class="main" data-more="${esc(c.entity)}"><div class="bwrap">${bottle}</div>
        <div class="info ${lvl}"><div class="big">${big}</div><div class="sub">${esc(sub)}</div></div></button>
      ${alert}${est}
    </ha-card>`;
    this.shadowRoot.querySelectorAll("[data-more]").forEach((el) => el.addEventListener("click", () => this._more(el.dataset.more)));
  }
}

/* ---------- Éditeur visuel ---------- */
const LABELS = { title: "Titre", theme: "Thème", entity: "Capteur de la bouteille (%)", kg_entity: "Capteur en kg (facultatif)", capacity_kg: "Contenance de gaz (kg)",
  good_kg: "Niveau « bon » au-dessus de (kg)", low_kg: "Niveau « critique » sous (kg)", history_days: "Jours d'historique pour l'estimation", show_estimate: "Afficher le temps restant estimé",
  image: "Image de fond (URL, facultatif)", image_opacity: "Opacité de l'image" };
const SCHEMA = [
  { type: "grid", name: "", schema: [{ name: "title", selector: { text: {} } },
    { name: "theme", selector: { select: { mode: "dropdown", options: [{ value: "auto", label: "Automatique" }, { value: "light", label: "Clair" }, { value: "dark", label: "Sombre" }] } } }] },
  { name: "entity", selector: { entity: { domain: "sensor" } } },
  { name: "kg_entity", selector: { entity: { domain: "sensor" } } },
  { type: "grid", name: "", schema: [{ name: "capacity_kg", selector: { number: { min: 1, max: 50, step: 0.5, mode: "box" } } },
    { name: "history_days", selector: { number: { min: 2, max: 60, mode: "box" } } },
    { name: "good_kg", selector: { number: { min: 0, max: 50, step: 0.5, mode: "box" } } },
    { name: "low_kg", selector: { number: { min: 0, max: 50, step: 0.5, mode: "box" } } }] },
  { name: "show_estimate", selector: { boolean: {} } },
  { name: "image", selector: { text: {} } },
  { name: "image_opacity", selector: { number: { min: 0.05, max: 1, step: 0.05, mode: "slider" } } },
];

class GasBottleCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...DEFAULTS, ...config };
    if (!this._form) this._build(); else this._form.data = this._config;
  }
  set hass(h) { this._hass = h; if (this._form) this._form.hass = h; }
  _build() {
    const el = document.createElement("ha-form");
    el.hass = this._hass; el.data = this._config; el.schema = SCHEMA; el.computeLabel = (s) => LABELS[s.name] || s.name;
    el.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      const cfg = { ...ev.detail.value };
      ["kg_entity", "image"].forEach((k) => { if (cfg[k] === "" || cfg[k] == null) delete cfg[k]; });
      this._config = cfg;
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: cfg }, bubbles: true, composed: true }));
    });
    this._form = el; this.appendChild(el);
  }
}

customElements.define("gas-bottle-card", GasBottleCard);
customElements.define("gas-bottle-card-editor", GasBottleCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({ type: "gas-bottle-card", name: "Gas Bottle Card (FR)", description: "Bouteille de gaz pesée : niveau animé, kg restants, temps restant estimé, alerte de mesure incohérente.", preview: true });
console.info(`%c GAS-BOTTLE-CARD %c v${CARD_VERSION} `, "color:#fff;background:#1f78d1;font-weight:700;border-radius:3px 0 0 3px;padding:2px 4px", "color:#1f78d1;background:#fff;font-weight:700;border-radius:0 3px 3px 0;padding:2px 4px");
