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
        tooltip: { backgroundColor: "#FFFFFF", titleColor: C.text, bodyColor: C.text, borderColor: "#E2E8F0", borderWidth: 1, padding: 12, displayColors: true, boxWidth: 10, boxHeight: 10, callbacks: { title: (c) => c[0].label, label: (c) => ` ${c.dataset.label}: ${fmtM(c.parsed.y)}` } },
      },
      scales: { x: scaleX(), y: scaleY(maxAll * 1.18) } },
  });
}

function renderGrouped(id, labels, datasets) {
  const canvas = $(id); 
  if (canvas) { canvas.style.width = '100%'; canvas.style.height = '400px'; }
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
        tooltip: { backgroundColor: "#FFFFFF", titleColor: C.text, bodyColor: C.text, borderColor: "#E2E8F0", borderWidth: 1, padding: 12, displayColors: true, boxWidth: 10, boxHeight: 10, callbacks: { title: (c) => c[0].label, label: (c) => ` ${c.dataset.label}: ${fmtM(c.parsed.y)}` } },
      },
      scales: { 
        x: { ...scaleX(), ticks: { color: C.dim, maxRotation: 0, autoSkip: false, callback: function(val) { const label = this.getLabelForValue(val); const words = label.split(' '); const lineas = []; let linea = ''; words.forEach(w => { if ((linea + w).length > 15) { lineas.push(linea.trim()); linea = w + ' '; } else { linea += w + ' '; } }); if (linea) lineas.push(linea.trim()); return lineas; } } }, 
        y: { beginAtZero: true, suggestedMax: Math.max(...datasets.flatMap(d => d.data)) * 1.15, grid: { color: C.grid }, border: { display: false }, ticks: { color: C.faint, callback: (v) => fmtM(v), maxTicksLimit: 6 } }  
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
        tooltip: { backgroundColor: "#FFFFFF", titleColor: C.text, bodyColor: C.text, borderColor: "#E2E8F0", borderWidth: 1, padding: 12, displayColors: true, boxWidth: 10, boxHeight: 10, callbacks: { title: (c) => c[0].label, label: (c) => ` ${fmtM(c.parsed)} (${total ? Math.round((c.parsed / total) * 100) : 0}%)` } },
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
  // EVOLUCIÓN
  const divFiltrosEvo = $("filtersEvolucion");
  if (divFiltrosEvo) {
    divFiltrosEvo.innerHTML = `
      <div class="filter-chip"><i class="fas fa-sitemap"></i>
        <select id="eDep" class="filter-select"><option value="">Dependencia</option></select></div>
      <div class="filter-chip"><i class="fas fa-building"></i>
        <select id="eOfi" class="filter-select"><option value="">Oficina</option></select></div>
      <div class="filter-chip"><i class="fas fa-layer-group"></i>
        <select id="eGen" class="filter-select"><option value="">Gen</option></select></div>
      <div class="filter-chip"><i class="fas fa-tags"></i>
        <select id="eEsp" class="filter-select"><option value="">ESP Gasto</option></select></div>
      <div class="filter-chip"><i class="fas fa-crosshairs"></i>
        <select id="eMeta" class="filter-select"><option value="">Meta</option></select></div>
      <button id="eClear" class="btn-clear-chips"><i class="fas fa-eraser"></i> Limpiar</button>`;
  }

  $("gridEvolucion").innerHTML = [
    plotCard("eLineas", "Evolución Mensual", "Devengado (Ene - Dic)", 8, "tall"),
    donutCard("eGasto", "Devengado por Tipo de Gasto", "Distribución", 4),
    slotCard("eTabla", "Resumen Mensual", "Mes · Devengado", 12),
    
            `<article class="card span-12">
      <div class="card-head" style="display:flex; flex-direction: column; align-items: flex-start; gap: 12px; margin-bottom:14px;">
        <div>
          <h3>TD-PIM-EJE (Evolución por Dependencia)</h3>
          <p>Haz clic en los signos (+) para desplegar.</p>
        </div>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; width: 100%;">
          <select id="eFilterDepEje" style="min-width:180px; border:1px solid #E2E8F0; padding:6px 10px; border-radius:6px; font-size:12px; color:#1E293B; outline:none;"><option value="">Todas las Deps</option></select>
          <input type="text" id="eSearchDepEje" placeholder="Buscar Dep..." style="width:130px; border:1px solid #E2E8F0; padding:6px 10px; border-radius:6px; font-size:12px; color:#1E293B; outline:none;">
          
          <select id="eFilterOfiEje" style="min-width:180px; border:1px solid #E2E8F0; padding:6px 10px; border-radius:6px; font-size:12px; color:#1E293B; outline:none;"><option value="">Todas las Ofis</option></select>
          <input type="text" id="eSearchOfiEje" placeholder="Buscar Ofi..." style="width:130px; border:1px solid #E2E8F0; padding:6px 10px; border-radius:6px; font-size:12px; color:#1E293B; outline:none;">
        </div>
      </div>
      <div id="eTablaEje" class="mini-table"></div>
    </article>`
  ].join("");

  // SEGUIMIENTO
  const divFiltros = $("filtersSeguimiento");
  if (divFiltros) {
    divFiltros.innerHTML = `
      <div class="filter-chip"><i class="fas fa-sitemap"></i>
        <select id="sDep" class="filter-select"><option value="">Dependencia</option></select></div>
      <div class="filter-chip"><i class="fas fa-building"></i>
        <select id="sOfi" class="filter-select"><option value="">Oficina</option></select></div>
      <div class="filter-chip"><i class="fas fa-layer-group"></i>
        <select id="sGen" class="filter-select"><option value="">Gen</option></select></div>
      <div class="filter-chip"><i class="fas fa-tags"></i>
        <select id="sEsp" class="filter-select"><option value="">ESP Gasto</option></select></div>
      <div class="filter-chip"><i class="fas fa-crosshairs"></i>
        <select id="sMeta" class="filter-select"><option value="">Meta</option></select></div>
      <button id="sClear" class="btn-clear-chips"><i class="fas fa-eraser"></i> Limpiar</button>`;
  }

  $("gridSeguimiento").innerHTML = [
    plotCard("sBarras", "Avance por Dependencia", "PIM vs Devengado", 8, "tall"),
    donutCard("sDona", "Distribución del Saldo", "PIM - Certificado", 4),
    
        `<article class="card span-12">
      <div class="card-head" style="display:flex; flex-direction: column; align-items: flex-start; gap: 12px; margin-bottom:14px;">
        <div>
          <h3>Seguimiento Detallado (TD-PIM)</h3>
          <p>Haz clic en los signos (+) para desplegar.</p>
        </div>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; width: 100%;">
          <select id="sFilterDepSeg" style="min-width:180px; border:1px solid #E2E8F0; padding:6px 10px; border-radius:6px; font-size:12px; color:#1E293B; outline:none;"><option value="">Todas las Deps</option></select>
          <input type="text" id="sSearchDepSeg" placeholder="Buscar Dep..." style="width:130px; border:1px solid #E2E8F0; padding:6px 10px; border-radius:6px; font-size:12px; color:#1E293B; outline:none;">
          
          <select id="sFilterOfiSeg" style="min-width:180px; border:1px solid #E2E8F0; padding:6px 10px; border-radius:6px; font-size:12px; color:#1E293B; outline:none;"><option value="">Todas las Ofis</option></select>
          <input type="text" id="sSearchOfiSeg" placeholder="Buscar Ofi..." style="width:130px; border:1px solid #E2E8F0; padding:6px 10px; border-radius:6px; font-size:12px; color:#1E293B; outline:none;">
        </div>
      </div>
      <div id="sTabla" class="mini-table"></div>
    </article>`
  ].join("");
}

