const TOTAL_COCHERAS = 10;
const INTERVALO_SINCRONIZACION = 15000;
let vehículosEstacionados = [];
let cobroPendiente = null;
let operando = false;
let errorDeConexion = false;

// Sonido Bip
function emitirBip(frecuencia = 800, duracion = 0.15) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.value = frecuencia;
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + duracion);
  } catch (e) {
    console.log("Audio bloqueado o no soportado");
  }
}

// Control visual de la barrera
function accionarBarrera(idBarrera = 'brazo-barrera') {
  const barrera = document.getElementById(idBarrera);
  emitirBip(800, 0.1);
  setTimeout(() => emitirBip(1200, 0.15), 120);

  if (barrera) barrera.classList.add('abierta');

  setTimeout(() => {
    if (barrera) barrera.classList.remove('abierta');
    emitirBip(400, 0.2);
  }, 3500);
}

function mostrarMensaje(texto, tipo = 'error') {
  const mensaje = document.getElementById('mensaje');
  mensaje.className = `mensaje ${tipo}`;
  mensaje.textContent = texto;
}

function normalizarPatente(valor) {
  return valor.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function primeraCocheraLibre(ocupadas) {
  for (let i = 1; i <= TOTAL_COCHERAS; i++) {
    if (!ocupadas.has(i)) return i;
  }
  return null;
}

// Los vehículos dentro de la playa salen de la base de datos, así el estado
// se conserva al recargar y es el mismo en todas las terminales.
async function cargarEstacionados() {
  const { estacionados } = await Api.request('movimientos', { params: { estacionados: 1 } });
  const ocupadas = new Set();
  const sinLugar = [];

  vehículosEstacionados = estacionados.map(m => {
    const vehiculo = {
      folio: m.folio,
      patente: m.patente,
      categoria: m.categoria,
      posicion: Number(m.cochera) || null,
      abonado: m.tipo_cliente === 'abonado' ? { titular: m.titular } : null
    };
    if (!vehiculo.posicion || vehiculo.posicion > TOTAL_COCHERAS || ocupadas.has(vehiculo.posicion)) {
      sinLugar.push(vehiculo);
    } else {
      ocupadas.add(vehiculo.posicion);
    }
    return vehiculo;
  });

  sinLugar.forEach(v => {
    v.posicion = primeraCocheraLibre(ocupadas);
    if (v.posicion) ocupadas.add(v.posicion);
  });

  renderizarCocheras();
}

async function cargarUltimosMovimientos() {
  const { movimientos } = await Api.request('movimientos', { params: { limite: 15 } });
  const tbody = document.querySelector('#tabla-ultimos tbody');
  tbody.innerHTML = movimientos.length === 0
    ? '<tr><td colspan="8" class="vacio">Todavía no hay movimientos registrados.</td></tr>'
    : movimientos.map(m => `
      <tr>
        <td>${formatearFechaHora(m.fecha_hora)}</td>
        <td>${etiquetaTipoMovimiento(m)}</td>
        <td><strong>${escaparHtml(m.patente)}</strong></td>
        <td>${escaparHtml(m.categoria || '-')}</td>
        <td>${m.cochera ? 'N°' + m.cochera : '-'}</td>
        <td>${escaparHtml(m.folio || '-')}</td>
        <td>${clienteMovimiento(m)}</td>
        <td>${cobradoMovimiento(m)}</td>
      </tr>`).join('');
}

async function cargarPreciosCategorias() {
  const tarifas = await cargarTarifas();
  document.querySelectorAll('#categoria option').forEach(opcion => {
    const t = tarifas[opcion.value];
    if (t) opcion.textContent = `${t.descripcion} (${formatearMonto(t.precio_hora)}/h)`;
  });
}

async function sincronizar() {
  try {
    await Promise.all([cargarEstacionados(), cargarUltimosMovimientos(), cargarPreciosCategorias()]);
    if (errorDeConexion) {
      errorDeConexion = false;
      mostrarMensaje('');
    }
  } catch (e) {
    errorDeConexion = true;
    mostrarMensaje(`No se pudo leer la base de datos: ${e.message}`);
  }
}

// Renderizar Mapa Original y actualizar cupos
function renderizarCocheras() {
  const contenedor = document.getElementById('mapa-cocheras');
  const libresEl = document.getElementById('cupos-libres');
  
  if (!contenedor) return;
  contenedor.innerHTML = '';

  for (let i = 1; i <= TOTAL_COCHERAS; i++) {
    const vehiculo = vehículosEstacionados.find(v => v.posicion === i);
    const div = document.createElement('div');
    div.className = `cochera ${vehiculo ? 'ocupada' : 'libre'}`;
    div.innerText = vehiculo ? `N°${i}\n${vehiculo.patente}${vehiculo.abonado ? '\nABONADO' : ''}` : `N°${i}\nLibre`;
    contenedor.appendChild(div);
  }

  if (libresEl) {
    libresEl.innerText = Math.max(0, TOTAL_COCHERAS - vehículosEstacionados.length);
  }
}

// Evento de Ingreso de Vehículo
document.getElementById('form-ingreso').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (operando) return;

  const patenteInput = document.getElementById('patente');
  const categoria = document.getElementById('categoria').value;
  const patente = normalizarPatente(patenteInput.value);

  if (!patente) {
    alert('Ingrese una patente válida.');
    return;
  }

  operando = true;
  mostrarMensaje('');
  try {
    await cargarEstacionados();

    if (vehículosEstacionados.length >= TOTAL_COCHERAS) {
      alert('Estacionamiento lleno');
      return;
    }
    if (vehículosEstacionados.some(v => v.patente === patente)) {
      alert('Esa patente ya se encuentra registrada en el estacionamiento.');
      return;
    }

    const posicion = primeraCocheraLibre(new Set(vehículosEstacionados.map(v => v.posicion)));
    const r = await Api.request('movimientos', { body: { tipo: 'entrada', patente, categoria, cochera: posicion } });

    accionarBarrera();
    patenteInput.value = '';
    await sincronizar();

    const { folio, cochera } = r.movimiento;
    setTimeout(() => alert(`Ticket Generado:\n\nFolio: ${folio}\nPatente: ${patente}\nCochera: N°${cochera}` +
      (r.sin_cargo ? `\n\nAbonado mensual al día: ${r.abonado.titular}` : '')), 1100);
  } catch (err) {
    mostrarMensaje(`No se pudo registrar el ingreso: ${err.message}`);
  } finally {
    operando = false;
  }
});

