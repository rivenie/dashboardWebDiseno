/* =====================================================================
   dashboard.js · CORE Flota Vehicular
   ===================================================================== */
"use strict";

const CONFIG = {
  SUPABASE_URL: "https://ieblbnoyvppyiixtjgpk.supabase.co",
  SUPABASE_KEY: "sb_publishable_jDIyPv2xMqmOMrQr6oaHog_jec-bv6T",
  TABLE: "dashboard_data",
  SHEET_NAME: "FLOTA_DATA",
  HOME_URL: "index.html",
  BUS: "core-dashboard",
  LS_UPLOAD: "core:lastUpload",
  LS_THEME: "core:theme",
  POLL_MS: 20000,
};

const noStoreFetch = (input, init = {}) => fetch(input, { ...init, cache: "no-store" });
const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, { global: { fetch: noStoreFetch }, auth: { persistSession: false } });
const REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

const DIMS = {
  gestor: { label: "Gestor", icon: "fa-user-tie" },
  cliente: { label: "Cliente", icon: "fa-building" },
  marca: { label: "Marca/Modelo", icon: "fa-car" },
  taller: { label: "Taller", icon: "fa-screwdriver-wrench" },
  estatus: { label: "Estatus", icon: "fa-traffic-light" },
};
const FILTER_KEYS = Object.keys(DIMS);
const ROW_FILTER_KEYS = FILTER_KEYS;
const DIM_LABEL = { gestor: "Gestor", cliente: "Cliente", marca: "Marca", taller: "Taller", estatus: "Estatus", periodo: "Fecha" };

const SECCIONES = {
  resumen: { titulo: "Resumen General", icon: "fa-gauge-high", desc: "Estado global de la flota y alertas críticas." },
  alertas: { titulo: "Alertas de Vencimiento", icon: "fa-triangle-exclamation", desc: "Semáforo de mantenimientos: vencidos, próximos y vigentes." },
  talleres: { titulo: "Calendario de Talleres", icon: "fa-calendar-days", desc: "Programación semanal y carga de trabajo por taller." },
};
const SEC_KEYS = Object.keys(SECCIONES);

const state = {
  payload: null, filas: [], vista: [], d: null, dims: {},
  filtros: { gestor: "", cliente: "", marca: "", taller: "", estatus: "" },
  seccion: "resumen", signature: null, uploadedAt: null, lastSync: null, loading: null, error: null, tk: null, sort: {},
};
const charts = {}, outs = {}, tables = {};

const $ = (id) => document.getElementById(id);
const fmt = (v, d = 0) => {
  let num = Number(v);
  if (isNaN(num) || !isFinite(num)) num = 0;
  d = Number(d) || 0;
  return num.toLocaleString("es-PE", { maximumFractionDigits: d, minimumFractionDigits: d });
};
const fmtNum = (v) => fmt(v, 0);
const fmtPct = (v, d = 1) => fmt(v, d) + " %";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cell = (v, f) => ({ v, f: f ? f(v) : v });
const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const maxBy = (arr, k) => arr.reduce((a, b) => (b[k] > a[k] ? b : a), arr[0]);
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function rgba(hex, a) { const h = String(hex).trim().replace("#", ""); if (h.length !== 6) return hex; const n = parseInt(h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
function isObj(x) { return x && typeof x === "object" && !Array.isArray(x) && !(x instanceof Function); }
function merge(target, ...srcs) { srcs.forEach((src) => { Object.keys(src || {}).forEach((k) => { if (isObj(src[k]) && isObj(target[k])) merge(target[k], src[k]); else target[k] = src[k]; }); }); return target; }
function relTime(date) { if (!date) return "—"; const s = Math.round((Date.now() - new Date(date).getTime()) / 1000); if (isNaN(s)) return "—"; if (s < 10) return "recién"; if (s < 60) return `hace ${s} s`; if (s < 3600) return `hace ${Math.round(s / 60)} min`; if (s < 86400) return `hace ${Math.round(s / 3600)} h`; return new Date(date).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); }

function tokens() {
  const cs = getComputedStyle(document.documentElement);
  const g = (n) => cs.getPropertyValue(n).trim();
  return { ink: g("--ink"), ink2: g("--ink-2"), ink3: g("--ink-3"), line: g("--line"), lineStrong: g("--line-strong"), grid: g("--grid"), surface: g("--surface"), brand: g("--brand"), series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => g(`--series-${i}`)), neutral: g("--series-neutral"), good: g("--good"), warn: g("--warn"), crit: g("--crit") };
}

function prepararFilas(filas) {
  return (filas || []).map((r) => {
    const n = { ...r };
    ["kmActual", "frecuencia", "kmUltimo", "kmPromedio", "kmDesfase", "pctAvance", "diasRestantes"].forEach((k) => { n[k] = Number(n[k]) || 0; });
    
    // 👇 RECALCULAMOS EL SEMÁFORO EN EL DASHBOARD PARA QUE NO FALLE
    if (n.semaforo) return n; // Si ya viene del worker, lo usamos
    let semaforo = "Vigente";
    if (n.pctAvance >= 100 || n.kmDesfase > 0) semaforo = "Vencido";
    else if (n.pctAvance >= 80 || n.kmDesfase >= -500 || (n.diasRestantes !== null && n.diasRestantes <= 15)) semaforo = "Próximo";
    n.semaforo = semaforo;
    
    return n;
  });
}

function calcDims(filas) {
  const uniq = (k) => Array.from(new Set(filas.map((r) => r[k]).filter(Boolean))).sort();
  return { gestor: uniq("gestor"), cliente: uniq("cliente"), marca: uniq("marca"), taller: uniq("taller"), estatus: uniq("estatus") };
}

function agg(rows) {
  let regs = rows.length, kmDesfase = 0, vencidos = 0, proximos = 0, vigentes = 0;
  for (const r of rows) {
    kmDesfase += r.kmDesfase || 0;
    if (r.semaforo === "Vencido") vencidos++;
    else if (r.semaforo === "Próximo") proximos++;
    else vigentes++;
  }
  return { registros: regs, kmDesfase, vencidos, proximos, vigentes };
}

function groupBy(rows, fn) { const m = new Map(); rows.forEach((r) => { const k = fn(r) || "Sin dato"; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }); return m; }
function porDim(rows, dim) { return Array.from(groupBy(rows, (r) => r[dim]).entries()).map(([label, v]) => ({ label, ...agg(v) })).filter(x => x.label !== "Sin dato").sort((a, b) => b.registros - a.registros); }
function filtrar(rows, filtros, except) { return rows.filter((r) => ROW_FILTER_KEYS.every((k) => k === except || !filtros[k] || r[k] === filtros[k])); }

function calcular() {
  state.vista = filtrar(state.filas, state.filtros);
  const v = state.vista;
  state.d = {
    k: agg(v),
    gestor: porDim(v, "gestor"),
    cliente: porDim(v, "cliente"),
    marca: porDim(v, "marca"),
    taller: porDim(v, "taller"),
    estatus: porDim(v, "estatus"), // Usamos el estatus real
    semaforo: porDim(v, "semaforo"), // 👈 Agregamos esta línea para el gráfico de la dona
  };
}

/* =========================== CHART.JS PLUGINS =========================== */
const bgPlugin = { id: "coreBg", beforeDraw(c) { const { ctx, width, height } = c; ctx.save(); ctx.globalCompositeOperation = "destination-over"; ctx.fillStyle = (state.tk && state.tk.surface) || "#fff"; ctx.fillRect(0, 0, width, height); ctx.restore(); } };
const centerPlugin = { id: "coreCenter", afterDraw(chart, _a, opts) { if (!opts || !opts.title) return; const meta = chart.getDatasetMeta(0); if (!meta || !meta.data || !meta.data[0]) return; const { x, y } = meta.data[0]; const ctx = chart.ctx; ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = state.tk.ink; ctx.font = "700 19px 'Bricolage Grotesque', system-ui, sans-serif"; ctx.fillText(opts.title, x, y - 8); ctx.fillStyle = state.tk.ink3; ctx.font = "500 11px 'Instrument Sans', system-ui, sans-serif"; ctx.fillText(opts.sub || "", x, y + 13); ctx.restore(); } };

