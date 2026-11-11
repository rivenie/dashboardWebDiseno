/* =====================================================================
   worker.js · Procesa la hoja de Gestión de Flota Vehicular
   ===================================================================== */
self.onmessage = function (e) {
  try {
    const { hojas } = e.data || {};
    if (!hojas || !hojas.length) throw new Error("No hay hojas para procesar.");
    const resultado = procesarFlota(hojas);
    self.postMessage({ ok: true, resultado });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message || String(err) });
  }
};

function norm(v) { return (v === undefined || v === null) ? "" : String(v).trim(); }
function num(v) {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  if (v === null || v === undefined || v === "") return 0;
  let s = String(v).trim().replace(/[^\d.,\-]/g, "");
  if (!s || s === "-" || s === ".") return 0;
  const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (lc > -1) s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  else if (ld > -1 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = parseFloat(s); return isFinite(n) ? n : 0;
}
function normKey(k) { return norm(k).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ""); }
function parseFecha(v) {
  if (!v) return null;
  if (v instanceof Date) return new Date(v.getTime());
  if (typeof v === "number" && v > 100) return new Date(Math.round((v - 25569) * 86400 * 1000));
  const d = new Date(v); return isNaN(d) ? null : d;
}
function fechaISO(d) { if (!d) return ""; const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }

const FIELD_MAP = {
  gestorasignado: "gestor", gestor: "gestor",
  cliente: "cliente",
  placa: "placa",
  marcamodelo: "marca", marca: "marca", modelo: "marca",
  ctrasignado: "ctr", ctr: "ctr",
  frecuenciademantto: "frecuencia", frecuencia: "frecuencia",
  kmactual: "kmActual", km_actual: "kmActual",
  fechaactualiza: "fechaActualiza", actualiza: "fechaActualiza",
  kmpromediorecorridomensual: "kmPromedio", promedio: "kmPromedio",
  kmultimomantto: "kmUltimo", ultimo_mantto: "kmUltimo",
  fechaultimomantto: "fechaUltimo", fecha_ultimo: "fechaUltimo",
  talleratencionmantenimiento: "taller", taller: "taller",
  fechaprogramadademantenimiento: "fechaProg", fecha_prog: "fechaProg",
  estatus: "estatus"
};

const CAMPOS = {
  gestor: "Gestor Asignado", cliente: "Cliente", placa: "Placa", marca: "Marca / Modelo",
  ctr: "CTR Asignado", frecuencia: "Frecuencia", kmActual: "KM Actual", fechaProg: "Fecha Prog.",
  taller: "Taller", estatus: "Estatus"
};

function detectarEncabezado(rows) {
  let hIdx = -1, mejor = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;
    const score = new Set(r.map((c) => FIELD_MAP[normKey(c)]).filter(Boolean)).size;
    if (score > mejor) { mejor = score; hIdx = i; }
  }
  if (hIdx < 0 || mejor < 3) return null;
  return hIdx;
}

function procesarFlota(hojas) {
  let hIdx = -1, rows = null;
  for (const h of hojas) {
    const idx = detectarEncabezado(h.rows);
    if (idx != null) { hIdx = idx; rows = h.rows; break; }
  }
  if (hIdx == null) throw new Error("No se encontraron las columnas necesarias de flota.");

  const header = rows[hIdx].map((c) => norm(c));
  const map = {};
  const columnas = {};
  header.forEach((h, i) => {
    const campo = FIELD_MAP[normKey(h)];
    if (campo && !(campo in columnas)) { map[i] = campo; columnas[campo] = h; }
  });

  if (!columnas.placa) throw new Error("Falta la columna 'Placa'.");
  if (!columnas.kmActual) throw new Error("Falta la columna 'Km Actual'.");

  const registros = [];
  let omitidas = 0;
  const hoy = new Date();

  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r) || r.length === 0) { omitidas++; continue; }
    
    const obj = {};
    let hasData = false;
    for (const idx in map) {
      const campo = map[idx];
      const raw = r[idx];
      if (raw !== undefined && raw !== null && norm(raw) !== "") hasData = true;
      
      if (["fechaActualiza", "fechaUltimo", "fechaProg"].includes(campo)) obj[campo] = parseFecha(raw);
      else if (["gestor", "cliente", "placa", "marca", "ctr", "taller", "estatus"].includes(campo)) obj[campo] = norm(raw);
      else obj[campo] = num(raw);
    }
    if (!hasData || !obj.placa) { omitidas++; continue; }

    const kmProx = obj.kmUltimo + obj.frecuencia;
    const kmDesfase = obj.kmActual - kmProx;
    const pctAvance = obj.frecuencia > 0 ? ((obj.kmActual - obj.kmUltimo) / obj.frecuencia) * 100 : 0;

    let diasRestantes = null;
    if (obj.fechaProg) {
      const diffTime = obj.fechaProg - hoy;
      diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    let semaforo = "Vigente";
    if (pctAvance >= 100 || kmDesfase > 0) {
      semaforo = "Vencido";
    } else if (pctAvance >= 80 || kmDesfase >= -500 || (diasRestantes !== null && diasRestantes <= 15)) {
      semaforo = "Próximo";
    }

    obj.fechaProgStr = fechaISO(obj.fechaProg);
    obj.diasRestantes = diasRestantes;
    obj.kmProx = kmProx;
    obj.kmDesfase = kmDesfase;
    obj.pctAvance = pctAvance;
    obj.semaforo = semaforo;

    registros.push(obj);
  }

  if (!registros.length) throw new Error("No se encontraron datos válidos.");

  const uniq = (arr) => Array.from(new Set(arr.filter((x) => x && x !== ""))).sort();
  const dims = {
    gestor: uniq(registros.map((r) => r.gestor)),
    cliente: uniq(registros.map((r) => r.cliente)),
    marca: uniq(registros.map((r) => r.marca)),
    taller: uniq(registros.map((r) => r.taller)),
    estatus: uniq(registros.map((r) => r.estatus)),
  };

  const sum = (f) => registros.reduce((a, x) => a + (Number(f(x)) || 0), 0);
  const placasUnicas = new Set(registros.map(r => r.placa)).size;
  const vencidos = registros.filter(r => r.semaforo === "Vencido").length;
  const proximos = registros.filter(r => r.semaforo === "Próximo").length;
  const vigentes = registros.filter(r => r.semaforo === "Vigente").length;

  const kpis = {
    totalFlota: placasUnicas,
    vencidos,
    proximos,
    vigentes,
    enTaller: registros.filter(r => (r.estatus||"").toLowerCase().includes("taller")).length,
    pctCumplimiento: placasUnicas ? (vigentes / placasUnicas) * 100 : 0,
    registros: registros.length
  };

  return {
    meta: { schema: 6, columnas, faltantes: Object.keys(CAMPOS).filter((c) => !(c in columnas)), etiquetas: CAMPOS, filasOmitidas: omitidas },
    dims,
    kpis,
    filas: registros
  };
}