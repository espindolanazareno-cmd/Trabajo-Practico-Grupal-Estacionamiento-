const TOTAL_COCHERAS = 10;
const TARIFAS = { Moto: 100, Auto: 350, Camioneta: 500, Bus: 600 };
let vehículosEstacionados = [];

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
function accionarBarrera() {
  const barrera = document.getElementById('brazo-barrera');
  emitirBip(800, 0.1);
  setTimeout(() => emitirBip(1200, 0.15), 120);

  if (barrera) barrera.classList.add('abierta');

  setTimeout(() => {
    if (barrera) barrera.classList.remove('abierta');
    emitirBip(400, 0.2);
  }, 3500);
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
    div.innerText = vehiculo ? `N°${i}\n${vehiculo.patente}` : `N°${i}\nLibre`;
    contenedor.appendChild(div);
  }

  if (libresEl) {
    libresEl.innerText = TOTAL_COCHERAS - vehículosEstacionados.length;
  }
}

// Evento de Ingreso de Vehículo
document.getElementById('form-ingreso').addEventListener('submit', (e) => {
  e.preventDefault();

  if (vehículosEstacionados.length >= TOTAL_COCHERAS) {
    alert('Estacionamiento lleno');
    return;
  }

  const patenteInput = document.getElementById('patente');
  const categoriaInput = document.getElementById('categoria');
  
  const patente = patenteInput.value.trim().toUpperCase();
  const categoria = categoriaInput.value;

  if (vehículosEstacionados.some(v => v.patente === patente)) {
    alert('Esa patente ya se encuentra registrada en el estacionamiento.');
    return;
  }

  const folio = 'FOL-' + Math.floor(100000 + Math.random() * 900000);
  const posicion = Array.from({length: TOTAL_COCHERAS}, (_, i) => i + 1)
                        .find(pos => !vehículosEstacionados.some(v => v.posicion === pos));

  const nuevoIngreso = {
    folio,
    patente,
    categoria,
    posicion,
    horaEntrada: new Date()
  };

  vehículosEstacionados.push(nuevoIngreso);
  accionarBarrera();
  
  alert(`Ticket Generado:\n\nFolio: ${folio}\nPatente: ${patente}\nCochera: N°${posicion}`);
  
  patenteInput.value = '';
  renderizarCocheras();
});

// Evento de Salida y Cobro
document.getElementById('form-salida').addEventListener('submit', (e) => {
  e.preventDefault();
  const busqueda = document.getElementById('buscar-ticket').value.trim().toUpperCase();
  const index = vehículosEstacionados.findIndex(v => v.folio === busqueda || v.patente === busqueda);

  if (index === -1) {
    alert('Vehículo no encontrado. Verifique la patente o el folio.');
    return;
  }

  const vehiculo = vehículosEstacionados[index];
  const horaSalida = new Date();
  const minutos = Math.max(1, Math.ceil((horaSalida - new Date(vehiculo.horaEntrada)) / 60000));
  const tarifaPorHora = TARIFAS[vehiculo.categoria];
  const total = (minutos / 60 * tarifaPorHora).toFixed(2);

  document.getElementById('detalle-cobro').innerHTML = `
    <h3>COMPROBANTE DE PAGO</h3>
    <p><strong>Folio:</strong> ${vehiculo.folio}</p>
    <p><strong>Patente:</strong> ${vehiculo.patente}</p>
    <p><strong>Categoría:</strong> ${vehiculo.categoria}</p>
    <p><strong>Entrada:</strong> ${new Date(vehiculo.horaEntrada).toLocaleTimeString()}</p>
    <p><strong>Salida:</strong> ${horaSalida.toLocaleTimeString()}</p>
    <p><strong>Total a Pagar:</strong> $${total}</p>
    <button onclick="finalizarSalida(${index})" style="width:100%;">Confirmar Pago y Abrir Barrera</button>
  `;
});

// Finalizar cobro y liberar espacio
function finalizarSalida(index) {
  accionarBarrera();
  vehículosEstacionados.splice(index, 1);
  document.getElementById('detalle-cobro').innerHTML = '';
  document.getElementById('form-salida').reset();
  renderizarCocheras();
  alert('Pago realizado. Cochera liberada y barrera abierta.');
}

// Inicializar vista al cargar la página
renderizarCocheras();