function llenarSegmentadores() {
  if (!state.data) return;
  
  const llenar = (id, set, def) => {
    const sel = $(id); if (!sel) return;
    sel.innerHTML = `<option value="">${def}</option>`;
    [...set].sort().forEach(v => { const o = document.createElement("option"); o.value = v; o.textContent = v; sel.appendChild(o); });
  };
  
  const sDeps = new Set(), sOfis = new Set(), sGens = new Set(), sEsps = new Set(), sMetas = new Set();
  const evoDeps = new Set(), evoOfis = new Set(), evoGens = new Set(), evoEsps = new Set(), evoMetas = new Set();

  state.data.filas.forEach(f => { 
    if(f.dep) { sDeps.add(f.dep); evoDeps.add(f.dep); }
    if(f.ofi) { sOfis.add(f.ofi); evoOfis.add(f.ofi); }
    if(f.gen) { sGens.add(f.gen); evoGens.add(f.gen); }
    if(f.esp) { sEsps.add(f.esp); evoEsps.add(f.esp); }
    if(f.meta) { sMetas.add(f.meta); evoMetas.add(f.meta); }
  });

  llenar("sDep", sDeps, "Dependencia");
  llenar("sOfi", sOfis, "Oficina");
  llenar("sGen", sGens, "Gen");
  llenar("sEsp", sEsps, "ESP Gasto");
  llenar("sMeta", sMetas, "Meta");

  llenar("eDep", evoDeps, "Dependencia");
  llenar("eOfi", evoOfis, "Oficina");
  llenar("eGen", evoGens, "Gen");
  llenar("eEsp", evoEsps, "ESP Gasto");
  llenar("eMeta", evoMetas, "Meta");

  llenar("eFilterDepEje", evoDeps, "Todas las Deps");
  llenar("eFilterOfiEje", evoOfis, "Todas las Ofis");
  llenar("sFilterDepSeg", sDeps, "Todas las Deps");
  llenar("sFilterOfiSeg", sOfis, "Todas las Ofis");
}

