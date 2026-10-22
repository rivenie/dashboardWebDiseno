const SUPABASE_URL = "https://ffiuayjfnhlvxgktxbal.supabase.co";
const SUPABASE_KEY = "sb_publishable_F8h3Zay5r9pVATEnvAIa-Q_bnaXgj1U";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const C = {
  gold: "#0F172A", goldLight: "#1E3A8A", goldDark: "#020617",
  orange: "#EA580C", amber: "#D97706",
  green: "#15803D", red: "#DC2626", blue: "#2563EB", cyan: "#0891B2",
  other: "#CBD5E1", text: "#1E293B", dim: "#64748B", faint: "#94A3B8",
  grid: "rgba(100, 116, 139, 0.14)", panel: "#FFFFFF",
};
const PALETTE = [C.gold, C.orange, C.green, C.blue, C.amber, C.cyan, C.red, C.goldLight];

Chart.register(ChartDataLabels);
Chart.defaults.font.family = "'IBM Plex Sans', system-ui, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.color = C.dim;
Chart.defaults.animation.duration = 450;
Chart.defaults.plugins.datalabels.display = false;
Chart.defaults.plugins.legend.display = false;

const state = { data: null };
const charts = {};
let listenersReady = false;

const fmt = (v, d = 0) => Number(v).toLocaleString("es-PE", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const fmtM = (v) => {
  const n = Number(v);
  if (!isFinite(n)) return "0";
  if (Math.abs(n) >= 1e6) return "S/ " + (n / 1e6).toFixed(2) + " M";
  if (Math.abs(n) >= 1e3) return "S/ " + (n / 1e3).toFixed(1) + " K";
  return "S/ " + fmt(n, 0);
};
const truncar = (s, n = 30) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s || "");
const $ = (id) => document.getElementById(id);

async function cargarHoja(nombre) {
  const { data, error } = await supabaseClient.from("dashboard_data").select("row_index, data").eq("sheet_name", nombre).order("row_index", { ascending: true }).limit(1);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return data[0].data;
}

const centerText = {
  id: "centerText",
  afterDraw(chart, _args, opts) {
    if (!opts || !opts.title) return;
    const { ctx, chartArea: a } = chart;
    const x = (a.left + a.right) / 2, y = (a.top + a.bottom) / 2;
    ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = C.text; ctx.font = "700 18px Sora, sans-serif";
    ctx.fillText(opts.title, x, y - 8);
    ctx.fillStyle = C.dim; ctx.font = "500 11px 'IBM Plex Sans', sans-serif";
    ctx.fillText(opts.sub || "", x, y + 14); ctx.restore();
  },
};

function mount(id, config) {
  const canvas = $(id); if (!canvas) return;
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  const vacio = !config.data.labels || config.data.labels.length === 0;
  canvas.parentElement.classList.toggle("is-empty", vacio);
  if (vacio) return;
  charts[id] = new Chart(canvas, config);
}
function gradV(c1, c2) { return (ctx) => { const a = ctx.chart.chartArea; if (!a) return c1; const g = ctx.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom); g.addColorStop(0, c1); g.addColorStop(1, c2); return g; }; }
const scaleX = () => ({ grid: { display: false }, border: { color: "#E2E8F0" }, ticks: { color: C.dim, maxRotation: 0, autoSkipPadding: 14 } });
const scaleY = (max) => ({ beginAtZero: true, suggestedMax: max, grid: { color: C.grid }, border: { display: false }, ticks: { color: C.faint, callback: (v) => fmtM(v), maxTicksLimit: 6 } });

function renderLine(id, labels, datasets) {
  const maxAll = Math.max(...datasets.flatMap(d => d.data), 0);
  mount(id, {
    type: "line",
    data: { labels, datasets: datasets.map(d => ({
      label: d.label, data: d.data, borderColor: d.color, borderWidth: 2.5, tension: 0.35, fill: false,
      pointBackgroundColor: d.color, pointBorderColor: "#FFFFFF", pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 6,
    })) },
    options: { responsive: true, maintainAspectRatio: false, 
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 22, right: 10 } },
      plugins: {
        legend: { display: true, position: "bottom", labels: { color: C.dim, usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 14 } },
        tooltip: {
          backgroundColor: "#FFFFFF", titleColor: C.text, bodyColor: C.text,
          borderColor: "#E2E8F0", borderWidth: 1, padding: 12, 
          displayColors: true, boxWidth: 10, boxHeight: 10,
          callbacks: { title: (c) => c[0].label, label: (c) => ` ${c.dataset.label}: ${fmtM(c.parsed.y)}` } 
        },
      },
      scales: { x: scaleX(), y: scaleY(maxAll * 1.18) } },
  });
}

