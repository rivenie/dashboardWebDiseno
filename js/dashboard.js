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

const state = { pim: null, cert: null, comp: null };
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

function tooltipStyle() {
  return {
    backgroundColor: "#FFFFFF", titleColor: C.text, bodyColor: C.text,
    borderColor: "#E2E8F0", borderWidth: 1, padding: 12, cornerRadius: 8, boxPadding: 6,
    boxWidth: 300, // <-- Esto le da más ancho a la tarjeta para que quepa el texto
    callbacks: { label: (c) => ` ${c.dataset.label ? c.dataset.label + ": " : c.label ? c.label + ": " : ""}${fmtM(c.parsed.y !== undefined ? c.parsed.y : c.parsed)}` },
  };
}
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
const labelBase = { color: C.text, font: { family: "'IBM Plex Sans', sans-serif", weight: "600", size: 10.5 } };

function renderGroupedWithLine(id, labels, datasetsBar, datasetsLine) {
  const maxAll = Math.max(...datasetsBar.flatMap(d => d.data), ...datasetsLine.flatMap(d => d.data), 0);
  mount(id, {
    type: "bar",
    data: { labels, datasets: [
      ...datasetsBar.map(d => ({
        type: "bar", label: d.label, data: d.data, backgroundColor: d.color,
        borderRadius: { topLeft: 6, topRight: 6 }, borderSkipped: false, maxBarThickness: 34,
        datalabels: { display: false } // Quitamos los números de las columnas
      })),
      ...datasetsLine.map(d => ({
        type: "line", label: d.label, data: d.data, borderColor: d.color, borderWidth: 2.5, tension: 0.35, fill: false,
        pointBackgroundColor: d.color, pointBorderColor: "#FFFFFF", pointBorderWidth: 2, pointRadius: 4,
        datalabels: { display: false } // Quitamos los números de la línea
      }))
    ] },
    options: { 
      responsive: true, maintainAspectRatio: false, 
      interaction: { mode: "index", intersect: false }, // Hace que el tooltip salte en cualquier parte del gráfico
      layout: { padding: { top: 18 } },
      plugins: {
        legend: { display: true, position: "bottom", labels: { color: C.dim, usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 14 } },
        tooltip: {
          backgroundColor: "#FFFFFF", titleColor: C.text, bodyColor: C.text,
          borderColor: "#E2E8F0", borderWidth: 1, padding: 12, 
          displayColors: true, 
          boxWidth: 10, 
          boxHeight: 10,
          callbacks: { 
            title: (c) => c[0].label, // <-- Devuelve el título completo (ya sin truncar)
            label: (c) => ` ${c.dataset.label}: ${fmtM(c.parsed.y)}`
          } 
        },
        datalabels: { display: false }, // Asegura que no se pinte nada flotando
      },
      scales: { x: scaleX(), y: scaleY(maxAll * 1.25) } },
  });
}

function renderGrouped(id, labels, datasets) {
  const maxAll = Math.max(...datasets.flatMap(d => d.data), 0);
  mount(id, {
    type: "bar",
    data: { labels, datasets: datasets.map(d => ({
      label: d.label, data: d.data, backgroundColor: d.color,
      borderRadius: { topLeft: 6, topRight: 6 }, borderSkipped: false, maxBarThickness: 34,
      datalabels: { display: false }
    })) },
    options: { 
      responsive: true, maintainAspectRatio: false, 
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 18, bottom: 10 } },
      plugins: {
        legend: { display: true, position: "bottom", labels: { color: C.dim, usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 14 } },
        tooltip: {
          backgroundColor: "#FFFFFF", titleColor: C.text, bodyColor: C.text,
          borderColor: "#E2E8F0", borderWidth: 1, padding: 12, 
          displayColors: true, boxWidth: 10, boxHeight: 10,
          callbacks: { 
            title: (c) => c[0].label,
            label: (c) => ` ${c.dataset.label}: S/ ${fmt(c.parsed.y, 2)}`
          } 
        },
        datalabels: { display: false }
      },
      scales: { 
        x: { 
          ...scaleX(), 
          ticks: { 
            color: C.dim, maxRotation: 0, autoSkip: false,
            callback: function(val, index) {
              const label = this.getLabelForValue(val);
              const words = label.split(' ');
              const lineas = [];
              let lineaActual = '';
              words.forEach(w => {
                if ((lineaActual + w).length > 15) {
                  lineas.push(lineaActual.trim());
                  lineaActual = w + ' ';
                } else {
                  lineaActual += w + ' ';
                }
              });
              if (lineaActual) lineas.push(lineaActual.trim());
              return lineas;
            }
          } 
        }, 
        y: scaleY(maxAll * 1.22) 
      } 
    },
  });
}

