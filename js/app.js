const TOTAL_COCHERAS = 10;
const TARIFAS = { Moto: 100, Auto: 350, Camioneta: 500, Bus: 600 };
let vehículosEstacionados = [];

// Generador de sonido Bip electrónico nativo
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
    console.log("Audio no soportado o bloqueado por el navegador");
  }
}

// Control de apertura y cierre de la barrera
function accionarBarrera() {
  const barrera = document.getElementById('brazo-barrera');
  
  // Doble bip de apertura
  emitirBip(800, 0.1);
  setTimeout(() => emitirBip(1200, 0.15), 120);

  // Levantar barrera
  if (barrera) barrera.classList.add('abierta');

  // Bajar barrera automáticamente tras 3.5 segundos
  setTimeout(() => {
    if (barrera) barrera.classList.remove('abierta');
    emitirBip(400, 0.2); // Bip grave al cerrar
  }, 3500);
}

// Renderizar mapa de espacios
function renderizarCocheras() {
  const contenedor = document.getElementById('mapa-cocheras');
  const libresEl = document.getElementById('cupos-libres');
  contenedor.innerHTML = '';

  for (let i = 1; i <= TOTAL_COCHERAS; i++) {
    const vehiculo = vehículosEstacionados.find(v => v.posicion === i);
    const div = document.createElement('div');
    div.className = `cochera ${vehiculo ? 'ocupada' : 'libre'}`;
    div.innerText = vehiculo ? `N°${i}\n${vehiculo.patente}` : `N°${i}\nLibre`;
    contenedor.appendChild(div);
  }

  libresEl.innerText = TOTAL_COCHERAS - vehículosEstacionados.length;
}

// Formulario de Ingreso
document.getElementById('form-ingreso').addEventListener('submit', (e) => {
  e.preventDefault();
  if (vehículosEstacionados.length >= TOTAL_COCHERAS) {
    alert('Estacionamiento lleno');
    return;
  }

  const patente = document.getElementById('patente').value.toUpperCase();
  const categoria = document.getElementById('categoria').value;
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
  
  alert(`Ticket Generado con Éxito:\n\nFolio: ${folio}\nPatente: ${patente}\nCochera Asignada: N°${posicion}`);
  document.getElementById('form-ingreso').reset();
  renderizarCocheras();
});

// Formulario de Salida y Cobro
document.getElementById('form-salida').addEventListener('submit', (e) => {
  e.preventDefault();
  const busqueda = document.getElementById('buscar-ticket').value.toUpperCase();
  const index = vehículosEstacionados.findIndex(v => v.folio === busqueda || v.patente === busqueda);

  if (index === -1) {
    alert('Vehículo no encontrado. Revise el folio o patente.');
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
    <button onclick="finalizarSalida(${index})">Confirmar Pago y Abrir Barrera</button>
  `;
});

// Confirmación de pago y liberación de espacio
function finalizarSalida(index) {
  accionarBarrera();
  vehículosEstacionados.splice(index, 1);
  document.getElementById('detalle-cobro').innerHTML = '';
  document.getElementById('form-salida').reset();
  renderizarCocheras();
  alert('Pago recibido correctamente. Barrera abierta.');
}

renderizarCocheras();
