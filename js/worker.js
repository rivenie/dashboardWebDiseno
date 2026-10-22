self.onmessage = function (e) {
  try {
    const { hojas } = e.data;
    const resultados = [];

    hojas.forEach(({ nombre, rows }) => {
      const n = nombre.toUpperCase();
      let data = null;
      let sheetName = "";

      // Detectamos la hoja y procesamos
      if (n.includes("PIM")) { data = procesarPIM(rows); sheetName = "SANIPES_PIM"; }
      else if (n.includes("CERT")) { data = procesarCERT(rows); sheetName = "SANIPES_CERT"; }
      else if (n.includes("COMP")) { data = procesarCOMP(rows); sheetName = "SANIPES_COMP"; }

      if (data && sheetName) resultados.push({ sheetName, data });
    });

    self.postMessage({ ok: true, resultados });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message });
  }
};

function norm(v) { return v !== undefined && v !== null ? v.toString().trim() : ""; }
function num(v) {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  if (v === null || v === undefined || v === "") return 0;
  // Si viene texto, limpiamos comas o símbolos raros
  const s = v.toString().replace(",", ".").replace(/[^0-9.\-]/g, "");
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

/* ---------- PIM ---------- */
function procesarPIM(rows) {
  if (!rows || rows.length === 0) return null;
  // Buscamos en las primeras filas cuál tiene los encabezados
  let hIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const f = (rows[i] || []).map(c => (c || "").toString().trim().toUpperCase());
    if (f.includes("ITEM") || f.includes("OFICINA") || f.includes("PIM (C)") || f.includes("PIM")) {
      hIdx = i; break;
    }
  }

  const headers = (rows[hIdx] || []).map(h => (h || "").toString().trim());
  const idx = (pred) => headers.findIndex(h => pred(h.toLowerCase()));
  
  const cOfi = idx(h => h.includes("oficina") && !h.includes("meta"));
  const cMeta = idx(h => h === "meta");
  const cEsp = idx(h => h === "esp gasto");
  const cPim = idx(h => h.startsWith("pim") && !h.includes("%"));
  const cCert = idx(h => h.startsWith("certificado") && !h.includes("%") && !h.includes("saldo"));
  const cPag = idx(h => h.startsWith("pagado"));
  const cProyTotal = idx(h => h.includes("total prog proy"));
  const cSaldoReal = idx(h => h.includes("saldo real"));

  const filas = [];
  const porOficina = {};
  const porEspGasto = {};
  let tPim = 0, tCert = 0, tPag = 0, tSaldoReal = 0, tProy = 0;

  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const ofi = norm(r[cOfi]); 
    if (!ofi || ofi.toUpperCase() === "TOTAL") continue;

    const meta = norm(r[cMeta]);
let esp = norm(r[cEsp]).replace(/^[0-9\.]+\s*-\s*/, '').trim();
    const pim = num(r[cPim]);
    const cert = num(r[cCert]);
    const pag = num(r[cPag]);
    const proy = num(r[cProyTotal]);
    const saldo = num(r[cSaldoReal]);

    tPim += pim; tCert += cert; tPag += pag; tSaldoReal += saldo; tProy += proy;

    if (!porOficina[ofi]) porOficina[ofi] = { pim: 0, cert: 0, pag: 0, proy: 0 };
    porOficina[ofi].pim += pim;
    porOficina[ofi].cert += cert;
    porOficina[ofi].pag += pag;
    porOficina[ofi].proy += proy;

    if (esp) porEspGasto[esp] = (porEspGasto[esp] || 0) + saldo;

    filas.push({ ofi, meta, esp, pim, cert, pag, proy, saldo });
  }

  return {
    kpis: { tPim, tCert, tPag, tSaldoReal, tProy },
    porOficina: Object.entries(porOficina).map(([k, v]) => ({ nombre: k, ...v })).sort((a, b) => b.pim - a.pim),
    porEspGasto: Object.entries(porEspGasto).map(([k, v]) => ({ nombre: k, valor: v })).sort((a, b) => b.valor - a.valor),
    filas
  };
}