function renderEvolucion() {
  if (!state.data) { $("kpiEvolucion").innerHTML = ""; $("gridEvolucion").innerHTML = vacioMensaje(12); return; }
  
  const fDep = $("eDep") ? $("eDep").value : "";
  const fOfi = $("eOfi") ? $("eOfi").value : "";
  const fGen = $("eGen") ? $("eGen").value : "";
  const fEsp = $("eEsp") ? $("eEsp").value : "";
  const fMeta = $("eMeta") ? $("eMeta").value : "";

  const filasFiltradas = state.data.filas.filter(f => {
    if (fDep && f.dep !== fDep) return false;
    if (fOfi && f.ofi !== fOfi) return false;
    if (fGen && f.gen !== fGen) return false;
    if (fEsp && f.esp !== fEsp) return false;
    if (fMeta && f.meta !== fMeta) return false;
    return true;
  });

  let tPim = 0, tCert = 0, tComp = 0, tDev = 0;
  let porMes = Array.from({length: 12}, (_, i) => ({ mes: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"][i], valor: 0 }));
  let porEspGasto = {};

  filasFiltradas.forEach(f => {
    tPim += f.pim; tCert += f.cert; tComp += f.comp; tDev += f.dev;
    if (f.esp && f.dev > 0) porEspGasto[f.esp] = (porEspGasto[f.esp] || 0) + f.dev;
    if (f.devMes) f.devMes.forEach((v, i) => { porMes[i].valor += v; });
  });

  $("kpiEvolucion").innerHTML = [
    heroCard({ title: "PIM Total", value: "S/ " + fmt(tPim), unit: "", note: `Dev: ${fmtM(tDev)}`, badge: `Saldo: ${fmtM(tPim - tDev)}` }),
    kpiCard({ icon: "fa-file-signature", tone: "gold", title: "Total Certificado", value: "S/ " + fmt(tCert), unit: "", pct: tPim ? (tCert/tPim)*100 : 0, barLabel: "% Certificación", foot: `Monto` }),
    kpiCard({ icon: "fa-handshake", tone: "amber", title: "Total Compromiso", value: "S/ " + fmt(tComp), unit: "", pct: tPim ? (tComp/tPim)*100 : 0, barLabel: "% Compromiso", foot: `Monto` }),
    kpiCard({ icon: "fa-coins", tone: "green", title: "Total Devengado", value: "S/ " + fmt(tDev), unit: "", pct: tPim ? (tDev/tPim)*100 : 0, barLabel: "% Ejecución", foot: `Monto` }),
  ].join("");

  renderLine("eLineas", porMes.map(m => m.mes), [
    { label: "Devengado", color: C.gold, data: porMes.map(m => m.valor) },
    { label: "Techo PIM", color: C.red, data: porMes.map(() => tPim) }
  ]);

  const espTop = Object.entries(porEspGasto).sort((a,b) => b[1] - a[1]).slice(0, 6);
  renderDoughnut("eGasto", espTop.map(e => e[0]), espTop.map(e => e[1]), fmtM(tDev), "Total Dev.");

  let acumulado = 0;
  const filasTabla = porMes.map(m => {
    acumulado += m.valor;
    const pct = tPim ? (m.valor / tPim) * 100 : 0;
    return [ m.mes, "S/ " + fmt(m.valor, 2), pct > 0 ? fmt(pct, 1) + "%" : "-", "S/ " + fmt(acumulado, 2) ];
  });

  $("eTabla").innerHTML = tabla(
    [ { t: "Mes" }, { t: "Devengado", num: 1 }, { t: "% Ejecución Mes", num: 1 }, { t: "Devengado Acumulado", num: 1 } ],
    filasTabla
  );

  // ---- LÓGICA TD-PIM-EJE (TABLA PLANA IGUAL QUE SEGUIMIENTO) ----
  const searchDepEje = $("eSearchDepEje") ? $("eSearchDepEje").value.toLowerCase() : "";
  const filterDepEje = $("eFilterDepEje") ? $("eFilterDepEje").value : "";
  const searchOfiEje = $("eSearchOfiEje") ? $("eSearchOfiEje").value.toLowerCase() : "";
  const filterOfiEje = $("eFilterOfiEje") ? $("eFilterOfiEje").value : "";

  const filasEje = filasFiltradas.filter(f => {
    if (filterDepEje && f.dep !== filterDepEje) return false;
    if (searchDepEje && !f.dep.toLowerCase().includes(searchDepEje)) return false;
    if (filterOfiEje && f.ofi !== filterOfiEje) return false;
    if (searchOfiEje && !f.ofi.toLowerCase().includes(searchOfiEje)) return false;
    return true;
  });

  const depMap = {};
  filasEje.forEach(f => {
    if (!depMap[f.dep]) depMap[f.dep] = { pim: 0, cert: 0, compAnual: 0, comp: 0, dev: 0, meses: new Array(12).fill(0), ofis: {} };
    const d = depMap[f.dep];
    d.pim += f.pim; d.cert += f.cert; d.compAnual += f.compAnual; d.comp += f.comp; d.dev += f.dev;
    if (f.devMes) f.devMes.forEach((v, i) => { d.meses[i] += v; });

    if (!d.ofis[f.ofi]) d.ofis[f.ofi] = { pim: 0, cert: 0, compAnual: 0, comp: 0, dev: 0, meses: new Array(12).fill(0), metas: {} };
    const o = d.ofis[f.ofi];
    o.pim += f.pim; o.cert += f.cert; o.compAnual += f.compAnual; o.comp += f.comp; o.dev += f.dev;
    if (f.devMes) f.devMes.forEach((v, i) => { o.meses[i] += v; });

    if (!o.metas[f.meta]) o.metas[f.meta] = { pim: 0, cert: 0, compAnual: 0, comp: 0, dev: 0, meses: new Array(12).fill(0), gens: {} };
    const m = o.metas[f.meta];
    m.pim += f.pim; m.cert += f.cert; m.compAnual += f.compAnual; m.comp += f.comp; m.dev += f.dev;
    if (f.devMes) f.devMes.forEach((v, i) => { m.meses[i] += v; });

    if (!m.gens[f.gen]) m.gens[f.gen] = { pim: 0, cert: 0, compAnual: 0, comp: 0, dev: 0, meses: new Array(12).fill(0) };
    const g = m.gens[f.gen];
    g.pim += f.pim; g.cert += f.cert; g.compAnual += f.compAnual; g.comp += f.comp; g.dev += f.dev;
    if (f.devMes) f.devMes.forEach((v, i) => { g.meses[i] += v; });
  });

  const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct"];
  
  const cRowEje = (label, data, nivel=0, hasChild=false, rowId="", parentId="") => {
    const p = (v) => data.pim ? fmt((v / data.pim)*100, 1) + "%" : "-";
    const paddingLeft = nivel === 0 ? "10px" : `${nivel * 20 + 10}px`;
    
    return `
      <tr class="${hasChild ? 'row-parent' : ''} ${parentId ? 'child' : ''}" ${hasChild ? `data-row-id="${rowId}"` : ''} ${parentId ? `data-parent="${parentId}"` : ''} style="${hasChild ? 'cursor:pointer; font-weight:600; background:#F8FAFC;' : 'color:#64748B;'}">
        <td style="padding-left: ${paddingLeft}; white-space: normal; word-break: break-word; max-width: 250px;">
          ${hasChild ? '<i class="fas fa-plus-square" style="color:#0F172A; width:15px; margin-right:5px;"></i>' : '<i style="width:15px; margin-right:5px; display:inline-block;"></i>'}
          ${label}
        </td>
        <td class="num">${fmt(data.pim, 2)}</td>
        <td class="num">${fmt(data.cert, 2)}</td>
        <td class="num">${fmt(data.compAnual, 2)}</td>
        <td class="num">${fmt(data.comp, 2)}</td>
        <td class="num">${fmt(data.dev, 2)}</td>
        ${data.meses.slice(0, 10).map(v => `<td class="num">${v > 0 ? fmt(v, 2) : "-"}</td>`).join("")}
        <td class="num">${p(data.cert)}</td>
        <td class="num">${p(data.comp)}</td>
        <td class="num">${p(data.dev)}</td>
      </tr>`;
  };

  let html = `<div class="tbl-wrap"><table class="tbl"><thead><tr>
    <th>Dependencia / Oficina</th><th class="num">PIM</th><th class="num">Certificado</th><th class="num">Comp. Anual</th>
    <th class="num">Compromiso</th><th class="num">Devengado</th>
    ${MESES.map(m => `<th class="num">${m}</th>`).join("")}
    <th class="num">% Cert</th><th class="num">% Comp</th><th class="num">% Dev</th>
  </tr></thead><tbody>`;

  let tPimEje = 0, tCertEje = 0, tCompAnualEje = 0, tCompEje = 0, tDevEje = 0;
  let tMeses = new Array(12).fill(0);

  Object.keys(depMap).sort().forEach((depName, iDep) => {
    const d = depMap[depName];
    tPimEje += d.pim; tCertEje += d.cert; tCompAnualEje += d.compAnual; tCompEje += d.comp; tDevEje += d.dev;
    if (d.meses) d.meses.forEach((v, i) => { tMeses[i] += v; });

    const depId = `eje-dep-${iDep}`;
    html += cRowEje(depName, d, 0, true, depId, "");
    
    Object.keys(d.ofis).sort().forEach((ofiName, iOfi) => {
      const ofiId = `eje-ofi-${iDep}-${iOfi}`;
      html += cRowEje(ofiName, d.ofis[ofiName], 1, true, ofiId, depId);

      Object.keys(d.ofis[ofiName].metas).sort().forEach((metaName, iMeta) => {
        const metaId = `eje-meta-${iDep}-${iOfi}-${iMeta}`;
        html += cRowEje(`${metaName} - ${ofiName}`, d.ofis[ofiName].metas[metaName], 2, true, metaId, ofiId);

        Object.keys(d.ofis[ofiName].metas[metaName].gens).sort().forEach((genName) => {
          html += cRowEje(genName || "SIN GEN", d.ofis[ofiName].metas[metaName].gens[genName], 3, false, "", metaId);
        });
      });
    });
  });

  const pTotalCert = tPimEje ? fmt((tCertEje / tPimEje)*100, 1) + "%" : "-";
  const pTotalComp = tPimEje ? fmt((tCompEje / tPimEje)*100, 1) + "%" : "-";
  const pTotalDev = tPimEje ? fmt((tDevEje / tPimEje)*100, 1) + "%" : "-";
  
  html += `
    <tr style="font-weight:700; background:#F1F5F9; border-top:2px solid #CBD5E1;">
      <td style="padding-left: 10px;">Total general</td>
      <td class="num">${fmt(tPimEje, 2)}</td>
      <td class="num">${fmt(tCertEje, 2)}</td>
      <td class="num">${fmt(tCompAnualEje, 2)}</td>
      <td class="num">${fmt(tCompEje, 2)}</td>
      <td class="num">${fmt(tDevEje, 2)}</td>
      ${tMeses.slice(0, 10).map(v => `<td class="num">${v > 0 ? fmt(v, 2) : "-"}</td>`).join("")}
      <td class="num">${pTotalCert}</td>
      <td class="num">${pTotalComp}</td>
      <td class="num">${pTotalDev}</td>
    </tr>
  `;
  html += `</tbody></table></div>`;
  
  if ($("eTablaEje")) {
    $("eTablaEje").innerHTML = html;

    // Ocultar todos los hijos al inicio
    document.querySelectorAll('#eTablaEje tr[data-parent]').forEach(row => {
      row.style.display = 'none';
    });

    // Lógica para el acordeón
    document.querySelectorAll('#eTablaEje .row-parent').forEach(row => {
      row.addEventListener('click', () => {
        const rowId = row.dataset.rowId;
        const children = document.querySelectorAll(`#eTablaEje tr[data-parent="${rowId}"]`);
        const icon = row.querySelector('i');
        const isHidden = children.length > 0 && children[0].style.display === 'none';
        
        children.forEach(c => {
          c.style.display = isHidden ? 'table-row' : 'none';
          // Si estamos cerrando el padre, también ocultamos a sus hijos internos
          if (!isHidden) {
            const cRowId = c.dataset.rowId;
            if (cRowId) {
              document.querySelectorAll(`#eTablaEje tr[data-parent="${cRowId}"]`).forEach(gc => { gc.style.display = 'none'; });
            }
          }
        });
        
        if (icon) {
          icon.classList.toggle('fa-plus-square', !isHidden);
          icon.classList.toggle('fa-minus-square', isHidden);
        }
      });
    });
  }
}

function renderSeguimiento() {
  if (!state.data) { $("kpiSeguimiento").innerHTML = ""; $("gridSeguimiento").innerHTML = vacioMensaje(12); return; }
  
  const sDep = $("sDep") ? $("sDep").value : "";
  const sOfi = $("sOfi") ? $("sOfi").value : "";
  const sGen = $("sGen") ? $("sGen").value : "";
  const sEsp = $("sEsp") ? $("sEsp").value : "";
  const sMeta = $("sMeta") ? $("sMeta").value : "";

  const filasFiltradas = state.data.filas.filter(f => {
    if (sDep && f.dep !== sDep) return false;
    if (sOfi && f.ofi !== sOfi) return false;
    if (sGen && f.gen !== sGen) return false;
    if (sEsp && f.esp !== sEsp) return false;
    if (sMeta && f.meta !== sMeta) return false;
    return true;
  });

  let tPim = 0, tCert = 0, tDev = 0, tProg = 0;
  filasFiltradas.forEach(f => {
    tPim += f.pim; tCert += f.cert; tDev += f.dev;
    tProg += f.progOct; 
  });

  $("kpiSeguimiento").innerHTML = [
    heroCard({ title: "PIM (Filtrado)", value: "S/ " + fmt(tPim), unit: "", note: `Programación Oct: ${fmtM(tProg)}`, badge: `Saldo Total: ${fmtM(tPim - tDev)}` }),
    kpiCard({ icon: "fa-file-signature", tone: "gold", title: "% Certificado", value: fmt(tPim ? (tCert/tPim)*100 : 0, 2) + "%", unit: "", pct: tPim ? (tCert/tPim)*100 : 0, barLabel: "Cert / PIM", foot: fmtM(tCert) }),
    kpiCard({ icon: "fa-coins", tone: "amber", title: "% Devengado", value: fmt(tPim ? (tDev/tPim)*100 : 0, 2) + "%", unit: "", pct: tPim ? (tDev/tPim)*100 : 0, barLabel: "Dev / PIM", foot: fmtM(tDev) }),
    kpiCard({ icon: "fa-calendar-check", tone: "green", title: "Programación", value: fmtM(tProg), unit: "", pct: tPim ? (tProg/tPim)*100 : 0, barLabel: "Prog Oct", foot: "Proyección" }),
  ].join("");

  const searchDepSeg = $("sSearchDepSeg") ? $("sSearchDepSeg").value.toLowerCase() : "";
  const filterDepSeg = $("sFilterDepSeg") ? $("sFilterDepSeg").value : "";
  const searchOfiSeg = $("sSearchOfiSeg") ? $("sSearchOfiSeg").value.toLowerCase() : "";
  const filterOfiSeg = $("sFilterOfiSeg") ? $("sFilterOfiSeg").value : "";

  const filasSeg = filasFiltradas.filter(f => {
    if (filterDepSeg && f.dep !== filterDepSeg) return false;
    if (searchDepSeg && !f.dep.toLowerCase().includes(searchDepSeg)) return false;
    if (filterOfiSeg && f.ofi !== filterOfiSeg) return false;
    if (searchOfiSeg && !f.ofi.toLowerCase().includes(searchOfiSeg)) return false;
    return true;
  });

  const depMap = {};
  filasSeg.forEach(f => {
    if (!depMap[f.dep]) depMap[f.dep] = { pim: 0, cert: 0, compAnual: 0, comp: 0, dev: 0, saldoCert: 0, progOct: 0, devOct: 0, difOct: 0, progNov: 0, progDic: 0, difAnual: 0, ofis: {} };
    const d = depMap[f.dep];
    d.pim += f.pim; d.cert += f.cert; d.compAnual += f.compAnual; d.comp += f.comp; d.dev += f.dev;
    d.saldoCert += f.saldoCert; d.progOct += f.progOct; d.devOct += f.devOct; d.difOct += f.difOct;
    d.progNov += f.progNov; d.progDic += f.progDic; d.difAnual += f.difAnual;

    if (!d.ofis[f.ofi]) d.ofis[f.ofi] = { pim: 0, cert: 0, compAnual: 0, comp: 0, dev: 0, saldoCert: 0, progOct: 0, devOct: 0, difOct: 0, progNov: 0, progDic: 0, difAnual: 0, metas: {} };
    const o = d.ofis[f.ofi];
    o.pim += f.pim; o.cert += f.cert; o.compAnual += f.compAnual; o.comp += f.comp; o.dev += f.dev;
    o.saldoCert += f.saldoCert; o.progOct += f.progOct; o.devOct += f.devOct; o.difOct += f.difOct;
    o.progNov += f.progNov; o.progDic += f.progDic; o.difAnual += f.difAnual;

    if (!o.metas[f.meta]) o.metas[f.meta] = { pim: 0, cert: 0, compAnual: 0, comp: 0, dev: 0, saldoCert: 0, progOct: 0, devOct: 0, difOct: 0, progNov: 0, progDic: 0, difAnual: 0, gens: {} };
    const m = o.metas[f.meta];
    m.pim += f.pim; m.cert += f.cert; m.compAnual += f.compAnual; m.comp += f.comp; m.dev += f.dev;
    m.saldoCert += f.saldoCert; m.progOct += f.progOct; m.devOct += f.devOct; m.difOct += f.difOct;
    m.progNov += f.progNov; m.progDic += f.progDic; m.difAnual += f.difAnual;

    if (!m.gens[f.gen]) m.gens[f.gen] = { pim: 0, cert: 0, compAnual: 0, comp: 0, dev: 0, saldoCert: 0, progOct: 0, devOct: 0, difOct: 0, progNov: 0, progDic: 0, difAnual: 0 };
    const g = m.gens[f.gen];
    g.pim += f.pim; g.cert += f.cert; g.compAnual += f.compAnual; g.comp += f.comp; g.dev += f.dev;
    g.saldoCert += f.saldoCert; g.progOct += f.progOct; g.devOct += f.devOct; g.difOct += f.difOct;
    g.progNov += f.progNov; g.progDic += f.progDic; g.difAnual += f.difAnual;
  });

  const topDeps = Object.entries(depMap).sort((a,b)=>b[1].pim - a[1].pim).slice(0, 8);
  renderGrouped("sBarras", topDeps.map(d=>d[0]), [
    { label: "PIM", color: C.goldDark, data: topDeps.map(d=>d[1].pim) },
    { label: "Devengado", color: C.green, data: topDeps.map(d=>d[1].dev) },
  ]);

  let saldos = {};
  filasSeg.forEach(f => { saldos[f.dep] = (saldos[f.dep] || 0) + f.saldoCert; });
  const topSaldos = Object.entries(saldos).sort((a,b)=>b[1]-a[1]).slice(0,6);
  renderDoughnut("sDona", topSaldos.map(s=>s[0]), topSaldos.map(s=>s[1]), fmtM(tPim - tCert), "Saldo Cert.");

  const cRow = (label, data, nivel=0, hasChild=false, rowId="", parentId="") => {
    const p = (v) => data.pim ? fmt((v / data.pim)*100, 1) + "%" : "-";
    const paddingLeft = nivel === 0 ? "10px" : `${nivel * 20 + 10}px`;
    
    return `
      <tr class="${hasChild ? 'row-parent' : ''} ${parentId ? 'child' : ''}" ${hasChild ? `data-row-id="${rowId}"` : ''} ${parentId ? `data-parent="${parentId}"` : ''} style="${hasChild ? 'cursor:pointer; font-weight:600; background:#F8FAFC;' : 'color:#64748B;'}">
        <td style="padding-left: ${paddingLeft}; white-space: normal; word-break: break-word; max-width: 250px;">
          ${hasChild ? '<i class="fas fa-plus-square" style="color:#0F172A; width:15px; margin-right:5px;"></i>' : '<i style="width:15px; margin-right:5px; display:inline-block;"></i>'}
          ${label}
        </td>
        <td class="num">${fmt(data.progOct, 2)}</td>
        <td class="num">${fmt(data.devOct, 2)}</td>
        <td class="num">${p(data.devOct)}</td>
        <td class="num">${fmt(data.difOct, 2)}</td>
        <td class="num">${fmt(data.progNov, 2)}</td>
        <td class="num">${fmt(data.progDic, 2)}</td>
        <td class="num">${fmt(data.difAnual, 2)}</td>
      </tr>`;
  };

  let html = `<div class="tbl-wrap"><table class="tbl"><thead><tr>
    <th style="width: 35%;">Dependencia / Oficina</th>
    <th class="num" style="width: 10%;">Prog. Gastos</th>
    <th class="num" style="width: 10%;">Dev 19 Oct</th>
    <th class="num" style="width: 10%;">% Eje Oct</th>
    <th class="num" style="width: 10%;">Diferencia</th>
    <th class="num" style="width: 8%;">Prog Nov</th>
    <th class="num" style="width: 8%;">Prog Dic</th>
    <th class="num" style="width: 9%;">Dif. Anual 2026</th>
  </tr></thead><tbody>`;

  let tProgOctSeg = 0, tDevOctSeg = 0, tDifOctSeg = 0, tProgNovSeg = 0, tProgDicSeg = 0, tDifAnualSeg = 0, tPimSeg = 0;

  Object.keys(depMap).sort().forEach((depName, iDep) => {
    const d = depMap[depName];
    tPimSeg += d.pim;
    tProgOctSeg += d.progOct; tDevOctSeg += d.devOct; tDifOctSeg += d.difOct;
    tProgNovSeg += d.progNov; tProgDicSeg += d.progDic; tDifAnualSeg += d.difAnual;

    const depId = `dep-${iDep}`;
    html += cRow(depName, d, 0, true, depId, "");
    
    Object.keys(d.ofis).sort().forEach((ofiName, iOfi) => {
      const ofiId = `ofi-${iDep}-${iOfi}`;
      html += cRow(ofiName, d.ofis[ofiName], 1, true, ofiId, depId);

      Object.keys(d.ofis[ofiName].metas).sort().forEach((metaName, iMeta) => {
        const metaId = `meta-${iDep}-${iOfi}-${iMeta}`;
        html += cRow(`${metaName} - ${ofiName}`, d.ofis[ofiName].metas[metaName], 2, true, metaId, ofiId);

        Object.keys(d.ofis[ofiName].metas[metaName].gens).sort().forEach((genName) => {
          html += cRow(genName || "SIN GEN", d.ofis[ofiName].metas[metaName].gens[genName], 3, false, "", metaId);
        });
      });
    });
  });

  const pTotalDevOctSeg = tPimSeg ? fmt((tDevOctSeg / tPimSeg)*100, 1) + "%" : "-";

  html += `
    <tr style="font-weight:700; background:#F1F5F9; border-top:2px solid #CBD5E1;">
      <td style="padding-left: 10px;">Total general</td>
      <td class="num">${fmt(tProgOctSeg, 2)}</td>
      <td class="num">${fmt(tDevOctSeg, 2)}</td>
      <td class="num">${pTotalDevOctSeg}</td>
      <td class="num">${fmt(tDifOctSeg, 2)}</td>
      <td class="num">${fmt(tProgNovSeg, 2)}</td>
      <td class="num">${fmt(tProgDicSeg, 2)}</td>
      <td class="num">${fmt(tDifAnualSeg, 2)}</td>
    </tr>
  `;
  html += `</tbody></table></div>`;
  $("sTabla").innerHTML = html;

  // Ocultar todos los hijos al inicio
  document.querySelectorAll('#sTabla tr[data-parent]').forEach(row => {
    row.style.display = 'none';
  });

  // Lógica para el acordeón
  document.querySelectorAll('#sTabla .row-parent').forEach(row => {
    row.addEventListener('click', () => {
      const rowId = row.dataset.rowId;
      const children = document.querySelectorAll(`#sTabla tr[data-parent="${rowId}"]`);
      const icon = row.querySelector('i');
      const isHidden = children.length > 0 && children[0].style.display === 'none';
      
      children.forEach(c => {
        c.style.display = isHidden ? 'table-row' : 'none';
        // Si estamos cerrando el padre, también ocultamos a sus hijos internos
        if (!isHidden) {
          const cRowId = c.dataset.rowId;
          if (cRowId) {
            document.querySelectorAll(`#sTabla tr[data-parent="${cRowId}"]`).forEach(gc => { gc.style.display = 'none'; });
          }
        }
      });
      
      if (icon) {
        icon.classList.toggle('fa-plus-square', !isHidden);
        icon.classList.toggle('fa-minus-square', isHidden);
      }
    });
  });
}

function cambiarSeccion(seccion) {
  document.querySelectorAll("#dashTabs .tab").forEach(t => t.classList.toggle("active", t.dataset.seccion === seccion));
  ["evolucion", "seguimiento"].forEach(s => { const el = document.getElementById(s); if (el) el.hidden = s !== seccion; });
  
  if (seccion === "evolucion") renderEvolucion();
  if (seccion === "seguimiento") renderSeguimiento();
  
  requestAnimationFrame(() => Object.values(charts).forEach(c => c.resize()));
}

function engancharEventos() {
  if (listenersReady) return;
  listenersReady = true;

  document.querySelectorAll("#dashTabs .tab").forEach(tab => {
    tab.addEventListener("click", (e) => { e.preventDefault(); cambiarSeccion(tab.dataset.seccion); });
  });

  const actualizarOfis = (depId, ofiId) => {
    const depVal = $(depId) ? $(depId).value : "";
    const selOfi = $(ofiId);
    if (!selOfi) return;
    
    const ofisSet = new Set();
    state.data.filas.forEach(f => {
      if (!depVal || f.dep === depVal) {
        if (f.ofi) ofisSet.add(f.ofi);
      }
    });
    
    const currentVal = selOfi.value;
    selOfi.innerHTML = `<option value="">Todas las Ofis</option>`;
    [...ofisSet].sort().forEach(v => { 
      const o = document.createElement("option"); o.value = v; o.textContent = v; selOfi.appendChild(o); 
    });
    
    if ([...ofisSet].includes(currentVal)) selOfi.value = currentVal;
  };

  if ($("sDep")) $("sDep").addEventListener("change", () => { actualizarOfis("sDep", "sOfi"); renderSeguimiento(); });
  ["sOfi", "sGen", "sEsp", "sMeta"].forEach(id => {
    const el = $(id); if (el) el.addEventListener("change", () => renderSeguimiento());
  });
  
  const btnClearSeg = $("sClear");
  if (btnClearSeg) btnClearSeg.addEventListener("click", () => {
    ["sDep", "sOfi", "sGen", "sEsp", "sMeta"].forEach(id => { const el = $(id); if (el) el.value = ""; });
    actualizarOfis("sDep", "sOfi");
    renderSeguimiento();
  });

  if ($("eDep")) $("eDep").addEventListener("change", () => { actualizarOfis("eDep", "eOfi"); renderEvolucion(); });
  ["eOfi", "eGen", "eEsp", "eMeta"].forEach(id => {
    const el = $(id); if (el) el.addEventListener("change", () => renderEvolucion());
  });
  const btnClearEvo = $("eClear");
  if (btnClearEvo) btnClearEvo.addEventListener("click", () => {
    ["eDep", "eOfi", "eGen", "eEsp", "eMeta"].forEach(id => { const el = $(id); if (el) el.value = ""; });
    actualizarOfis("eDep", "eOfi");
    renderEvolucion();
  });

  if ($("eFilterDepEje")) $("eFilterDepEje").addEventListener("change", () => { actualizarOfis("eFilterDepEje", "eFilterOfiEje"); renderEvolucion(); });
  if ($("eSearchDepEje")) $("eSearchDepEje").addEventListener("input", renderEvolucion);
  if ($("eFilterOfiEje")) $("eFilterOfiEje").addEventListener("change", renderEvolucion);
  if ($("eSearchOfiEje")) $("eSearchOfiEje").addEventListener("input", renderEvolucion);

  if ($("sFilterDepSeg")) $("sFilterDepSeg").addEventListener("change", () => { actualizarOfis("sFilterDepSeg", "sFilterOfiSeg"); renderSeguimiento(); });
  if ($("sSearchDepSeg")) $("sSearchDepSeg").addEventListener("input", renderSeguimiento);
  if ($("sFilterOfiSeg")) $("sFilterOfiSeg").addEventListener("change", renderSeguimiento);
  if ($("sSearchOfiSeg")) $("sSearchOfiSeg").addEventListener("input", renderSeguimiento);

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