function renderStacked(id, labels, datasets) {
  const maxAll = Math.max(...labels.map((_, i) => datasets.reduce((sum, d) => sum + (d.data[i] || 0), 0)), 0);
  mount(id, {
    type: "bar",
    data: { labels, datasets: datasets.map(d => ({
      label: d.label, data: d.data, backgroundColor: d.color,
      borderRadius: { topLeft: 6, topRight: 6 }, borderSkipped: false, maxBarThickness: 40,
      datalabels: { display: false }
    })) },
    options: { 
      responsive: true, maintainAspectRatio: false, 
      interaction: { mode: "index", intersect: false }, // Hace que el tooltip salte en cualquier parte
      layout: { padding: { top: 18, bottom: 10 } },
      plugins: {
        legend: { display: true, position: "bottom", labels: { color: C.dim, usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 14 } },
        tooltip: {
          backgroundColor: "#FFFFFF", titleColor: C.text, bodyColor: C.text,
          borderColor: "#E2E8F0", borderWidth: 1, padding: 12, 
          displayColors: true, boxWidth: 10, boxHeight: 10,
          callbacks: { 
            title: (c) => c[0].label,
            label: (c) => ` ${c.dataset.label}: S/ ${fmt(c.parsed.y, 2)}` // Muestra el valor completo sin K
          } 
        },
      },
      scales: { 
        x: { 
          ...scaleX(), stacked: true, 
          ticks: { 
            color: C.dim, maxRotation: 0, autoSkip: false,
            callback: function(val, index) {
              const label = this.getLabelForValue(val);
              const words = label.split(' ');
              const lineas = [];
              let lineaActual = '';
              words.forEach(w => {
                if ((lineaActual + w).length > 15) {
                  lineas.push(lineaActual.trim());
                  lineaActual = w + ' ';
                } else {
                  lineaActual += w + ' ';
                }
              });
              if (lineaActual) lineas.push(lineaActual.trim());
              return lineas;
            }
          } 
        }, 
        y: { ...scaleY(maxAll * 1.22), stacked: true } 
      } 
    },
  });
}

function renderScrollHBar(id, labels, data, color1 = C.goldDark, color2 = C.goldLight) {
  const ctx = $(id); if (!ctx) return;
  if (charts[id]) charts[id].destroy();
  const wrap = ctx.parentElement;
  wrap.style.maxHeight = "400px"; wrap.style.overflowY = "auto"; wrap.style.overflowX = "hidden";
  ctx.style.height = Math.max(400, labels.length * 30) + "px"; ctx.style.maxHeight = "none";
  const max = Math.max(...data, 0);
  charts[id] = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ data, borderRadius: 6, borderSkipped: false, barThickness: 12, backgroundColor: gradV(color1, color2) }] },
    options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, layout: { padding: { right: 60, left: 10 } },
      plugins: { tooltip: tooltipStyle(), datalabels: { ...labelBase, display: true, anchor: "end", align: "right", offset: 4, formatter: (v) => fmtM(v) } },
      scales: { x: { ...scaleY(max * 1.18), ticks: { display: false } }, y: { grid: { display: false }, border: { display: false }, ticks: { color: C.text, callback(v) { return truncar(this.getLabelForValue(v), 30); } } } } },
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
  displayColors: false,
  callbacks: { 
    title: (c) => {
      // Corta el texto cada 25 letras y mete un salto de línea
      const txt = c[0].label;
      return txt.match(/.{1,25}(\s|$)/g) || [txt]; 
    },
    label: (c) => {
      const pct = total ? Math.round((c.parsed / total) * 100) : 0;
      return `Valor: ${fmtM(c.parsed)} (${pct}%)`;
    }
  } 
},
        datalabels: { ...labelBase, display: (c) => total > 0 && c.dataset.data[c.dataIndex] / total >= 0.06, color: "#1E293B", font: { family: "'IBM Plex Sans', sans-serif", weight: "700", size: 11 }, formatter: (v) => Math.round((v / total) * 100) + "%" },
        centerText: { title: centerTitle, sub: centerSub },
      } },
    plugins: [centerText],
  });
  const lg = $(id + "Legend");