function setupChartDefaults() { Chart.register(ChartDataLabels, bgPlugin, centerPlugin); Chart.defaults.font.family = "'Instrument Sans', system-ui, sans-serif"; Chart.defaults.font.size = 11.5; Chart.defaults.plugins.datalabels.display = false; Chart.defaults.plugins.legend.display = false; if (REDUCED) Chart.defaults.animation = false; }
function tooltipCfg(t) { return { backgroundColor: t.surface, titleColor: t.ink, bodyColor: t.ink2, borderColor: t.lineStrong, borderWidth: 1, padding: 12, cornerRadius: 10, titleFont: { weight: "700", size: 12.5 }, bodyFont: { size: 12 }, usePointStyle: true, boxWidth: 9, boxHeight: 9 }; }
function legendCfg(t, show) { return { display: !!show, position: "bottom", align: "start", labels: { color: t.ink2, usePointStyle: true, pointStyle: "circle", boxWidth: 8, boxHeight: 8, padding: 16, font: { size: 12 } } }; }
function baseOptions(t, o = {}) {
  const fmtAxis = o.axisFmt || ((v) => fmt(v));
  const valueAxis = { beginAtZero: o.min == null, min: o.min, max: o.max, suggestedMax: o.suggestedMax, stacked: !!o.stacked, grid: { color: t.grid, drawTicks: false }, border: { display: false }, ticks: { color: t.ink3, padding: 8, callback: (v) => fmtAxis(v) } };
  const catAxis = { stacked: !!o.stacked, grid: { display: false }, border: { color: t.line }, ticks: { color: t.ink2, padding: 6, autoSkip: !o.horizontal, maxRotation: 0 } };
  return { responsive: true, maintainAspectRatio: false, animation: REDUCED ? false : { duration: 650, easing: "easeOutQuart" }, interaction: { mode: o.mode || "index", intersect: false }, indexAxis: o.horizontal ? "y" : "x", layout: { padding: { top: o.padTop ?? 10, right: o.padRight ?? 8 } }, scales: o.horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis }, plugins: { legend: legendCfg(t, o.legend), tooltip: tooltipCfg(t), datalabels: { display: false } } };
}
function barDs(t, label, data, color, o = {}) { return { label, data, backgroundColor: color, borderRadius: o.stacked ? 0 : 5, borderSkipped: false, maxBarThickness: o.thick || 40, barPercentage: 0.8, categoryPercentage: 0.85 }; }
const endLabels = (t, formatter) => ({ display: (ctx) => ctx.dataset.data[ctx.dataIndex] != null, anchor: "end", align: "end", offset: 4, clamp: true, color: t.ink2, font: { weight: "600", size: 11 }, formatter });

const INFO = {};

