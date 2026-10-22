self.onmessage = function (e) {
  try {
    const { rows } = e.data;
    if (!rows || rows.length === 0) throw new Error("Hoja vacía");
    const resultado = procesarSANIPES(rows);
    self.postMessage({ ok: true, resultado });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message });
  }
};

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];

function norm(v) { return v !== undefined && v !== null ? v.toString().trim() : ""; }
function num(v) {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  if (v === null || v === undefined || v === "") return 0;
  const s = v.toString().replace(",", ".").replace(/[^0-9.\-]/g, "");
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function procesarSANIPES(rows) {
  const hIdx = 0; // Fila 1 (Cabecera)
  const headers = (rows[hIdx] || []).map(h => (h || "").toString().trim().toUpperCase());
  
  const cOfi = headers.findIndex(h => h.includes("OFICINA") && !h.includes("META"));
  const cMeta = headers.findIndex(h => h === "META");
  const cEsp = headers.findIndex(h => h.includes("ESP GASTO")); // Columna K
  
  const cPim = headers.findIndex(h => h.startsWith("PIM") && !h.includes("%"));
  const cCert = headers.findIndex(h => h.startsWith("CERTIFICADO") && !h.includes("%") && !h.includes("SALDO"));
  const cCompAnual = headers.findIndex(h => h.includes("COMPROMISO ANUAL"));
  const cComp = headers.findIndex(h => h.startsWith("COMPROMISO") && !h.includes("ANUAL") && !h.includes("SALDO") && !h.includes("%"));
  const cDev = headers.findIndex(h => h.startsWith("DEVENGADO") && !h.includes("SALDO") && !h.includes("%") && !h.includes("PROY"));

  const cMeses = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SET","OCT","NOV","DIC"].map(m => 
    headers.findIndex(h => h.includes("DEV PROY") && h.includes(m))
  );

  const filas = [];
  const porOficina = {};
  const porEspGasto = {};
  const porMes = MESES.map(m => ({ mes: m, valor: 0 }));

  let tPim = 0, tCert = 0, tCompAnual = 0, tComp = 0, tDev = 0;
  let progNov = 0, progDic = 0;

  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const ofi = norm(r[cOfi]); 
    if (!ofi || ofi.toUpperCase().includes("TOTAL")) continue;

    const meta = norm(r[cMeta]);
    // Limpiar el código del ESP Gasto
    let esp = norm(r[cEsp]).replace(/^[0-9\.]+\s*-\s*/, '').trim();
    if (!esp) esp = "SIN ESPECÍFICA";

    const pim = num(r[cPim]);
    const cert = num(r[cCert]);
    const compAnual = num(r[cCompAnual]);
    const comp = num(r[cComp]);
    const dev = num(r[cDev]);

    tPim += pim; tCert += cert; tCompAnual += compAnual; tComp += comp; tDev += dev;

    // Leer los meses para la tabla y la proyección
    const devMesFila = new Array(12).fill(0);
    cMeses.forEach((col, mIdx) => {
      if (col >= 0) {
        const v = num(r[col]);
        devMesFila[mIdx] = v;
        if (v > 0) porMes[mIdx].valor += v;
      }
    });

    // Capturar Noviembre y Diciembre para las columnas de proyección
    const proyOct = devMesFila[9];
    const proyNov = devMesFila[10];
    const proyDic = devMesFila[11];
    progNov += proyNov;
    progDic += proyDic;

    // Acumular por Oficina
    if (!porOficina[ofi]) porOficina[ofi] = { pim: 0, cert: 0, compAnual: 0, comp: 0, dev: 0 };
    porOficina[ofi].pim += pim;
    porOficina[ofi].cert += cert;
    porOficina[ofi].compAnual += compAnual;
    porOficina[ofi].comp += comp;
    porOficina[ofi].dev += dev;

    // Acumular por ESP Gasto (solo si tiene devengado)
    if (esp && dev > 0) porEspGasto[esp] = (porEspGasto[esp] || 0) + dev;

    // Estructura de la fila con todos los meses
    filas.push({ 
      ofi, meta, esp, pim, cert, compAnual, comp, dev, 
      progOct: proyOct, progNov: proyNov, progDic: proyDic, devMes: devMesFila 
    });
  }

  const saldoCert = tPim - tCert;
  const saldoReal = tPim - tDev;
  const difAnual = tPim - tDev - progNov - progDic;

  return {
    kpis: { tPim, tCert, tCompAnual, tComp, tDev, saldoCert, saldoReal, progNov, progDic, difAnual },
    porOficina: Object.entries(porOficina).map(([k, v]) => ({ nombre: k, ...v })).sort((a, b) => b.pim - a.pim),
    porEspGasto: Object.entries(porEspGasto).map(([k, v]) => ({ nombre: k, valor: v })).sort((a, b) => b.valor - a.valor),
    porMes,
    filas
  };
}