if (lg) lg.innerHTML = labels.map((l, i) => `<div class="legend-item"><i style="background:${colores[i]}"></i><span title="${l}">${l}</span><b>${total ? Math.round((data[i] / total) * 100) : 0}%</b></div>`).join("");
}

/* ---------- PLANTILLAS UI ---------- */
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
  $("gridPim").innerHTML = [
    plotCard("pBarLine", "PIM vs Certificado vs Pagado", "Línea: Proyección Total Anual", 8, "tall"),
    donutCard("pEspGasto", "Saldo Real por tipo de gasto", "Distribución", 4),
    slotCard("pTabla", "Detalle PIM", "Oficina · Meta · ESP GASTO · PIM · Cert · Pag · Saldo Real", 12)
  ].join("");

  $("gridCert").innerHTML = [
    plotCard("cStacked", "Certificado vs Compromiso vs Devengado", "Por Rubro", 8, "tall"),
    plotCard("cOficina", "Top Oficinas (Cert x Comprometer)", "Monto", 4, "tall"),
    slotCard("cTabla", "Detalle Certificaciones", "Nro Cert · Fecha · Oficina · Rubro · Ejecuta · Cert · Pag", 12)
  ].join("");

  $("gridComp").innerHTML = [
    plotCard("coGrouped", "Compromiso vs Devengado vs Girado vs Pagado", "Por Oficina", 8, "tall"),
    donutCard("coSiaf", "Compromiso x Devengar por Tipo SIAF", "Distribución", 4),
    slotCard("coTabla", "Detalle Compromisos", "Nro Cert · Proveedor · Oficina · Comp · Gir · Pag · Estado", 12)
  ].join("");
}

function renderPim() {
  if (!state.pim) { $("kpiPim").innerHTML = ""; $("gridPim").innerHTML = vacioMensaje(12); return; }
  const d = state.pim;
  $("kpiPim").innerHTML = [
    heroCard({ title: "Total PIM", value: fmtM(d.kpis.tPim), unit: "", note: `Cert: ${fmtM(d.kpis.tCert)}`, badge: `Pag: ${fmtM(d.kpis.tPag)}` }),
    kpiCard({ icon: "fa-check", tone: "gold", title: "Total Certificado", value: fmtM(d.kpis.tCert), unit: "", pct: 100, barLabel: "Total", foot: `Registros` }),
    kpiCard({ icon: "fa-money-bill", tone: "amber", title: "Total Pagado", value: fmtM(d.kpis.tPag), unit: "", pct: 100, barLabel: "Total", foot: `Registros` }),
    kpiCard({ icon: "fa-building", tone: "green", title: "Total Saldo Real", value: fmtM(d.kpis.tSaldoReal), unit: "", pct: 100, barLabel: "Total", foot: `Disponible` }),
  ].join("");

  const top = d.porOficina.slice(0, 10);
  const labels = top.map(o => o.nombre); 
  renderGroupedWithLine("pBarLine", labels, [
    { label: "PIM", color: C.goldDark, data: top.map(o => o.pim) },
    { label: "Certificado", color: C.gold, data: top.map(o => o.cert) },
    { label: "Pagado", color: C.amber, data: top.map(o => o.pag) },
  ], [
    { label: "Proyección Anual", color: C.red, data: top.map(o => o.proy) }
  ]);

  const espTop = d.porEspGasto.slice(0, 6);
  renderDoughnut("pEspGasto", espTop.map(e => e.nombre), espTop.map(e => e.valor), fmtM(d.kpis.tSaldoReal), "Saldo");

  $("pTabla").innerHTML = d.filas.length ? tabla(
    [{ t: "Oficina" }, { t: "Meta" }, { t: "ESP GASTO" }, { t: "PIM", num: 1 }, { t: "Cert", num: 1 }, { t: "Pag", num: 1 }, { t: "Saldo Real", num: 1 }],
    d.filas.map(f => [f.ofi, f.meta, f.esp, fmtM(f.pim), fmtM(f.cert), fmtM(f.pag), fmtM(f.saldo)])
  ) : vacioMensaje(12);
}

