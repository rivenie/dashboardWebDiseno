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
  // Buscamos automáticamente la fila que contenga la palabra "PIM" o "OFICINA"
  let hIdx = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i].some(cell => cell && cell.toString().toUpperCase().includes("OFICINA"))) {
      hIdx = i;
      break;
    }
  }
  const headers = (rows[hIdx] || []).map(h => (h || "").toString().trim().toUpperCase());
  
    const cOfi = headers.findIndex(h => h.includes("OFICINA"));
  const cDep = headers.findIndex(h => h.includes("DEPENDENCIA"));
  const cMeta = headers.findIndex(h => h === "META" || h.includes("META"));
  const cGen = headers.findIndex(h => h === "GEN" || h.includes("GEN"));
  const cEsp = headers.findIndex(h => h.includes("ESP GASTO"));
  
  const cPim = headers.findIndex(h => h.includes("PIM") && h.includes("(C)"));
  const cCert = headers.findIndex(h => h.includes("CERTIFICADO") && h.includes("(D)"));
  const cCompAnual = headers.findIndex(h => h.includes("COMPROMISO ANUAL"));
  const cComp = headers.findIndex(h => h.includes("COMPROMISO") && !h.includes("ANUAL"));
  const cDev = headers.findIndex(h => h.includes("DEVENGADO") && h.includes("(G)"));
  const cSaldoCert = headers.findIndex(h => h.includes("SALDO") && h.includes("PIM - CERTIFICADO"));
  
  const cProgOct = headers.findIndex(h => h.includes("DEV PROY 10-OCT"));
  const cDevOct = headers.findIndex(h => h.includes("DEV 10-OCT"));
  const cProgNov = headers.findIndex(h => h.includes("DEV PROY 11-NOV"));
  const cProgDic = headers.findIndex(h => h.includes("DEV PROY 12-DIC"));
  
  const cMeses = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SET","OCT","NOV","DIC"].map(m => 
    headers.findIndex(h => h.includes("DEV ") && h.includes(m) && !h.includes("PROY"))
  );

  const filas = [];
  const porMes = MESES.map(m => ({ mes: m, valor: 0 }));
  
  // Volvemos a agregar el objeto para el gráfico de Evolución
  const porEspGasto = {}; 

  let tPim = 0, tCert = 0, tCompAnual = 0, tComp = 0, tDev = 0;
  let tSaldoCert = 0, tProgOct = 0, tDevOct = 0, tProgNov = 0, tProgDic = 0;

  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const ofi = norm(r[cOfi]); 
const filaTexto = r.join(' ').toUpperCase(); // Junta todo el texto de la fila

// Si la oficina está vacía, o si la fila contiene "TOTAL", o si empieza con muchos asteriscos, se salta.
if (!ofi || ofi.toUpperCase().includes("TOTAL") || filaTexto.includes("TOTAL GENERAL") || filaTexto.startsWith("* *")) {
    continue; 
}

    const dep = norm(r[cDep]) || "SIN DEPENDENCIA";
    const meta = norm(r[cMeta]);
    const gen = norm(r[cGen]);
    
    let esp = norm(r[cEsp]);
    if (esp.includes("-")) esp = esp.split("-").slice(1).join("-").trim();
    if (!esp) esp = "SIN ESPECÍFICA";

    const pim = num(r[cPim]);
    const cert = num(r[cCert]);
    const compAnual = num(r[cCompAnual]);
    const comp = num(r[cComp]);
    const dev = num(r[cDev]);
    const saldoCert = num(r[cSaldoCert]);
    const progOct = num(r[cProgOct]);
    const devOct = num(r[cDevOct]);
    const progNov = num(r[cProgNov]);
    const progDic = num(r[cProgDic]);
    
    const difOct = progOct - devOct;
    const difAnual = pim - dev - progNov - progDic;
    const pctEjeOct = pim ? (devOct / pim) * 100 : 0;

    tPim += pim; tCert += cert; tCompAnual += compAnual; tComp += comp; tDev += dev;
    tSaldoCert += saldoCert; tProgOct += progOct; tDevOct += devOct; tProgNov += progNov; tProgDic += progDic;

    // Llenamos el objeto porEspGasto para que el gráfico de Evolución funcione
    if (esp && dev > 0) porEspGasto[esp] = (porEspGasto[esp] || 0) + dev;

    const devMesFila = new Array(12).fill(0);
    cMeses.forEach((col, mIdx) => {
      if (col >= 0) {
        const v = num(r[col]);
        devMesFila[mIdx] = v;
        if (v > 0) porMes[mIdx].valor += v;
      }
    });

    // Busca esta parte en worker.js (dentro del for):
    filas.push({ 
      ofi, dep, meta, gen, esp, pim, cert, compAnual, comp, dev, 
      saldoCert, progOct, devOct, progNov, progDic, difOct, difAnual, pctEjeOct,
      devMes: devMesFila // <--- Asegúrate de que esto esté aquí
    });
  }

  return {
    kpis: { tPim, tCert, tCompAnual, tComp, tDev, tSaldoCert, tProgOct, tDevOct, tProgNov, tProgDic },
    porEspGasto: Object.entries(porEspGasto).map(([k, v]) => ({ nombre: k, valor: v })).sort((a, b) => b.valor - a.valor),
    porMes,
    filas
  };
}