/* ---------- CERT ---------- */
function procesarCERT(rows) {
  if (!rows || rows.length === 0) return null;
  let hIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const f = (rows[i] || []).map(c => (c || "").toString().trim().toUpperCase());
    if (f.includes("NRO CERT") || f.includes("FECHA CERT") || f.includes("CERTIFICADO")) {
      hIdx = i; break;
    }
  }

  const headers = (rows[hIdx] || []).map(h => (h || "").toString().trim());
  const idx = (pred) => headers.findIndex(h => pred(h.toLowerCase()));

  const cNroCert = idx(h => h.includes("nro cert"));
  const cFecha = idx(h => h.includes("fecha cert"));
  const cOfi = idx(h => h === "oficina");
  const cRubro = idx(h => h.includes("rubro adquisicion"));
  const cEjecuta = idx(h => h === "ejecuta");
  const cCert = idx(h => h === "certificado" || h.startsWith("certificado "));
  const cComp = idx(h => h === "compromiso" || h.startsWith("compromiso "));
  const cDev = idx(h => h === "devengado");
  const cPag = idx(h => h === "pagado");
  const cCertXComp = idx(h => h.includes("certificado - compromiso") || h.includes("certificado - comp"));

  const filas = [];
  const porRubro = {};
  const porOficinaCertComp = {};
  let tCert=0, tComp=0, tDev=0, tPag=0;

  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const nro = norm(r[cNroCert]); 
    if (!nro || nro.toUpperCase() === "TOTAL") continue;

    const fecha = norm(r[cFecha]);
    const ofi = norm(r[cOfi]);
    const rubro = norm(r[cRubro]) || "SIN RUBRO";
    const ejec = norm(r[cEjecuta]);
    const cert = num(r[cCert]);
    const comp = num(r[cComp]);
    const dev = num(r[cDev]);
    const pag = num(r[cPag]);
    const certXcomp = num(r[cCertXComp]);

    tCert += cert; tComp += comp; tDev += dev; tPag += pag;

    if (!porRubro[rubro]) porRubro[rubro] = { cert: 0, comp: 0, dev: 0 };
    porRubro[rubro].cert += cert;
    porRubro[rubro].comp += comp;
    porRubro[rubro].dev += dev;

    if (ofi) porOficinaCertComp[ofi] = (porOficinaCertComp[ofi] || 0) + certXcomp;

    filas.push({ nro, fecha, ofi, rubro, ejec, cert, comp, dev, pag });
  }

  return {
    kpis: { tCert, tComp, tDev, tPag },
    porRubro: Object.entries(porRubro).map(([k, v]) => ({ nombre: k, ...v })).sort((a, b) => b.cert - a.cert),
    porOficinaCertComp: Object.entries(porOficinaCertComp).map(([k, v]) => ({ nombre: k, valor: v })).sort((a, b) => b.valor - a.valor),
    filas
  };
}

/* ---------- COMP ---------- */
function procesarCOMP(rows) {
  if (!rows || rows.length === 0) return null;
  let hIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const f = (rows[i] || []).map(c => (c || "").toString().trim().toUpperCase());
    if (f.includes("NRO CERT") || f.includes("COMPROMISO") || f.includes("PROVEEDOR")) {
      hIdx = i; break;
    }
  }

  const headers = (rows[hIdx] || []).map(h => (h || "").toString().trim());
  const idx = (pred) => headers.findIndex(h => pred(h.toLowerCase()));

  const cNroCert = idx(h => h.includes("nro cert"));
  const cProv = idx(h => h.includes("proveedor") && !h.includes("razon"));
  const cOfi = idx(h => h === "oficina");
  const cComp = idx(h => h.includes("compromiso") && !h.includes("anual") && !h.includes("saldo") && !h.includes("%"));
  const cDev = idx(h => h === "devengado");
  const cGir = idx(h => h === "girado");
  const cPag = idx(h => h === "pagado");
  const cEstado = idx(h => h.includes("estado compromiso"));
  const cTipoSIAF = idx(h => h.includes("tipo siaf"));
  const cCompXDev = idx(h => h.includes("compromiso x devengar") || h.includes("saldo x devengar"));

  const filas = [];
  const porOficina = {};
  const porTipoSIAF = {};
  let tComp=0, tDev=0, tGir=0, tPag=0;

  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const nro = norm(r[cNroCert]); 
    if (!nro || nro.toUpperCase() === "TOTAL") continue;

    const prov = norm(r[cProv]);
    const ofi = norm(r[cOfi]);
    const comp = num(r[cComp]);
    const dev = num(r[cDev]);
    const gir = num(r[cGir]);
    const pag = num(r[cPag]);
    const estado = norm(r[cEstado]);
    const siaf = norm(r[cTipoSIAF]) || "SIN TIPO";
    const compXdev = num(r[cCompXDev]);

    tComp += comp; tDev += dev; tGir += gir; tPag += pag;

    if (ofi) {
      if (!porOficina[ofi]) porOficina[ofi] = { comp: 0, dev: 0, gir: 0, pag: 0 };
      porOficina[ofi].comp += comp;
      porOficina[ofi].dev += dev;
      porOficina[ofi].gir += gir;
      porOficina[ofi].pag += pag;
    }

    if (siaf && compXdev > 0) {
       porTipoSIAF[siaf] = (porTipoSIAF[siaf] || 0) + compXdev;
    }

    filas.push({ nro, prov, ofi, comp, gir, pag, estado, dev });
  }

  return {
    kpis: { tComp, tDev, tGir, tPag },
    porOficina: Object.entries(porOficina).map(([k, v]) => ({ nombre: k, ...v })).sort((a, b) => b.comp - a.comp),
    porTipoSIAF: Object.entries(porTipoSIAF).map(([k, v]) => ({ nombre: k, valor: v })).sort((a, b) => b.valor - a.valor),
    filas
  };
}