function renderCert() {
  if (!state.cert) { $("kpiCert").innerHTML = ""; $("gridCert").innerHTML = vacioMensaje(12); return; }
  const d = state.cert;
  
  $("kpiCert").innerHTML = [
    heroCard({ title: "Total Certificado", value: fmtM(d.kpis.tCert), unit: "", note: `Comp: ${fmtM(d.kpis.tComp)}`, badge: `Dev: ${fmtM(d.kpis.tDev)}` }),
    kpiCard({ icon: "fa-handshake", tone: "gold", title: "Total Compromiso", value: fmtM(d.kpis.tComp), unit: "", pct: 100, barLabel: "Total", foot: `Registros` }),
    kpiCard({ icon: "fa-coins", tone: "amber", title: "Total Devengado", value: fmtM(d.kpis.tDev), unit: "", pct: 100, barLabel: "Total", foot: `Registros` }),
    kpiCard({ icon: "fa-money-bill-wave", tone: "green", title: "Total Pagado", value: fmtM(d.kpis.tPag), unit: "", pct: 100, barLabel: "Total", foot: `Registros` }),
  ].join("");

  // Agrupamos por oficina para el gráfico
  const porOficina = {};
  d.filas.forEach(f => {
    if (!f.ofi) return;
    if (!porOficina[f.ofi]) porOficina[f.ofi] = { cert: 0, comp: 0, dev: 0 };
    porOficina[f.ofi].cert += f.cert;
    porOficina[f.ofi].comp += f.comp;
    porOficina[f.ofi].dev += f.dev;
  });

  const arrOficinas = Object.entries(porOficina)
    .map(([nombre, vals]) => ({ nombre, ...vals }))
    .sort((a, b) => b.cert - a.cert)
    .slice(0, 10); // Top 10 oficinas por certificado

  // Gráfico 1: Apilado por Oficina
  renderStacked("cStacked", arrOficinas.map(o => o.nombre), [ // <-- Quitamos el truncar() de aquí
    { label: "Certificado", color: C.gold, data: arrOficinas.map(o => o.cert) },
    { label: "Compromiso", color: C.amber, data: arrOficinas.map(o => o.comp) },
    { label: "Devengado", color: C.green, data: arrOficinas.map(o => o.dev) },
  ]);

  // Gráfico 2: Top 5 Oficinas (Cert x Comprometer)
  const topOfi = d.porOficinaCertComp.slice(0, 5);
  renderScrollHBar("cOficina", topOfi.map(o => o.nombre), topOfi.map(o => o.valor), C.blue, C.cyan);

  // Tabla
  $("cTabla").innerHTML = d.filas.length ? tabla(
    [{ t: "Nro Cert" }, { t: "Fecha" }, { t: "Oficina" }, { t: "Rubro" }, { t: "Ejecuta" }, { t: "Cert", num: 1 }, { t: "Pag", num: 1 }],
    d.filas.map(f => [f.nro, f.fecha, f.ofi, f.rubro, f.ejec, fmtM(f.cert), fmtM(f.pag)])
  ) : vacioMensaje(12);
}