function renderGrouped(id, labels, datasets) {
  const canvas = $(id); 
  if (canvas) {
    canvas.style.width = '100%';
    canvas.style.height = '400px';
  }

  mount(id, {
    type: "bar",
    data: { labels, datasets: datasets.map(d => ({
      label: d.label, data: d.data, backgroundColor: d.color,
      borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: false, maxBarThickness: 35,
      datalabels: { display: false }
    })) },
    options: { responsive: true, maintainAspectRatio: false, 
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 18, bottom: 10 } },
      plugins: {
        legend: { display: true, position: "bottom", labels: { color: C.dim, usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 14 } },
        tooltip: {
          backgroundColor: "#FFFFFF", titleColor: C.text, bodyColor: C.text,
          borderColor: "#E2E8F0", borderWidth: 1, padding: 12, 
          displayColors: true, boxWidth: 10, boxHeight: 10,
          callbacks: { title: (c) => c[0].label, label: (c) => ` ${c.dataset.label}: ${fmtM(c.parsed.y)}` } 
        },
      },
      scales: { 
        x: { 
          ...scaleX(), 
          ticks: { 
            color: C.dim, maxRotation: 0, autoSkip: false,
            callback: function(val) {
              const label = this.getLabelForValue(val);
              const words = label.split(' ');
              const lineas = []; let linea = '';
              words.forEach(w => {
                if ((linea + w).length > 15) { lineas.push(linea.trim()); linea = w + ' '; } 
                else { linea += w + ' '; }
              });
              if (linea) lineas.push(linea.trim());
              return lineas;
            }
          } 
        }, 
        y: { 
          beginAtZero: true,
          suggestedMax: Math.max(...datasets.flatMap(d => d.data)) * 1.15,
          grid: { color: C.grid }, 
          border: { display: false }, 
          ticks: { color: C.faint, callback: (v) => fmtM(v), maxTicksLimit: 6 } 
        }  
      } 
    },
  });
}

function renderDoughnut(id, labels, data, centerTitle, centerSub) {
  const total = data.reduce((a, b) => a + Number(b), 0);
  const colores = labels.map((l, i) => PALETTE[i % PALETTE.length]);
  mount(id, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colores, borderColor: "#FFFFFF", borderWidth: 3, hoverOffset: 5 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: "68%",
      plugins: {
        tooltip: {
          backgroundColor: "#FFFFFF", titleColor: C.text, bodyColor: C.text,
          borderColor: "#E2E8F0", borderWidth: 1, padding: 12, 
          displayColors: true, boxWidth: 10, boxHeight: 10,
          callbacks: { 
            title: (c) => c[0].label, 
            label: (c) => ` ${fmtM(c.parsed)} (${total ? Math.round((c.parsed / total) * 100) : 0}%)` 
          } 
        },
        datalabels: { display: (c) => total > 0 && c.dataset.data[c.dataIndex] / total >= 0.06, color: "#1E293B", font: { family: "'IBM Plex Sans', sans-serif", weight: "700", size: 11 }, formatter: (v) => Math.round((v / total) * 100) + "%" },
        centerText: { title: centerTitle, sub: centerSub },
      } },
    plugins: [centerText],
  });
  const lg = $(id + "Legend");
  if (lg) lg.innerHTML = labels.map((l, i) => `<div class="legend-item"><i style="background:${colores[i]}"></i><span title="${l}">${truncar(l, 22)}</span><b>${total ? Math.round((data[i] / total) * 100) : 0}%</b></div>`).join("");
}