// Evento de Salida y Cobro
document.getElementById('form-salida').addEventListener('submit', async (e) => {
  e.preventDefault();
  const busqueda = document.getElementById('buscar-ticket').value.trim().toUpperCase();

  mostrarMensaje('');
  let r;
  try {
    r = await Api.request('movimientos', { params: { cotizar: busqueda } });
  } catch (err) {
    alert(err.message);
    return;
  }

  const { estacionado: v, cotizacion: c } = r;
  cobroPendiente = { patente: v.patente };

  document.getElementById('detalle-cobro').innerHTML = `
    <h3>COMPROBANTE DE PAGO</h3>
    <p><strong>Folio:</strong> ${escaparHtml(v.folio)}</p>
    <p><strong>Patente:</strong> ${escaparHtml(v.patente)}</p>
    <p><strong>Categoría:</strong> ${escaparHtml(v.categoria)}</p>
    <p><strong>Entrada:</strong> ${formatearFechaHora(v.fecha_hora)}</p>
    <p><strong>Salida:</strong> ${new Date().toLocaleTimeString()}</p>
    <p><strong>Estadía:</strong> ${formatearDuracion(c.minutos)}</p>
    ${r.sin_cargo
      ? `<p><strong>Abonado mensual:</strong> ${escaparHtml(v.titular)} (abono al día, sin cargo)</p>`
      : `<p><strong>Detalle:</strong> ${describirCotizacion(c)}</p>`}
    <p><strong>Total a Pagar:</strong> ${formatearMonto(c.monto)}</p>
    <button onclick="finalizarSalida()" style="width:100%;">Confirmar Pago y Abrir Barrera</button>
  `;
});

// Finalizar cobro y liberar espacio
async function finalizarSalida() {
  if (!cobroPendiente || operando) return;
  const vehiculo = cobroPendiente;

  operando = true;
  mostrarMensaje('');
  try {
    const r = await Api.request('movimientos', { body: { tipo: 'salida', patente: vehiculo.patente } });

    accionarBarrera('brazo-barrera-salida');
    cobroPendiente = null;
    document.getElementById('detalle-cobro').innerHTML = '';
    document.getElementById('form-salida').reset();
    await sincronizar();
    setTimeout(() => alert(`Pago realizado: ${formatearMonto(r.movimiento.monto)}.\nCochera liberada y barrera abierta.`), 1100);
  } catch (err) {
    mostrarMensaje(`No se pudo registrar la salida: ${err.message}`);
  } finally {
    operando = false;
  }
}

// Inicializar vista al cargar la página
renderizarCocheras();
sincronizar();
setInterval(() => { if (!operando) sincronizar(); }, INTERVALO_SINCRONIZACION);