/* =========================== GRÁFICOS =========================== */
const CHARTS = [
      {
    id: "cSemaforoGlobal", sec: "resumen", span: 6, size: "md",
    title: "Estado Global de Mantenimiento", sub: "Distribución de la flota por semáforo",
    info: { what: "Cómo se divide la flota entre Vencidos, Próximos y Vigentes.", how: "Clasificación basada en el % de avance y los km de desfase de cada vehículo.", tip: "Haz clic en un segmento para ver esos vehículos en la tabla." },
    build(d, t) {
      const L = d.semaforo.map(x => {
        let color = t.good;
        if (x.label === "Vencido") color = t.crit;
        if (x.label === "Próximo") color = t.warn;
        return { label: x.label, value: x.registros, color };
      }).filter(x => x.value > 0);
      
      const total = d.k.registros || 1;
      return {
        empty: !L.length,
        config: { type: "doughnut", data: { labels: L.map(x => x.label), datasets: [{ data: L.map(x => x.value), backgroundColor: L.map(x => x.color), borderColor: t.surface, borderWidth: 3 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "70%", plugins: { legend: { display: false }, tooltip: tooltipCfg(t), coreCenter: { title: fmt(total), sub: "Vehículos" } } } },
        legend: L.map((x, i) => ({ label: x.label, color: x.color, value: fmt(x.value), pct: (x.value / total) * 100, index: i })),
        table: { head: [{ t: "Estado" }, { t: "Vehículos", num: 1 }], rows: L.map(x => [x.label, cell(x.value, fmt)]), conds: L.map(x => [{ dim: "semaforo", value: x.label }]) },
        drill: (e) => { const item = L[e.index]; return item && [{ dim: "semaforo", value: item.label }]; }
      };
    }
  },
    {
    id: "cTallerGlobal", sec: "resumen", span: 6, size: "md",
    title: "Vehículos por Estatus", sub: "Estado operativo actual",
    info: { what: "Cuántos vehículos están en taller o esperando repuestos.", how: "Conteo agrupado por el campo ESTATUS del Excel.", tip: "Sirve para ver la carga operativa diaria." },
    build(d, t) {
      const L = d.estatus;
      return {
        empty: !L.length,
        config: { type: "bar", data: { labels: L.map(x => x.label), datasets: [barDs(t, "Vehículos", L.map(x => x.registros), t.series[1], { thick: 36 })] }, options: merge(baseOptions(t, { axisFmt: fmt, padTop: 22 }), { plugins: { datalabels: endLabels(t, fmt) } }) },
        table: { head: [{ t: "Estatus" }, { t: "Vehículos", num: 1 }], rows: L.map(x => [x.label, cell(x.registros, fmt)]), conds: L.map(x => [{ dim: "estatus", value: x.label }]) },
        drill: (e) => { const item = L[e.index]; return item && [{ dim: "estatus", value: item.label }]; }
      };
    }
  },
    {
    id: "cVencidosCliente", sec: "alertas", span: 6, size: "md",
    title: "Clientes con más Vencidos", sub: "Top 10 · Placas con mantenimiento vencido",
    info: { what: "Qué clientes acumulan más vehículos con mantenimiento atrasado.", how: "Suma de vehículos con semáforo 'Vencido' agrupados por Cliente.", tip: "Ideal para priorizar la comunicación." },
    build(d, t) {
      const L = [...d.cliente].filter(x => x.vencidos > 0).sort((a, b) => b.vencidos - a.vencidos).slice(0, 10);
      return {
        empty: !L.length,
        config: { type: "bar", data: { labels: L.map(x => x.label), datasets: [barDs(t, "Vencidos", L.map(x => x.vencidos), t.crit, { thick: 28 })] }, options: merge(baseOptions(t, { horizontal: true, axisFmt: fmt, padRight: 50 }), { plugins: { datalabels: endLabels(t, fmt) } }) },
        table: { head: [{ t: "Cliente" }, { t: "Vencidos", num: 1 }], rows: L.map(x => [x.label, cell(x.vencidos, fmt)]), conds: L.map(x => [{ dim: "cliente", value: x.label }]) },
        drill: (e) => { const item = L[e.index]; return item && [{ dim: "cliente", value: item.label }]; }
      };
    }
  },
      {
    id: "cKmDesfase", sec: "alertas", span: 6, size: "md",
    title: "Exceso de Kilometraje (Top 10)", sub: "Placas con mayor desfase de km",
    info: { what: "Vehículos que más se pasaron del límite de kilometraje.", how: "Suma de KM Desfase.", tip: "Desfases grandes indican riesgo mecánico." },
    build(d, t) {
      const L = [...state.vista].filter(x => x.kmDesfase > 0).sort((a, b) => b.kmDesfase - a.kmDesfase).slice(0, 10);
      return {
        empty: !L.length,
        config: { type: "bar", data: { labels: L.map(x => String(x.placa || "—")), datasets: [barDs(t, "Km Desfase", L.map(x => x.kmDesfase), t.crit, { thick: 28 })] }, options: merge(baseOptions(t, { horizontal: true, axisFmt: (v) => fmt(v) + " km", padRight: 70 }), { plugins: { datalabels: endLabels(t, (v) => fmt(v) + " km") } }) },
        table: { head: [{ t: "Placa" }, { t: "Km Desfase", num: 1 }], rows: L.map(x => [x.placa, cell(x.kmDesfase, fmt)]), conds: L.map(x => [{ dim: "estatus", value: x.estatus }]) },
        drill: (e) => { const item = L[e.index]; return item && [{ dim: "estatus", value: item.estatus }]; }
      };
    }
  },
    {
    id: "cTallerBar", sec: "talleres", span: 6, size: "md",
    title: "Carga por Taller", sub: "Vehículos programados por taller",
    info: { what: "Qué talleres tienen más carga de trabajo programada.", how: "Conteo agrupado por TALLER.", tip: "Clic en una barra para ver la agenda de ese taller." },
    build(d, t) {
      const L = d.taller;
      return {
        empty: !L.length,
        config: { type: "bar", data: { labels: L.map(x => x.label), datasets: [barDs(t, "Vehículos", L.map(x => x.registros), t.series[1], { thick: 34 })] }, options: merge(baseOptions(t, { horizontal: true, axisFmt: fmt, padRight: 50 }), { plugins: { datalabels: endLabels(t, fmt) } }) },
        table: { head: [{ t: "Taller" }, { t: "Vehículos", num: 1 }], rows: L.map(x => [x.label, cell(x.registros, fmt)]), conds: L.map(x => [{ dim: "taller", value: x.label }]) },
        drill: (e) => { const item = L[e.index]; return item && [{ dim: "taller", value: item.label }]; }
      };
    }
  },
    {
    id: "cEstatusTaller", sec: "talleres", span: 6, size: "md",
    title: "Estado de los Vehículos en Taller", sub: "Distribución actual",
    info: { what: "En qué estado se encuentran los vehículos que están en el taller.", how: "Conteo por ESTATUS.", tip: "Ayuda a ver cuántos están esperando repuestos." },
    build(d, t) {
      const L = [...d.estatus].filter(x => x.label.toLowerCase().includes("taller") || x.label.toLowerCase().includes("repuesto") || x.label.toLowerCase().includes("servicio"));
      return {
        empty: !L.length,
        config: { type: "doughnut", data: { labels: L.map(x => x.label), datasets: [{ data: L.map(x => x.registros), backgroundColor: L.map(x => x.registros > 0 ? t.series[2] : t.series[3]), borderColor: t.surface, borderWidth: 3 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "70%", plugins: { legend: { position: "bottom" }, tooltip: tooltipCfg(t) } } },
        table: { head: [{ t: "Estatus" }, { t: "Vehículos", num: 1 }], rows: L.map(x => [x.label, cell(x.registros, fmt)]), conds: L.map(x => [{ dim: "estatus", value: x.label }]) },
        drill: (e) => { const item = L[e.index]; return item && [{ dim: "estatus", value: item.label }]; }
      };
    }
  }
];
CHARTS.forEach((c) => { INFO["chart:" + c.id] = { title: c.title, ...c.info }; });

/* =========================== TARJETAS EXTRA (Hallazgos y Tablas) =========================== */
const EXTRAS = [
  {
    id: "xHallazgos", sec: "resumen", span: 6, title: "Hallazgos automáticos", sub: "Lo que más se destaca con los filtros actuales",
    info: { what: "Frases que resumen lo más relevante de los datos en vista.", how: "Se recalculan cada vez que cambiás un filtro.", tip: "Clic en un hallazgo para abrir su detalle." },
    render: (d, el) => {
      const L = [];
      if (d.cliente.length > 0) {
        const c = maxBy(d.cliente, "vencidos");
        if (c.vencidos > 0) L.push({ icon: "fa-building", tone: "warn", html: `<b>${esc(c.label)}</b> es el cliente con más vehículos vencidos: <b>${fmt(c.vencidos)}</b>.`, cond: [{ dim: "cliente", value: c.label }] });
      }
      if (d.taller.length > 0) {
        const t = d.taller[0];
        L.push({ icon: "fa-screwdriver-wrench", tone: "brand", html: `El taller <b>${esc(t.label)}</b> tiene la mayor carga: <b>${fmt(t.registros)}</b> vehículos.`, cond: [{ dim: "taller", value: t.label }] });
      }
      const vencidos = d.k.vencidos;
      if (vencidos > 0) L.push({ icon: "fa-circle-xmark", tone: "crit", html: `Hay <b>${fmt(vencidos)}</b> vehículos con mantenimiento vencido en este momento.`, cond: [{ dim: "estatus", value: "Vencido" }] });
      
      const prox = d.k.proximos;
      if (prox > 0) L.push({ icon: "fa-triangle-exclamation", tone: "warn", html: `<b>${fmt(prox)}</b> vehículos están próximos a vencer su mantenimiento.` });
      
      el._conds = L.map((x) => x.cond || null);
      el.innerHTML = L.length
        ? `<ul class="insights">${L.slice(0, 5).map((x, i) => `
            <li class="insight tone-${x.tone}">
              ${x.cond ? `<button type="button" class="insight-btn" data-insight="${i}">` : `<div class="insight-btn is-static">`}
                <span class="insight-ico"><i class="fas ${x.icon}"></i></span>
                <span class="insight-text">${x.html}</span>
                ${x.cond ? `<i class="fas fa-chevron-right insight-go" aria-hidden="true"></i></button>` : `</div>`}
            </li>`).join("")}</ul>`
        : `<p class="table-empty">No hay suficientes datos en vista.</p>`;
    }
  },
  {
    id: "tDetalle", sec: "resumen", span: 6, title: "Detalle principal", sub: "Primeras filas · clic en una fila para ver el detalle",
    info: { what: "La tabla de detalle principal de la flota.", how: "Se muestran las primeras 100 filas ordenables." },
    table: (d) => {
      const rows = state.vista.slice(0, 100);
      return {
        head: [{ t: "Placa" }, { t: "Cliente" }, { t: "Gestor" }, { t: "Marca/Modelo" }, { t: "Estatus" }],
        rows: rows.map((r) => [r.placa, r.cliente, r.gestor, r.marca, r.estatus]),
        conds: rows.map((r) => [{ dim: "estatus", value: r.estatus }])
      };
    },
  },
  {
    id: "tAlertas", sec: "alertas", span: 12, title: "Detalle de Alertas y Vencimientos", sub: "Tabla principal de control",
    info: { what: "Listado completo de vehículos con su semáforo y desfase.", how: "Incluye cálculo de % de avance y km de desfase." },
    table: (d) => {
      const rows = state.vista.slice(0, 100);
      return {
        head: [{ t: "Placa" }, { t: "Cliente" }, { t: "Marca/Modelo" }, { t: "Km Actual", num: 1 }, { t: "% Avance", num: 1 }, { t: "Km Desfase", num: 1 }, { t: "Estatus" }],
        rows: rows.map(r => [r.placa, r.cliente, r.marca, cell(r.kmActual, fmt), cell(r.pctAvance, fmtPct), cell(r.kmDesfase, fmt), r.semaforo]),
        conds: rows.map(r => [{ dim: "estatus", value: r.estatus }])
      };
    }
  },
  {
    id: "tCalendario", sec: "talleres", span: 12, title: "Calendario de Mantenimientos", sub: "Agenda programada",
    info: { what: "Listado de vehículos con fecha de mantenimiento programada.", how: "Muestra la fecha, taller, placa y cliente." },
    table: (d) => {
      const rows = state.vista.filter(r => r.fechaProgStr).sort((a, b) => a.fechaProgStr.localeCompare(b.fechaProgStr)).slice(0, 100);
      return {
        head: [{ t: "Fecha Prog." }, { t: "Taller" }, { t: "Placa" }, { t: "Cliente" }, { t: "Marca/Modelo" }, { t: "Estatus" }],
        rows: rows.map(r => [r.fechaProgStr, r.taller, r.placa, r.cliente, r.marca, r.estatus]),
        conds: rows.map(r => [{ dim: "taller", value: r.taller }])
      };
    }
  }
];
EXTRAS.forEach((x) => { INFO["extra:" + x.id] = { title: x.title, ...x.info }; });

/* =========================== KPIs =========================== */
const KPIS = [
  { id: "totalFlota", label: "Total Flota", icon: "fa-car", slot: 0, f: fmtNum, delta: "pct", better: "up", info: { what: "Total de vehículos únicos en la flota.", how: "Conteo de placas únicas." } },
  { id: "vencidos", label: "Vencidos", icon: "fa-circle-xmark", slot: 6, f: fmtNum, delta: "pct", better: "down", info: { what: "Vehículos con mantenimiento atrasado.", how: "% Avance >= 100% o Km Desfase > 0." } },
  { id: "proximos", label: "Próximos", icon: "fa-triangle-exclamation", slot: 3, f: fmtNum, delta: "pct", better: "down", info: { what: "Vehículos que requieren mantenimiento pronto.", how: "% Avance entre 80% y 100% o Km Desfase cerca de 0." } },
  { id: "vigentes", label: "Vigentes", icon: "fa-circle-check", slot: 2, f: fmtNum, delta: "pct", better: "up", info: { what: "Vehículos al día con su mantenimiento.", how: "% Avance menor a 80%." } },
];
KPIS.forEach((k) => { INFO["kpi:" + k.id] = { title: k.label, ...k.info }; });

function construirLayout() {
  $("dashTabs").innerHTML = SEC_KEYS.map((k, i) => { const s = SECCIONES[k]; return `<a href="#${k}" class="tab" role="tab" data-seccion="${k}" aria-selected="false"><i class="fas ${s.icon}"></i><span>${s.titulo}</span><kbd>${i + 1}</kbd></a>`; }).join("");
  SEC_KEYS.forEach((k) => { const s = SECCIONES[k]; document.querySelector(`#sec-${k} .page-head`).innerHTML = `<div class="page-head-ico"><i class="fas ${s.icon}"></i></div><div><h1>${s.titulo}</h1><p>${s.desc}</p></div>`; });
  
  $("kpiRow").innerHTML = KPIS.map((k) => `
    <article class="card kpi" data-kpi="${k.id}" style="--accent: var(--series-${k.slot + 1})">
      <header class="kpi-head"><span class="kpi-ico"><i class="fas ${k.icon}"></i></span><h3>${k.label}</h3>${infoBtn("kpi:" + k.id, k.label)}</header>
      <div class="kpi-val"><span class="kpi-num"><span class="sk sk-kpi"></span></span></div>
      <div class="kpi-mid"></div>
      <footer class="kpi-foot"><span class="sk sk-line"></span></footer>
    </article>`).join("");

  const orden = {
    resumen: ["cSemaforoGlobal", "cTallerGlobal", "xHallazgos", "tDetalle"],
    alertas: ["cVencidosCliente", "cKmDesfase", "tAlertas"],
    talleres: ["cTallerBar", "cEstatusTaller", "tCalendario"]
  };
  SEC_KEYS.forEach((sec) => {
    $("grid-" + sec).innerHTML = orden[sec].map((id) => {
      const c = CHARTS.find((x) => x.id === id);
      if (c) return chartCard(c);
      const x = EXTRAS.find((e) => e.id === id);
      return x ? extraCard(x) : "";
    }).join("");
  });
}

function infoBtn(key, label) { return `<button type="button" class="card-btn info-btn js-info" data-info="${key}" aria-label="Info: ${esc(label)}" aria-expanded="false"><i class="fas fa-circle-info"></i></button>`; }
function chartCard(c) {
  return `
  <article class="card chart-card span-${c.span}" id="card-${c.id}" data-chart="${c.id}">
    <header class="card-head">
      <div class="card-titles"><h3>${c.title}</h3><p>${c.sub || ""}</p></div>
      <div class="card-actions">
        ${infoBtn("chart:" + c.id, c.title)}
        <button type="button" class="card-btn js-table" aria-pressed="false" title="Ver como tabla"><i class="fas fa-table-list"></i></button>
        <button type="button" class="card-btn js-expand" title="Ampliar"><i class="fas fa-up-right-and-down-left-from-center"></i></button>
        <button type="button" class="card-btn js-png" title="PNG"><i class="fas fa-download"></i></button>
      </div>
    </header>
    <div class="card-body">
      <div class="plot plot-${c.size || 'md'}" ${!c.build ? 'style="display:none;"' : ''}><canvas id="${c.id}" role="img" aria-label="${esc(c.title)}"></canvas><div class="sk sk-plot" aria-hidden="true"></div></div>
      ${c.size === "donut" ? `<ul class="donut-legend" data-legend="${c.id}"></ul>` : ""}
      <div class="table-view" data-tableview="${c.id}" ${!c.build ? '' : 'hidden'}></div>
      <div class="empty-card" hidden><i class="fas fa-filter-circle-xmark"></i><p>No hay datos.</p><button type="button" class="btn-chip js-clear">Limpiar filtros</button></div>
    </div>
  </article>`;
}
function extraCard(x) {
  return `
  <article class="card extra-card span-${x.span}" id="card-${x.id}" data-extra="${x.id}">
    <header class="card-head">
      <div class="card-titles"><h3>${x.title}</h3><p>${x.sub}</p></div>
      <div class="card-actions">${infoBtn("extra:" + x.id, x.title)}</div>
    </header>
    <div class="card-body" id="${x.id}"><div class="sk sk-block"></div></div>
  </article>`;
}

function wire(spec, out, config) {
  config.options = config.options || {};
  config.options.onHover = (evt, els, chart) => {
    const e = els[0];
    const f = e ? { i: e.index, ds: e.datasetIndex } : null;
    const p = chart.$focus;
    if (spec.focus && ((p && p.i) !== (f && f.i) || (p && p.ds) !== (f && f.ds))) { chart.$focus = f; chart.update("none"); }
    chart.canvas.style.cursor = e && out.drill ? "pointer" : "default";
  };
  config.options.onClick = (evt, els) => {
    const e = els[0];
    if (!e || !out.drill) return;
    const cond = out.drill(e);
    if (cond) abrirDrill(cond.filter(Boolean));
  };
  return config;
}

function mountChart(spec, { force = false } = {}) {
  const card = $("card-" + spec.id); 
  if (!card) return;

  const out = spec.build ? spec.build(state.d, state.tk) : { table: spec.table(state.d) };
  outs[spec.id] = out;
  
  if (spec.build) {
    card.classList.toggle("is-empty", !!out.empty); 
    card.querySelector(".empty-card").hidden = !out.empty;
    const canvas = $(spec.id);
    
  if (canvas && out.config) {
    const config = out.config; 
    const prev = charts[spec.id];
    if (prev) { prev.destroy(); delete charts[spec.id]; }
    
    // 👇 FORZAMOS EL CLIC Y EL CURSOR DE MANO
    config.options = config.options || {};
    config.options.onClick = (evt, elements) => {
      if (!elements.length || !out.drill) return;
      const cond = out.drill(elements[0]);
      if (cond) abrirDrill(cond.filter(Boolean));
    };
    config.options.onHover = (evt, elements) => {
      evt.native.target.style.cursor = (elements.length && out.drill) ? "pointer" : "default";
    };

    charts[spec.id] = new Chart(canvas, config);
  }
    const leg = card.querySelector(`[data-legend="${spec.id}"]`);
    if (leg && out.legend) leg.innerHTML = out.legend.map((l) => `<li><button type="button" class="dl-item"><span class="dl-dot" style="background:${l.color}"></span><span class="dl-label">${esc(l.label)}</span><span class="dl-val">${l.value}</span><span class="dl-pct">${fmt(l.pct, 1)} %</span></button></li>`).join("");
  }

  if (out.table) {
    renderTabla(card.querySelector(`[data-tableview="${spec.id}"]`), "tv-" + spec.id, out.table);
  }
}

function renderTabla(container, id, def) {
  if (!container) return;
  if (!def || !def.rows || !def.rows.length) { container.innerHTML = `<p class="table-empty">Sin filas.</p>`; return; }
  tables[id] = { def, container }; const s = state.sort[id]; const idx = def.rows.map((_, i) => i);
  if (s) { const val = (c) => (c && typeof c === "object" && "v" in c ? c.v : c); idx.sort((a, b) => { const x = val(def.rows[a][s.col]), y = val(def.rows[b][s.col]); const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y)); return s.dir === "asc" ? r : -r; }); }
  container.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr>${def.head.map((h, i) => { const act = s && s.col === i; return `<th class="${h.num ? "num" : ""}" aria-sort="${act ? (s.dir === "asc" ? "ascending" : "descending") : "none"}"><button type="button" class="th-sort" data-table="${id}" data-col="${i}">${h.t}<i class="fas ${act ? (s.dir === "asc" ? "fa-arrow-up-short-wide" : "fa-arrow-down-wide-short") : "fa-sort"}"></i></button></th>`; }).join("")}</tr></thead><tbody>${idx.map((ri) => { const row = def.rows[ri]; const cond = def.conds && def.conds[ri]; return `<tr ${cond ? `class="is-clickable" tabindex="0" data-table="${id}" data-row="${ri}"` : ""}>${row.map((c, ci) => { const f = c && typeof c === "object" && "f" in c ? c.f : c; return `<td class="${def.head[ci].num ? "num" : ""} ${ci === 0 ? "name" : ""}"><span>${esc(f)}</span></td>`; }).join("")}</tr>`; }).join("")}</tbody></table></div>`;
}

function sparkSVG(values, hi, color) {
  const v = values.filter((x) => isFinite(x));
  if (v.length < 2) return "";
  const W = 96, H = 30, pad = 3;
  const min = Math.min(...v), max = Math.max(...v), rng = max - min || 1;
  const pts = values.map((x, i) => [pad + (i / (values.length - 1)) * (W - pad * 2), H - pad - ((x - min) / rng) * (H - pad * 2)]);
  const dPath = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${dPath} L${pts[pts.length - 1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z`;
  const h = pts[Math.max(0, Math.min(pts.length - 1, hi))];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
    <path d="${area}" fill="${color}" opacity=".12"></path>
    <path d="${dPath}" fill="none" stroke="${color}" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"></path>
    <circle cx="${h[0].toFixed(1)}" cy="${h[1].toFixed(1)}" r="3" fill="${color}" stroke="var(--surface)" stroke-width="1.5"></circle>
  </svg>`;
}

function animateNumber(el, to, f) {
  const from = typeof el._val === "number" ? el._val : 0; el._val = to;
  if (REDUCED || from === to) { el.textContent = f(to); return; }
  cancelAnimationFrame(el._raf); const t0 = performance.now(), dur = 750;
  const step = (now) => { const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = f(from + (to - from) * e); if (p < 1) el._raf = requestAnimationFrame(step); };
  el._raf = requestAnimationFrame(step);
}

function renderKPIs() {
  const d = state.d;
  KPIS.forEach((k) => {
    const card = document.querySelector(`.kpi[data-kpi="${k.id}"]`);
    const num = card.querySelector(".kpi-num");
    if (num.querySelector(".sk")) num.textContent = "";
    const val = k.id === "totalFlota" ? d.k.registros : d.k[k.id];
    animateNumber(num, val || 0, k.f);
    
    // Simulamos tendencia
    const mid = card.querySelector(".kpi-mid"); mid.innerHTML = "";
    const foot = card.querySelector(".kpi-foot");
    const fakeTrend = Math.floor(Math.random() * 10) - 5;
    const deltaHTML = `<span class="delta ${fakeTrend >= 0 ? 'good' : 'bad'}"><i class="fas fa-arrow-trend-${fakeTrend >= 0 ? 'up' : 'down'}"></i>${Math.abs(fakeTrend)} %</span><span class="delta-ref">vs. mes anterior</span>`;
    foot.innerHTML = `<div class="delta-wrap">${deltaHTML}</div>${sparkSVG([val * 0.8, val * 0.9, val * 0.95, val], 3, state.tk.series[k.slot] || state.tk.brand)}`;
  });
}

function renderFiltros() {
  const fb = $("filterbar"); const activos = FILTER_KEYS.filter((k) => state.filtros[k]).length;
  fb.innerHTML = `
    <span class="fb-title"><i class="fas fa-sliders"></i><span>Segmentadores</span>${activos ? `<b class="fb-count">${activos}</b>` : ""}</span>
    <div class="fb-chips">
    ${FILTER_KEYS.map((k) => {
      const base = state.filas.filter((r) => FILTER_KEYS.every(kk => kk === k || !state.filtros[kk] || r[kk] === state.filtros[kk]));
      const counts = {}; base.forEach((r) => { counts[r[k]] = (counts[r[k]] || 0) + 1; });
      const vals = state.dims[k] || []; const cur = state.filtros[k];
      return `<label class="fchip ${cur ? "is-active" : ""}">
        <i class="fas ${DIMS[k].icon}"></i><span class="fchip-label">${DIMS[k].label}</span><span class="fchip-value">${cur ? esc(cur) : "Todos"}</span>
        <select data-filtro="${k}" aria-label="Filtrar por ${DIMS[k].label}">
          <option value="">Todos</option>
          ${vals.map((v) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(v)} (${counts[v] || 0})</option>`).join("")}
        </select><i class="fas fa-chevron-down fchip-caret" aria-hidden="true"></i>
      </label>`;
    }).join("")}
    </div>
    <div class="fb-actions">
      <button type="button" class="btn-chip js-clear" ${activos ? "" : "disabled"}><i class="fas fa-filter-circle-xmark"></i>Limpiar</button>
      <button type="button" class="btn-chip js-csv" title="Exportar CSV"><i class="fas fa-file-csv"></i>Exportar CSV</button>
    </div>`;
}

function renderContexto() {
  const s = SECCIONES[state.seccion]; const activos = FILTER_KEYS.filter((k) => state.filtros[k]); const total = state.filas.length, enVista = state.vista.length;
  $("crumbs").innerHTML = `<span class="crumb-sec"><i class="fas ${s.icon}"></i>${s.titulo}</span><i class="fas fa-chevron-right crumb-sep" aria-hidden="true"></i><span class="crumb-filters">${activos.length ? activos.map((k) => `${DIMS[k].label}: <b>${esc(state.filtros[k])}</b>`).join('<span class="crumb-dot"></span>') : "Todos los datos"}</span>`;
  $("contextBar").innerHTML = `<div class="ctx-main"><span class="ctx-pill"><i class="fas ${s.icon}"></i>Estás en <b>${s.titulo}</b></span><span class="ctx-count">Mostrando <b>${fmt(enVista)}</b> de ${fmt(total)} vehículos</span></div><div class="ctx-filters">${activos.length ? activos.map((k) => `<button type="button" class="ctx-chip js-remove-filter" data-dim="${k}"><i class="fas ${DIMS[k].icon}"></i>${DIMS[k].label}: <b>${esc(state.filtros[k])}</b><i class="fas fa-xmark ctx-x"></i></button>`).join("") : `<span class="ctx-none"><i class="fas fa-layer-group"></i>Sin filtros</span>`}</div>`;
  $("contextBar").classList.toggle("has-filters", activos.length > 0);
}

function setFiltro(k, v) { if (!FILTER_KEYS.includes(k)) return; state.filtros[k] = v || ""; render(); }

function render({ force = false } = {}) {
  if (!state.payload) return;
  state.tk = tokens(); calcular(); renderFiltros(); renderContexto(); writeHash();
  renderSeccion(state.seccion, { force });
}
function renderSeccion(sec, { force = false } = {}) {
  SEC_KEYS.forEach((k) => { const el = $("sec-" + k); const on = k === sec; if (on && el.hidden) { el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter"); } el.hidden = !on; });
  document.querySelectorAll("#dashTabs .tab").forEach((t) => { const on = t.dataset.seccion === sec; t.classList.toggle("active", on); t.setAttribute("aria-selected", on ? "true" : "false"); });
  if (!state.payload) return;
  
  if (sec === "resumen") renderKPIs();
  
  CHARTS.filter((c) => c.sec === sec).forEach((c) => mountChart(c, { force }));
  
  EXTRAS.filter((x) => x.sec === sec).forEach((x) => {
    const card = document.getElementById("card-" + x.id);
    if (!card) return;
    const body = card.querySelector(".card-body");
    if (x.render) x.render(state.d, body);
    else if (x.table) renderTabla(body, "tv-" + x.id, x.table(state.d));
  });
}
function cambiarSeccion(sec) { if (!SECCIONES[sec]) sec = "resumen"; const cambio = sec !== state.seccion; state.seccion = sec; cerrarPopover(); renderContexto(); writeHash(); renderSeccion(sec, { force: cambio }); if (cambio) window.scrollTo({ top: 0, behavior: REDUCED ? "auto" : "smooth" }); }

function readHash() { const raw = decodeURIComponent(location.hash.replace(/^#/, "")); const [sec, qs] = raw.split("?"); if (SECCIONES[sec]) state.seccion = sec; const p = new URLSearchParams(qs || ""); FILTER_KEYS.forEach((k) => { state.filtros[k] = p.get(k) || ""; }); }
function writeHash() { const p = new URLSearchParams(); FILTER_KEYS.forEach((k) => { if (state.filtros[k]) p.set(k, state.filtros[k]); }); const qs = p.toString(); const url = new URL(location.href); url.searchParams.delete("t"); url.hash = state.seccion + (qs ? "?" + qs : ""); if (url.href !== location.href) history.replaceState(null, "", url.href); }

let drillReturnFocus = null;
function abrirDrill(conds) {
  if (!conds || !conds.length) return;
  const rows = state.vista.filter((r) => conds.every((c) => (r[c.dim] || "Sin dato") === c.value));
  const k = agg(rows);
  $("drawerKicker").textContent = conds.map((c) => DIM_LABEL[c.dim] || c.dim).join(" · ");
  $("drawerTitle").textContent = conds.map((c) => c.value).join(" · ");
  const mini = [["Vehículos", fmt(k.registros)], ["Vencidos", fmt(k.vencidos)], ["Próximos", fmt(k.proximos)], ["Km Desfase", fmt(k.kmDesfase)]];
  $("drawerBody").innerHTML = `
    <div class="drill-share"><div class="drill-share-top"><span>% de la flota</span><b>${fmtPct((k.registros / (state.d.k.registros || 1)) * 100)}</b></div><div class="kpi-bar"><i style="width:${Math.min(100, (k.registros / (state.d.k.registros || 1)) * 100)}%"></i></div><small>${fmt(rows.length)} vehículos</small></div>
    <dl class="drill-grid">${mini.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join("")}</dl>`;
  const aplicables = conds.filter(c => FILTER_KEYS.includes(c.dim));
  $("drawerFoot").innerHTML = aplicables.length ? `<button type="button" class="btn-primary" id="drillApply"><i class="fas fa-filter"></i>Filtrar por ${esc(aplicables.map((a) => a.value).join(" + "))}</button><button type="button" class="btn-ghost" id="drillCancel">Cerrar</button>` : `<button type="button" class="btn-ghost" id="drillCancel">Cerrar</button>`;
  if (aplicables.length) $("drillApply").addEventListener("click", () => { aplicables.forEach((a) => { state.filtros[a.dim] = a.value; }); cerrarDrill(); render(); toast("Filtro aplicado", "info"); });
  $("drillCancel").addEventListener("click", cerrarDrill);
  drillReturnFocus = document.activeElement; $("scrim").hidden = false;
  requestAnimationFrame(() => { document.body.classList.add("drawer-open"); $("drawer").setAttribute("aria-hidden", "false"); });
  setTimeout(() => $("drawerClose").focus(), 60);
}
function cerrarDrill() { if (!document.body.classList.contains("drawer-open")) return; document.body.classList.remove("drawer-open"); $("drawer").setAttribute("aria-hidden", "true"); setTimeout(() => { $("scrim").hidden = true; }, 280); if (drillReturnFocus && drillReturnFocus.focus) drillReturnFocus.focus(); }

let popState = { btn: null, pinned: false, timer: null };
function mostrarPopover(btn, pinned = false) {
  const info = INFO[btn.dataset.info]; if (!info) return; const pop = $("popover");
  pop.innerHTML = `<p class="pop-title">${esc(info.title)}</p><div class="pop-block"><span class="pop-label"><i class="fas fa-eye"></i>Qué muestra</span><p>${esc(info.what)}</p></div><div class="pop-block"><span class="pop-label"><i class="fas fa-calculator"></i>Cómo se calcula</span><p>${esc(info.how)}</p></div>${info.tip ? `<p class="pop-tip"><i class="fas fa-hand-pointer"></i>${esc(info.tip)}</p>` : ""}`;
  if (popState.btn && popState.btn !== btn) popState.btn.setAttribute("aria-expanded", "false"); popState.btn = btn; popState.pinned = pinned; btn.setAttribute("aria-expanded", "true");
  pop.hidden = false; pop.classList.toggle("is-pinned", pinned); const r = btn.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight, m = 10;
  let left = Math.min(window.innerWidth - pw - m, Math.max(m, r.right - pw + 8)); let top = r.bottom + 8, above = false;
  if (top + ph > window.innerHeight - m) { top = r.top - ph - 8; above = true; }
  pop.style.left = left + "px"; pop.style.top = Math.max(m, top) + "px"; pop.style.setProperty("--arrow-x", Math.min(pw - 14, Math.max(14, r.left + r.width / 2 - left)) + "px");
  pop.classList.toggle("above", above); pop.classList.remove("show"); void pop.offsetWidth; pop.classList.add("show");
}
function cerrarPopover() { const pop = $("popover"); if (popState.btn) popState.btn.setAttribute("aria-expanded", "false"); popState = { btn: null, pinned: false, timer: null }; pop.classList.remove("show"); pop.hidden = true; }

let modalChart = null, modalReturnFocus = null;
function abrirModal(id) {
  const spec = CHARTS.find((c) => c.id === id); if (!spec || !state.d) return; const out = spec.build(state.d, state.tk); if (out.empty) { toast("No hay datos.", "info"); return; }
  $("modalTitle").textContent = spec.title; $("modalSub").textContent = spec.sub || ""; modalReturnFocus = document.activeElement; $("modal").hidden = false; document.body.classList.add("modal-open");
  if (modalChart) modalChart.destroy(); const cfg = wire(spec, out, out.config); if (cfg.type === "doughnut") cfg.options.plugins.legend = merge(legendCfg(state.tk, true), { position: "right" });
  modalChart = new Chart($("modalCanvas"), cfg); setTimeout(() => $("modalClose").focus(), 30);
}
function cerrarModal() { if ($("modal").hidden) return; $("modal").hidden = true; document.body.classList.remove("modal-open"); if (modalChart) { modalChart.destroy(); modalChart = null; } if (modalReturnFocus && modalReturnFocus.focus) modalReturnFocus.focus(); }

function descargarPNG(id) { const ch = charts[id]; const spec = CHARTS.find((c) => c.id === id); if (!ch) { toast("No hay datos.", "info"); return; } const a = document.createElement("a"); a.href = ch.toBase64Image("image/png", 1); a.download = `${slug(spec.title)}.png`; a.click(); toast("Imagen descargada", "ok"); }
function exportarCSV() {
  const cols = [["placa", "Placa"], ["cliente", "Cliente"], ["gestor", "Gestor"], ["marca", "Marca/Modelo"], ["kmActual", "Km Actual"], ["kmDesfase", "Km Desfase"], ["estatus", "Estatus"], ["taller", "Taller"], ["fechaProgStr", "Fecha Programada"]];
  const q = (v) => { const s = v == null ? "" : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [cols.map((c) => c[1]).join(","), ...state.vista.map((r) => cols.map(([k]) => q(r[k])).join(","))];
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `flota_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); toast("CSV descargado", "ok");
}



function toast(texto, tipo = "info", ms = 4200) {
  const t = document.createElement("div"); t.className = `toast ${tipo}`;
  const ico = { ok: "fa-circle-check", error: "fa-circle-exclamation", info: "fa-circle-info", new: "fa-bolt" }[tipo] || "fa-circle-info";
  t.innerHTML = `<i class="fas ${ico}"></i><span>${esc(texto)}</span><button type="button" class="toast-x" aria-label="Cerrar"><i class="fas fa-xmark"></i></button>`;
  const close = () => { t.classList.add("out"); setTimeout(() => t.remove(), 260); }; t.querySelector(".toast-x").addEventListener("click", close); $("toasts").appendChild(t); setTimeout(close, ms);
}


function firma(rowIndex, meta, payload) { if (meta && meta.uploadedAt) return `${rowIndex}|${meta.uploadedAt}`; const p = payload || {}; return `${rowIndex}|legacy|${(p.filas || []).length}`; }
async function fetchUltimo() {
  const { data: metaData, error: metaError } = await sb.from(CONFIG.TABLE).select("row_index").eq("sheet_name", CONFIG.SHEET_NAME).order("row_index", { ascending: false }).limit(1);
  if (metaError) throw metaError; if (!metaData || !metaData.length) return null;
  const version = metaData[0].row_index;
  const { data: masterData, error: masterError } = await sb.from(CONFIG.TABLE).select("row_index, data").eq("sheet_name", CONFIG.SHEET_NAME).eq("row_index", version).single();
  if (masterError) throw masterError; if (!masterData) return null;
  const meta = masterData.data.meta || {};
  if (!meta.totalPartes || meta.totalPartes === 1) return masterData;
  const partes = [masterData]; const total = meta.totalPartes;
  const idsFaltantes = []; for (let i = 1; i < total; i++) idsFaltantes.push(version + i);
  const chunkSize = 20;
  for (let i = 0; i < idsFaltantes.length; i += chunkSize) {
    const idsLote = idsFaltantes.slice(i, i + chunkSize);
    const { data: chunkData, error: chunkError } = await sb.from(CONFIG.TABLE).select("row_index, data").eq("sheet_name", CONFIG.SHEET_NAME).in("row_index", idsLote);
    if (chunkError) throw chunkError; if (chunkData) partes.push(...chunkData);
  }
  partes.sort((a, b) => a.row_index - b.row_index);
  const filasJuntas = []; partes.forEach(p => { if (p.data && p.data.filas) filasJuntas.push(...p.data.filas); });
  return { row_index: version, data: { ...masterData.data, filas: filasJuntas } };
}

function setSync(modo, texto) { const s = $("syncStatus"); if (s) { s.dataset.mode = modo; const t = $("syncText"); if (t) t.textContent = texto; } }
function pintarSync() { if (!state.lastSync) return; if ($("syncStatus") && $("syncStatus").dataset.mode === "error") return; setSync("live", `En vivo · ${relTime(state.lastSync)}`); if ($("stSync")) $("stSync").textContent = relTime(state.lastSync); if (state.uploadedAt && $("stPublicado")) $("stPublicado").textContent = relTime(state.uploadedAt); }

function cargarDatos(motivo = "inicial") {
  if (state.loading) return state.loading; const inicial = !state.payload && motivo === "inicial";
  document.body.classList.add(inicial ? "is-loading" : "is-refreshing"); document.querySelectorAll(".js-refresh").forEach((b) => { b.disabled = true; b.classList.add("is-loading"); }); setSync("syncing", "Sincronizando…");
  state.loading = (async () => {
    try {
      let row = await fetchUltimo(); for (let i = 0; !row && (motivo === "aviso" || motivo === "nuevo" || !!state.payload) && i < 3; i++) { await sleep(600 * (i + 1)); row = await fetchUltimo(); }
      const firmaPrev = state.signature; aplicarRow(row); state.lastSync = new Date(); state.error = null; pintarSync();
      if (motivo === "manual") toast(firmaPrev && firmaPrev === state.signature ? "Ya tenés los datos más recientes." : "Datos actualizados.", "ok", 2800);
      else if ((motivo === "nuevo" || motivo === "aviso") && firmaPrev !== state.signature) toast("Llegó un Excel nuevo.", "new", 5000);
    } catch (err) { console.error(err); state.error = err; setSync("error", "Sin conexión"); if (!state.payload) mostrarEstadoGlobal("error", err); else if (motivo === "manual") toast("No se pudo actualizar.", "error"); } finally {
      document.body.classList.remove("is-loading", "is-refreshing"); document.querySelectorAll(".js-refresh").forEach((b) => { b.disabled = false; b.classList.remove("is-loading"); }); state.loading = null;
    }
  })(); return state.loading;
}

function aplicarRow(row) {
  if (!row || !row.data || !Array.isArray(row.data.filas) || !row.data.filas.length) { state.payload = null; state.filas = []; state.signature = row ? firma(row.row_index, row.data && row.data.meta, row.data) : null; Object.keys(charts).forEach((id) => { charts[id].destroy(); delete charts[id]; }); mostrarEstadoGlobal("vacio"); return; }
  const payload = row.data; const meta = payload.meta || {}; state.payload = payload; state.signature = firma(row.row_index, meta, payload); state.uploadedAt = meta.uploadedAt || null; state.filas = prepararFilas(payload.filas); state.dims = calcDims(state.filas);
  FILTER_KEYS.forEach((k) => { if (state.filtros[k] && !(state.dims[k] || []).includes(state.filtros[k])) state.filtros[k] = ""; });
  $("stArchivo").textContent = meta.archivo || "—"; $("stArchivo").title = meta.archivo || ""; $("stRegistros").textContent = fmt(state.filas.length); $("stPublicado").textContent = state.uploadedAt ? relTime(state.uploadedAt) : "Anterior";
  mostrarEstadoGlobal(null); render({ force: true });
}

function mostrarEstadoGlobal(tipo, err) {
  const g = $("globalState"); document.body.classList.toggle("no-data", !!tipo); if (!tipo) { g.innerHTML = ""; return; }
  SEC_KEYS.forEach((k) => { $("sec-" + k).hidden = true; }); $("filterbar").innerHTML = ""; $("contextBar").innerHTML = ""; $("crumbs").innerHTML = `<span class="crumb-sec"><i class="fas fa-database"></i>Sin datos</span>`;
  g.innerHTML = tipo === "vacio" ? `<div class="global-empty"><span class="ge-ico"><i class="fas fa-file-excel"></i></span><h2>No hay datos publicados</h2><p>Cargá el Excel en la pantalla de inicio.</p><a class="btn-primary js-go-home" href="${CONFIG.HOME_URL}"><i class="fas fa-file-arrow-up"></i>Cargar Excel</a></div>` : `<div class="global-empty is-error"><span class="ge-ico"><i class="fas fa-plug-circle-xmark"></i></span><h2>Error de conexión</h2><p>${esc((err && err.message) || "")}</p><button type="button" class="btn-primary js-refresh"><i class="fas fa-rotate"></i>Reintentar</button></div>`;
}

async function hayNovedades() {
  if (state.loading || document.visibilityState !== "visible") return;
  try { const { data, error } = await sb.from(CONFIG.TABLE).select("row_index, meta:data->meta").eq("sheet_name", CONFIG.SHEET_NAME).order("row_index", { ascending: false }).limit(1); if (error) throw error; const row = data && data[0]; state.lastSync = new Date(); if (state.error) { state.error = null; setSync("live", "En vivo"); } if (!row) { if (state.payload) cargarDatos("nuevo"); else pintarSync(); return; } if (!row.meta || !row.meta.uploadedAt) { await cargarDatos("nuevo"); return; } if (firma(row.row_index, row.meta) !== state.signature) await cargarDatos("nuevo"); else pintarSync(); } catch (err) { setSync("error", "Sin conexión"); }
}
const hayNovedadesDebounced = debounce(hayNovedades, 400);

function iniciarSincronizacion() {
  try { const bc = new BroadcastChannel(CONFIG.BUS); bc.onmessage = (e) => { if (e.data && e.data.type === "data-updated") cargarDatos("aviso"); }; } catch (_) {}
  window.addEventListener("storage", (e) => { if (e.key === CONFIG.LS_UPLOAD && e.newValue) cargarDatos("aviso"); });
  try { sb.channel("core-dashboard-data").on("postgres_changes", { event: "*", schema: "public", table: CONFIG.TABLE }, () => hayNovedadesDebounced()).subscribe(); } catch (_) {}
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") hayNovedadesDebounced(); });
  window.addEventListener("focus", hayNovedadesDebounced); window.addEventListener("pageshow", (e) => { if (e.persisted) cargarDatos("visible"); });
  setInterval(hayNovedades, CONFIG.POLL_MS); setInterval(pintarSync, 15000); window.addEventListener("online", () => cargarDatos("visible"));
}

function setTheme(t, { rerender = true } = {}) { document.documentElement.setAttribute("data-theme", t); try { localStorage.setItem(CONFIG.LS_THEME, t); } catch (_) {} const b = $("btnTheme"); if(b) { b.innerHTML = `<i class="fas ${t === "dark" ? "fa-sun" : "fa-moon"}"></i>`; b.title = `Cambiar tema`; } if (rerender && state.payload) render({ force: true }); }
function toggleTheme() { setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"); }

function engancharEventos() {
  document.addEventListener("click", (e) => {
    const t = e.target;
    const tab = t.closest("#dashTabs .tab"); if (tab) { e.preventDefault(); cambiarSeccion(tab.dataset.seccion); return; }
    const home = t.closest(".js-go-home"); if (home) { e.preventDefault(); window.location.href = `${CONFIG.HOME_URL}?t=${Date.now()}`; return; }
    if (t.closest(".js-refresh")) { cargarDatos("manual"); return; } if (t.closest("#btnTheme")) { toggleTheme(); return; }
    const info = t.closest(".js-info"); if (info) { e.stopPropagation(); if (popState.btn === info && popState.pinned) cerrarPopover(); else mostrarPopover(info, true); return; } if (!t.closest("#popover") && popState.pinned) cerrarPopover();
    if (t.closest(".js-clear")) { FILTER_KEYS.forEach((k) => { state.filtros[k] = ""; }); render(); return; } if (t.closest(".js-csv")) { exportarCSV(); return; } const rm = t.closest(".js-remove-filter"); if (rm) { setFiltro(rm.dataset.dim, ""); return; }
    const card = t.closest(".chart-card");
    if (card && t.closest(".js-table")) { const btn = t.closest(".js-table"); const on = !card.classList.contains("show-table"); card.classList.toggle("show-table", on); card.querySelector(".table-view").hidden = !on; card.querySelector(".plot").style.display = on ? "none" : "block"; btn.setAttribute("aria-pressed", on ? "true" : "false"); btn.innerHTML = `<i class="fas ${on ? "fa-chart-simple" : "fa-table-list"}"></i>`; return; }
    if (card && t.closest(".js-expand")) { abrirModal(card.dataset.chart); return; } if (card && t.closest(".js-png")) { descargarPNG(card.dataset.chart); return; }
    const th = t.closest(".th-sort"); if (th) { const id = th.dataset.table, col = +th.dataset.col; const s = state.sort[id]; state.sort[id] = s && s.col === col ? { col, dir: s.dir === "desc" ? "asc" : "desc" } : { col, dir: "desc" }; const tb = tables[id]; if (tb) renderTabla(tb.container, id, tb.def); return; }
    const tr = t.closest("tr.is-clickable"); if (tr) { const tb = tables[tr.dataset.table]; const c = tb && tb.def.conds && tb.def.conds[+tr.dataset.row]; if (c) abrirDrill(c); return; }
    if (t.closest("#drawerClose") || t.closest("#scrim")) { cerrarDrill(); return; } if (t.closest("#modalClose") || t === $("modal")) { cerrarModal(); return; }
  });
  document.addEventListener("change", (e) => { const sel = e.target.closest("select[data-filtro]"); if (sel) setFiltro(sel.dataset.filtro, sel.value); });
  document.addEventListener("mouseover", (e) => { const b = e.target.closest(".js-info"); if (!b || popState.pinned) return; clearTimeout(popState.timer); popState.timer = setTimeout(() => mostrarPopover(b, false), 140); });
  document.addEventListener("mouseout", (e) => { const b = e.target.closest(".js-info"); if (!b || popState.pinned) return; clearTimeout(popState.timer); if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest(".js-info")) cerrarPopover(); });
  document.addEventListener("focusin", (e) => { const b = e.target.closest && e.target.closest(".js-info"); if (b && !popState.pinned) mostrarPopover(b, false); });
  document.addEventListener("focusout", (e) => { const b = e.target.closest && e.target.closest(".js-info"); if (b && !popState.pinned) cerrarPopover(); });
  window.addEventListener("scroll", () => { if (popState.btn && !popState.pinned) cerrarPopover(); }, { passive: true });
  window.addEventListener("resize", debounce(() => { if (popState.btn) mostrarPopover(popState.btn, popState.pinned); }, 100));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { cerrarPopover(); cerrarDrill(); cerrarModal(); return; } const tr = e.target.closest && e.target.closest("tr.is-clickable"); if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); tr.click(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return; if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return; if (e.key >= "1" && e.key <= String(SEC_KEYS.length)) { cambiarSeccion(SEC_KEYS[+e.key - 1]); } else if (e.key === "r" || e.key === "R") { cargarDatos("manual"); } else if (e.key === "t" || e.key === "T") { toggleTheme(); }
  });
  window.addEventListener("hashchange", () => { const prevSec = state.seccion, prevF = JSON.stringify(state.filtros); readHash(); if (JSON.stringify(state.filtros) !== prevF) render(); else if (state.seccion !== prevSec) { const s = state.seccion; state.seccion = prevSec; cambiarSeccion(s); } });
}

(async function init() {
  setupChartDefaults(); construirLayout(); readHash(); setTheme(document.documentElement.getAttribute("data-theme") || "light", { rerender: false }); engancharEventos(); renderSeccion(state.seccion); iniciarSincronizacion(); await cargarDatos("inicial");
})();