function renderComp() {
  if (!state.comp) { $("kpiComp").innerHTML = ""; $("gridComp").innerHTML = vacioMensaje(12); return; }
  const d = state.comp;
  $("kpiComp").innerHTML = [
    heroCard({ title: "Total Compromiso", value: fmtM(d.kpis.tComp), unit: "", note: `Dev: ${fmtM(d.kpis.tDev)}`, badge: `Gir: ${fmtM(d.kpis.tGir)}` }),
    kpiCard({ icon: "fa-coins", tone: "gold", title: "Total Devengado", value: fmtM(d.kpis.tDev), unit: "", pct: 100, barLabel: "Total", foot: `Registros` }),
    kpiCard({ icon: "fa-money-bill-transfer", tone: "amber", title: "Total Girado", value: fmtM(d.kpis.tGir), unit: "", pct: 100, barLabel: "Total", foot: `Registros` }),
    kpiCard({ icon: "fa-money-bill", tone: "green", title: "Total Pagado", value: fmtM(d.kpis.tPag), unit: "", pct: 100, barLabel: "Total", foot: `Registros` }),
  ].join("");

  const topOfi = d.porOficina.slice(0, 10);
  renderGrouped("coGrouped", topOfi.map(o => o.nombre), [ // Le quité el truncar
    { label: "Compromiso", color: C.goldDark, data: topOfi.map(o => o.comp) },
    { label: "Devengado", color: C.gold, data: topOfi.map(o => o.dev) },
    { label: "Girado", color: C.amber, data: topOfi.map(o => o.gir) },
    { label: "Pagado", color: C.green, data: topOfi.map(o => o.pag) },
  ]);

  const siafTop = d.porTipoSIAF.slice(0, 6);
  renderDoughnut("coSiaf", siafTop.map(s => s.nombre), siafTop.map(s => s.valor), fmtM(d.kpis.tComp), "Total"); // Le quité el truncar

  $("coTabla").innerHTML = d.filas.length ? `<div class="tabla-comp">${tabla(
    [{ t: "Nro Cert" }, { t: "Proveedor" }, { t: "Oficina" }, { t: "Compromiso", num: 1 }, { t: "Girado", num: 1 }, { t: "Pagado", num: 1 }, { t: "Estado" }],
    d.filas.map(f => [f.nro, f.prov, f.ofi, fmtM(f.comp), fmtM(f.gir), fmtM(f.pag), f.estado])
  )}</div>` : vacioMensaje(12);
}

function cambiarSeccion(seccion) {
  document.querySelectorAll("#dashTabs .tab").forEach(t => t.classList.toggle("active", t.dataset.seccion === seccion));
  ["pim", "cert", "comp"].forEach(s => {
    const el = document.getElementById(s);
    if (el) el.hidden = s !== seccion;
  });
  if (seccion === "pim") renderPim();
  if (seccion === "cert") renderCert();
  if (seccion === "comp") renderComp();
  requestAnimationFrame(() => Object.values(charts).forEach(c => c.resize()));
}

function engancharEventos() {
  if (listenersReady) return;
  listenersReady = true;
  document.querySelectorAll("#dashTabs .tab").forEach(tab => {
    tab.addEventListener("click", (e) => { e.preventDefault(); cambiarSeccion(tab.dataset.seccion); });
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
  const [pim, cert, comp] = await Promise.all([
    cargarHoja("SANIPES_PIM").catch(() => null),
    cargarHoja("SANIPES_CERT").catch(() => null),
    cargarHoja("SANIPES_COMP").catch(() => null)
  ]);
  state.pim = pim; state.cert = cert; state.comp = comp;

  const count = [pim, cert, comp].filter(x => x).length;
  $("stRegistros").textContent = `${count} / 3`;
  $("stSync").textContent = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  $("chipRegistros").textContent = fmt(count);
  $("chipSync").textContent = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

  cambiarSeccion("pim");
}

(async function init() {
  construirLayoutInterno();
  try {
    await cargarTodo();
    $("loading").hidden = true;
    $("topbar").hidden = false;
    $("shell").hidden = false;
    engancharEventos();
    cambiarSeccion("pim");
  } catch (err) {
    console.error(err);
    $("loading").innerHTML = `<div class="error-box"><i class="fas fa-triangle-exclamation"></i><h3>No se pudieron cargar los datos</h3><p>${err.message || err}</p></div>`;
  }
})();