function heroCard({ title, value, unit, badge, note }) {
  return `<article class="card hero span-3"><span class="eyebrow">Indicador principal</span><h3>${title}</h3><div class="hero-val">${value}<small>${unit}</small></div><p class="hero-note">${note}</p><span class="pill pill-orange">${badge}</span></article>`;
}
function kpiCard({ icon, tone, title, value, unit, pct, barLabel, foot }) {
  return `<article class="card kpi tone-${tone} span-3"><div class="kpi-head"><span class="kpi-ico"><i class="fas ${icon}"></i></span><h3>${title}</h3></div><div class="kpi-val">${value}<small>${unit}</small></div><div class="bar"><i style="width:${Math.min(100, Math.max(0, pct))}%"></i></div><div class="kpi-foot"><span>${barLabel}</span><b>${fmt(pct, 1)}%</b></div><p class="kpi-note">${foot}</p></article>`;
}
function plotCard(id, titulo, sub, span, size = "") {
  return `<article class="card span-${span}"><div class="card-head"><h3>${titulo}</h3><p>${sub}</p></div><div class="plot ${size}"><canvas id="${id}"></canvas><div class="plot-empty"><i class="fas fa-chart-simple"></i><span>Sin datos</span></div></div></article>`;
}
function donutCard(id, titulo, sub, span) {
  return `<article class="card span-${span}"><div class="card-head"><h3>${titulo}</h3><p>${sub}</p></div><div class="plot donut"><canvas id="${id}"></canvas><div class="plot-empty"><i class="fas fa-chart-pie"></i><span>Sin datos</span></div></div><div class="legend" id="${id}Legend"></div></article>`;
}
function slotCard(id, titulo, sub, span) {
  return `<article class="card span-${span}"><div class="card-head"><h3>${titulo}</h3><p>${sub}</p></div><div id="${id}" class="mini-table"></div></article>`;
}
function tabla(encabezados, filas) {
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${encabezados.map((h) => `<th class="${h.num ? "num" : ""}">${h.t}</th>`).join("")}</tr></thead><tbody>${filas.map((f) => `<tr>${f.map((c, i) => `<td class="${encabezados[i].num ? "num" : ""} ${i === 0 ? "name" : ""}">${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function vacioMensaje(span = 12) { return `<article class="card span-${span}"><div class="plot-empty" style="display:flex;position:static;min-height:200px"><i class="fas fa-database"></i><span>No se encontraron datos.</span></div></article>`; }

function construirLayoutInterno() {
  $("gridEvolucion").innerHTML = [
    plotCard("eLineas", "Evolución Mensual", "Devengado (Ene - Dic)", 8, "tall"),
    donutCard("eGasto", "Devengado por Tipo de Gasto", "Distribución", 4),
    slotCard("eTabla", "Resumen Mensual", "Mes · Devengado", 12)
  ].join("");

  const divFiltros = $("filtersSeguimiento");
  if (divFiltros) {
    divFiltros.innerHTML = `
      <div class="filter-chip"><i class="fas fa-building"></i>
        <select id="fOficina" class="filter-select"><option value="">Oficina</option></select></div>
      <div class="filter-chip"><i class="fas fa-crosshairs"></i>
        <select id="fMeta" class="filter-select"><option value="">Meta</option></select></div>
      <div class="filter-chip"><i class="fas fa-tags"></i>
        <select id="fEspGasto" class="filter-select"><option value="">ESP Gasto</option></select></div>
      <button id="clearFiltros" class="btn-clear-chips"><i class="fas fa-eraser"></i> Limpiar</button>`;
  }

  $("gridSeguimiento").innerHTML = [
    plotCard("sBarras", "Avance por Oficina", "PIM vs Certificado vs Devengado", 12, "tall"),
    slotCard("sTabla", "Seguimiento Detallado", "Oficina · Meta · PIM · Cert · %Cert · Comp · Dev · %Dev · Saldo · Prog Nov-Dic", 12)
  ].join("");

    const divFiltrosTablas = $("filtersTablas");
  if (divFiltrosTablas) {
    divFiltrosTablas.innerHTML = `
      <div class="filter-chip"><i class="fas fa-building"></i>
        <select id="fOficinaTablas" class="filter-select"><option value="">Oficina</option></select></div>
      <div class="filter-chip"><i class="fas fa-crosshairs"></i>
        <select id="fMetaTablas" class="filter-select"><option value="">Meta</option></select></div>
      <div class="filter-chip"><i class="fas fa-tags"></i>
        <select id="fEspGastoTablas" class="filter-select"><option value="">ESP Gasto</option></select></div>
      <button id="clearFiltrosTablas" class="btn-clear-chips"><i class="fas fa-eraser"></i> Limpiar</button>`;
  }
}

function llenarSegmentadores() {
  if (!state.data) return;
  const ofis = new Set(), metas = new Set(), esps = new Set();
  state.data.filas.forEach(f => { if(f.ofi) ofis.add(f.ofi); if(f.meta) metas.add(f.meta); if(f.esp) esps.add(f.esp); });
  
  const llenar = (id, set, def) => {
    const sel = $(id); if (!sel) return;
    sel.innerHTML = `<option value="">${def}</option>`;
    [...set].sort().forEach(v => { const o = document.createElement("option"); o.value = v; o.textContent = v; sel.appendChild(o); });
  };
  llenar("fOficina", ofis, "Oficina");
  llenar("fMeta", metas, "Meta");
  llenar("fEspGasto", esps, "ESP Gasto");
}

function renderEvolucion() {
  if (!state.data) { $("kpiEvolucion").innerHTML = ""; $("gridEvolucion").innerHTML = vacioMensaje(12); return; }
  const d = state.data;

  $("kpiEvolucion").innerHTML = [
    heroCard({ title: "PIM Total", value: "S/ " + fmt(d.kpis.tPim), unit: "", note: `Dev: ${fmtM(d.kpis.tDev)}`, badge: `Saldo: ${fmtM(d.kpis.saldoReal)}` }),
    kpiCard({ icon: "fa-file-signature", tone: "gold", title: "Total Certificado", value: "S/ " + fmt(d.kpis.tCert), unit: "", pct: d.kpis.tPim ? (d.kpis.tCert/d.kpis.tPim)*100 : 0, barLabel: "% Certificación", foot: `Monto` }),
    kpiCard({ icon: "fa-handshake", tone: "amber", title: "Total Compromiso", value: "S/ " + fmt(d.kpis.tComp), unit: "", pct: d.kpis.tPim ? (d.kpis.tComp/d.kpis.tPim)*100 : 0, barLabel: "% Compromiso", foot: `Monto` }),
    kpiCard({ icon: "fa-coins", tone: "green", title: "Total Devengado", value: "S/ " + fmt(d.kpis.tDev), unit: "", pct: d.kpis.tPim ? (d.kpis.tDev/d.kpis.tPim)*100 : 0, barLabel: "% Ejecución", foot: `Monto` }),
  ].join("");

  const labelsMeses = d.porMes.map(m => m.mes);
  renderLine("eLineas", labelsMeses, [
    { label: "Devengado", color: C.gold, data: d.porMes.map(m => m.valor) },
    { label: "Techo PIM", color: C.red, data: d.porMes.map(() => d.kpis.tPim) }
  ]);

  const espTop = d.porEspGasto.slice(0, 6);
  renderDoughnut("eGasto", espTop.map(e => e.nombre), espTop.map(e => e.valor), fmtM(d.kpis.tDev), "Total Dev.");

  // Tabla Resumen Mensual con Acumulado y Porcentaje (sin abreviaturas)
  let acumulado = 0;
  const filasTabla = d.porMes.map(m => {
    acumulado += m.valor;
    const pct = d.kpis.tPim ? (m.valor / d.kpis.tPim) * 100 : 0;
    return [
      m.mes,
      "S/ " + fmt(m.valor, 2),
      pct > 0 ? fmt(pct, 1) + "%" : "-",
      "S/ " + fmt(acumulado, 2)
    ];
  });

  $("eTabla").innerHTML = tabla(
    [
      { t: "Mes" }, 
      { t: "Devengado", num: 1 }, 
      { t: "% Ejecución Mes", num: 1 }, 
      { t: "Devengado Acumulado", num: 1 }
    ],
    filasTabla
  );
}

function renderSeguimiento() {
  if (!state.data) { $("kpiSeguimiento").innerHTML = ""; $("gridSeguimiento").innerHTML = vacioMensaje(12); return; }
  const fOficina = $("fOficina") ? $("fOficina").value : "";
  const fMeta = $("fMeta") ? $("fMeta").value : "";
  const fEspGasto = $("fEspGasto") ? $("fEspGasto").value : "";

  const filas = state.data.filas.filter(f => {
    if (fOficina && f.ofi !== fOficina) return false;
    if (fMeta && f.meta !== fMeta) return false;
    if (fEspGasto && f.esp !== fEspGasto) return false;
    return true;
  });

  let tPim = 0, tCert = 0, tComp = 0, tDev = 0, tSaldoReal = 0, tDifAnual = 0;
  const porOficina = {};
  
  filas.forEach(f => {
    tPim += f.pim; tCert += f.cert; tComp += f.comp; tDev += f.dev; 
    tSaldoReal += (f.pim - f.dev); 
    tDifAnual += (f.pim - f.dev - f.progNov - f.progDic);
    
    if (!porOficina[f.ofi]) porOficina[f.ofi] = { pim: 0, cert: 0, comp: 0, dev: 0, saldo: 0 };
    porOficina[f.ofi].pim += f.pim;
    porOficina[f.ofi].cert += f.cert;
    porOficina[f.ofi].comp += f.comp;
    porOficina[f.ofi].dev += f.dev;
    porOficina[f.ofi].saldo += (f.pim - f.dev);
  });

  $("kpiSeguimiento").innerHTML = [
    heroCard({ title: "PIM (Filtrado)", value: "S/ " + fmt(tPim), unit: "", note: `Saldo Real: ${fmtM(tSaldoReal)}`, badge: `Dif. Anual: ${fmtM(tDifAnual)}` }),
    kpiCard({ icon: "fa-check", tone: "gold", title: "Certificado", value: "S/ " + fmt(tCert), unit: "", pct: tPim ? (tCert/tPim)*100 : 0, barLabel: "% Certificación", foot: `Monto` }),
    kpiCard({ icon: "fa-coins", tone: "amber", title: "Devengado", value: "S/ " + fmt(tDev), unit: "", pct: tPim ? (tDev/tPim)*100 : 0, barLabel: "% Ejecución", foot: `Monto` }),
    kpiCard({ icon: "fa-building", tone: "green", title: "Saldo Real (PIM-Dev)", value: "S/ " + fmt(tSaldoReal), unit: "", pct: tPim ? (tSaldoReal/tPim)*100 : 0, barLabel: "Disponible", foot: `Monto` }),
  ].join("");

  const topOfis = Object.entries(porOficina)
    .map(([k,v])=>({nombre:k, ...v}))
    .filter(o => o.pim < 5000000) // Tope de 5 Millones para sacar la de 10M y las gigantes
    .sort((a,b)=>b.pim-a.pim)
    .slice(0, 8);

  renderGrouped("sBarras", topOfis.map(o => o.nombre), [
    { label: "PIM", color: C.goldDark, data: topOfis.map(o => o.pim) },
    { label: "Certificado", color: C.gold, data: topOfis.map(o => o.cert) },
    { label: "Devengado", color: C.green, data: topOfis.map(o => o.dev) },
  ]);

  const tablaFilas = filas.sort((a,b) => b.pim - a.pim).slice(0, 200);
  $("sTabla").innerHTML = tabla(
    [{ t: "Oficina" }, { t: "Meta" }, { t: "PIM", num: 1 }, { t: "Certificado", num: 1 }, { t: "% Cert", num: 1 }, { t: "Compromiso", num: 1 }, { t: "Devengado", num: 1 }, { t: "% Dev", num: 1 }, { t: "Saldo Real", num: 1 }, { t: "Dif. Anual", num: 1 }],
    tablaFilas.map(f => {
      const pctCert = f.pim ? (f.cert / f.pim) * 100 : 0;
      const pctDev = f.pim ? (f.dev / f.pim) * 100 : 0;
      const difAnual = f.pim - f.dev - f.progNov - f.progDic;
      return [
        f.ofi, 
        f.meta, 
        fmtM(f.pim), 
        fmtM(f.cert), 
        fmt(pctCert, 1) + "%", 
        fmtM(f.comp), 
        fmtM(f.dev), 
        fmt(pctDev, 1) + "%", 
        fmtM(f.pim - f.dev),
        fmtM(difAnual)
      ];
    })
  );
}

function cambiarSeccion(seccion) {
  document.querySelectorAll("#dashTabs .tab").forEach(t => t.classList.toggle("active", t.dataset.seccion === seccion));
  
  ["evolucion", "seguimiento", "tablas"].forEach(s => {
    const el = document.getElementById(s);
    if (el) el.hidden = s !== seccion;
  });
  
  if (seccion === "evolucion") renderEvolucion();
  if (seccion === "seguimiento") renderSeguimiento();
  if (seccion === "tablas") renderTablas();
  
  requestAnimationFrame(() => Object.values(charts).forEach(c => c.resize()));
}

function engancharEventos() {
  if (listenersReady) return;
  listenersReady = true;

  document.querySelectorAll("#dashTabs .tab").forEach(tab => {
    tab.addEventListener("click", (e) => { e.preventDefault(); cambiarSeccion(tab.dataset.seccion); });
  });

  ["fOficina", "fMeta", "fEspGasto"].forEach(id => {
    const el = $(id); if (el) el.addEventListener("change", () => renderSeguimiento());
  });
  
  const btnClear = $("clearFiltros");
  if (btnClear) btnClear.addEventListener("click", () => {
    ["fOficina", "fMeta", "fEspGasto"].forEach(id => { const el = $(id); if (el) el.value = ""; });
    renderSeguimiento();
  });

  document.querySelectorAll(".js-refresh").forEach((b) =>
    b.addEventListener("click", async () => {
      document.querySelectorAll(".js-refresh").forEach((x) => { x.disabled = true; x.classList.add("is-loading"); });
      try { await cargarTodo(); } catch (err) { console.error(err); }
      document.querySelectorAll(".js-refresh").forEach((x) => { x.disabled = false; x.classList.remove("is-loading"); });
    })
  );
}

async function cargarTodo() {
  const data = await cargarHoja("SANIPES_DATA").catch(() => null);
  state.data = data;

  const count = data ? 1 : 0;
  $("stRegistros").textContent = `${count} / 1`;
  $("stSync").textContent = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  $("chipRegistros").textContent = fmt(state.data?.filas?.length || 0);
  $("chipSync").textContent = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

  llenarSegmentadores();
  cambiarSeccion("evolucion");
}

function renderTablas() {
  if (!state.data) { $("tablaEje").innerHTML = ""; $("tablaPim").innerHTML = ""; return; }
  
  const fOficina = $("fOficinaTablas") ? $("fOficinaTablas").value : "";
  const fMeta = $("fMetaTablas") ? $("fMetaTablas").value : "";
  const fEspGasto = $("fEspGastoTablas") ? $("fEspGastoTablas").value : "";

  const filas = state.data.filas.filter(f => {
    if (fOficina && f.ofi !== fOficina) return false;
    if (fMeta && f.meta !== fMeta) return false;
    if (fEspGasto && f.esp !== fEspGasto) return false;
    return true;
  });

  // ===== TABLA 1: TD-PIM-EJE =====
  const porOfiEje = {};
  filas.forEach(f => {
    if (!porOfiEje[f.ofi]) {
      porOfiEje[f.ofi] = { pim: 0, cert: 0, compAnual: 0, comp: 0, dev: 0, devMes: new Array(12).fill(0) };
    }
    porOfiEje[f.ofi].pim += f.pim;
    porOfiEje[f.ofi].cert += f.cert;
    porOfiEje[f.ofi].compAnual += f.compAnual;
    porOfiEje[f.ofi].comp += f.comp;
    porOfiEje[f.ofi].dev += f.dev;
    if (f.devMes) f.devMes.forEach((v, i) => { porOfiEje[f.ofi].devMes[i] += v; });
  });
  
  const arrEje = Object.entries(porOfiEje).map(([k,v])=>({nombre:k, ...v})).sort((a,b)=>b.pim-a.pim);
  const headsEje = [
    { t: "Oficina" }, { t: "PIM", num: 1 }, { t: "Certificado", num: 1 }, { t: "Comp. Anual", num: 1 },
    { t: "Compromiso", num: 1 }, { t: "Devengado", num: 1 },
    ...["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Set","Oct","Nov","Dic"].map(m => ({ t: m, num: 1 })),
    { t: "% Cert", num: 1 }, { t: "% Comp", num: 1 }, { t: "% Dev", num: 1 }
  ];

  $("tablaEje").innerHTML = tabla(
    headsEje,
    arrEje.map(f => [
      f.nombre, fmtM(f.pim), fmtM(f.cert), fmtM(f.compAnual), fmtM(f.comp), fmtM(f.dev),
      ...f.devMes.map(m => fmtM(m)),
      fmt(f.pim ? (f.cert/f.pim)*100 : 0, 1) + "%",
      fmt(f.pim ? (f.comp/f.pim)*100 : 0, 1) + "%",
      fmt(f.pim ? (f.dev/f.pim)*100 : 0, 1) + "%"
    ])
  );

  // ===== TABLA 2: TD-PIM =====
  const porOfiPim = {};
  filas.forEach(f => {
    if (!porOfiPim[f.ofi]) {
      porOfiPim[f.ofi] = { pim: 0, cert: 0, compAnual: 0, comp: 0, dev: 0, progNov: 0, progDic: 0, devOct: 0 };
    }
    porOfiPim[f.ofi].pim += f.pim;
    porOfiPim[f.ofi].cert += f.cert;
    porOfiPim[f.ofi].compAnual += f.compAnual;
    porOfiPim[f.ofi].comp += f.comp;
    porOfiPim[f.ofi].dev += f.dev;
    porOfiPim[f.ofi].progNov += f.progNov;
    porOfiPim[f.ofi].progDic += f.progDic;
    if (f.devMes && f.devMes[9]) porOfiPim[f.ofi].devOct += f.devMes[9];
  });

  const arrPim = Object.entries(porOfiPim).map(([k,v])=>({nombre:k, ...v})).sort((a,b)=>b.pim-a.pim);
  
  const headsPim = [
    { t: "Dependencia" }, 
    { t: "PIM", num: 1 }, 
    { t: "Certificado", num: 1 }, 
    { t: "% Cert", num: 1 }, 
    { t: "Comp. Anual", num: 1 },
    { t: "% CA", num: 1 },
    { t: "Compromiso", num: 1 },
    { t: "% Comp", num: 1 },
    { t: "Devengado", num: 1 }, 
    { t: "% Dev", num: 1 },
    { t: "Saldo PIM - Cert", num: 1 },
    { t: "Dev Proy Oct", num: 1 },
    { t: "Dev Oct", num: 1 },
    { t: "% Eje Oct", num: 1 },
    { t: "Diferencia", num: 1 },
    { t: "Dev Proy Nov", num: 1 }, 
    { t: "Dev Proy Dic", num: 1 }, 
    { t: "Diferencia Anual", num: 1 }
  ];

  $("tablaPim").innerHTML = tabla(
    headsPim,
    arrPim.map(f => {
      const saldoCert = f.pim - f.cert;
      const dif = f.pim - f.dev; 
      const difAnual = f.pim - f.dev - f.progNov - f.progDic;
      const pctEjeOct = f.pim ? (f.devOct / f.pim) * 100 : 0;
      
      return [
        f.nombre, 
        fmtM(f.pim), 
        fmtM(f.cert), 
        fmt(f.pim ? (f.cert/f.pim)*100 : 0, 1) + "%",
        fmtM(f.compAnual), 
        fmt(f.pim ? (f.compAnual/f.pim)*100 : 0, 1) + "%",
        fmtM(f.comp), 
        fmt(f.pim ? (f.comp/f.pim)*100 : 0, 1) + "%",
        fmtM(f.dev), 
        fmt(f.pim ? (f.dev/f.pim)*100 : 0, 1) + "%",
        fmtM(saldoCert),
        fmtM(0), // Dev Proy Oct (falta)
        fmtM(f.devOct), 
        fmt(f.pim ? pctEjeOct : 0, 1) + "%",
        fmtM(dif),
        fmtM(f.progNov), 
        fmtM(f.progDic), 
        fmtM(difAnual)
      ];
    })
  );
}

(async function init() {
  construirLayoutInterno();
  try {
    await cargarTodo();
    $("loading").hidden = true;
    $("topbar").hidden = false;
    $("shell").hidden = false;
    engancharEventos();
    cambiarSeccion("evolucion");
  } catch (err) {
    console.error(err);
    $("loading").innerHTML = `<div class="error-box"><i class="fas fa-triangle-exclamation"></i><h3>No se pudieron cargar los datos</h3><p>${err.message || err}</p></div>`;
  }
})();