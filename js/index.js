const SUPABASE_URL = "https://ffiuayjfnhlvxgktxbal.supabase.co";
const SUPABASE_KEY = "sb_publishable_F8h3Zay5r9pVATEnvAIa-Q_bnaXgj1U";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const fileInput = document.getElementById('excelFile');
const sheetStatus = document.getElementById('sheetStatus');
const sheetList = document.getElementById('sheetList');
const btnSubir = document.getElementById('btnSubir');
const mensaje = document.getElementById('mensaje');
const progressBox = document.getElementById('progressBox');
const progressBar = document.getElementById('progressBar');
const progressLabel = document.getElementById('progressLabel');
const progressPct = document.getElementById('progressPct');
const tipoDetected = document.getElementById('tipoDetected');
const tipoNombre = document.getElementById('tipoNombre');

const HOJAS_VALIDAS = {
  "PIM-SJ-J": "SANIPES_PIM",
  "CERT-SL-J": "SANIPES_CERT",
  "COMP-SL-J": "SANIPES_COMP"
};

let resultadoPendiente = null;

function setProgreso(pct, label) {
  progressBox.style.display = 'block';
  progressBar.style.width = pct + '%';
  progressPct.textContent = Math.round(pct) + '%';
  if (label) progressLabel.textContent = label;
}
function ocultarProgreso() { setTimeout(() => { progressBox.style.display = 'none'; }, 1500); }

function procesarEnWorker(hojas) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('js/worker.js');
    worker.onmessage = (e) => {
      const data = e.data;
      worker.terminate();
      if (data.ok) resolve(data.resultados);
      else reject(new Error(data.error || 'Error en worker'));
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error('Error del worker: ' + (err.message || 'desconocido')));
    };
    worker.postMessage({ hojas });
  });
}

fileInput.addEventListener('change', async function (e) {
  const file = e.target.files[0];
  if (!file) return;

  resultadoPendiente = null;
  sheetList.innerHTML = '';
  sheetStatus.style.display = 'none';
  tipoDetected.style.display = 'none';
  mensaje.className = 'mensaje';
  mensaje.textContent = '';

  try {
    setProgreso(5, 'Leyendo archivo…');
    const data = new Uint8Array(await file.arrayBuffer());

    setProgreso(15, 'Abriendo Excel…');
    const workbook = XLSX.read(data, { type: 'array', cellDates: false, cellNF: false, cellStyles: false });

    const encontradas = workbook.SheetNames.filter(n => HOJAS_VALIDAS[n.trim()]);
    if (encontradas.length === 0) {
      setProgreso(100, 'Error');
      mostrarMensaje('❌ El Excel debe tener las hojas: PIM-SJ-J, CERT-SL-J o COMP-SL-J.', 'error');
      ocultarProgreso();
      return;
    }

    tipoNombre.textContent = encontradas.join(", ");
    tipoDetected.style.display = 'flex';

    const hojas = [];
    let totalFilas = 0;
    for (let i = 0; i < encontradas.length; i++) {
      const nombre = encontradas[i];
      setProgreso(30 + (i / encontradas.length) * 25, `Leyendo ${nombre}…`);
      const worksheet = workbook.Sheets[nombre];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: '' });
      hojas.push({ nombre: nombre.trim(), rows });
      totalFilas += rows.length;
    }

    setProgreso(65, `Procesando ${totalFilas} filas…`);
    const agregado = await procesarEnWorker(hojas);

    resultadoPendiente = { registros: agregado };

    const li = document.createElement('li');
    li.innerHTML = `<i class="fas fa-check-circle"></i> ${encontradas.length} hojas procesadas`;
    sheetList.appendChild(li);

    setProgreso(100, `Procesado`);
    sheetStatus.style.display = 'block';
    mostrarMensaje(`Listo para subir.`, 'ok');
    ocultarProgreso();
  } catch (err) {
    console.error(err);
    setProgreso(100, 'Error');
    mostrarMensaje('❌ Error: ' + err.message, 'error');
    ocultarProgreso();
  }
});

btnSubir.addEventListener('click', async function () {
  if (!resultadoPendiente) { mostrarMensaje('Primero selecciona un archivo válido.', 'error'); return; }
  btnSubir.disabled = true;
  btnSubir.textContent = 'Subiendo…';
  setProgreso(0, `Subiendo datos…`);
  try {
    const { registros } = resultadoPendiente;
    
    await supabaseClient.from('dashboard_data').delete().in('sheet_name', Object.values(HOJAS_VALIDAS));

    const datosInsertar = registros.map(r => ({
      sheet_name: r.sheetName,
      row_index: 0,
      data: r.data
    }));

    if (datosInsertar.length > 0) {
      const { error } = await supabaseClient.from('dashboard_data').insert(datosInsertar);
      if (error) throw error;
    }

    setProgreso(100, `Subido`);
    mostrarMensaje(`✅ Datos subidos correctamente.`, 'ok');
    resultadoPendiente = null;
    sheetStatus.style.display = 'none';
    fileInput.value = '';
    ocultarProgreso();
  } catch (err) {
    console.error(err);
    mostrarMensaje('❌ Error: ' + err.message, 'error');
    setProgreso(100, 'Error');
    ocultarProgreso();
  } finally {
    btnSubir.disabled = false;
    btnSubir.textContent = 'Subir a Supabase';
  }
});

function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = 'mensaje ' + tipo;
}