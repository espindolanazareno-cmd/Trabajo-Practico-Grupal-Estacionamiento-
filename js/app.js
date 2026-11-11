const TOTAL_COCHERAS = 10;
const TARIFAS = { Moto: 100, Auto: 350, Camioneta: 500, Bus: 600 };
let vehículosEstacionados = [];

// Audio Bip Sintetizado
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
    console.log("Audio bloqueado");
  }
}

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

// Renderizar el Diagrama de Cocheras 2D
function renderizarPlano2D() {
  const zonaA = document.getElementById('zona-a');
  const zonaB = document.getElementById('zona-b');
  const libresEl = document.getElementById('cupos-libres');
  
  zonaA.innerHTML = '';
  zonaB.innerHTML = '';

  for (let i = 1; i <= TOTAL_COCHERAS; i++) {
    const vehiculo = vehículosEstacionados.find(v => v.posicion === i);
    const div = document.createElement('div');
    div.className = `cochera-2d ${vehiculo ? 'ocupada' : 'libre'}`;

    let icono = '🚗';
    if (vehiculo) {
      if (vehiculo.categoria === 'Moto') icono = '🏍️';
      if (vehiculo.categoria === 'Camioneta') icono = '🛻';
      if (vehiculo.categoria === 'Bus') icono = '🚌';
    }

    div.innerHTML = `
      <span class="num-cochera">A-${i}</span>
      <span class="auto-icono">${vehiculo ? icono : '🅿️'}</span>
      <span class="patente-label">${vehiculo ? vehiculo.patente : 'LIBRE'}</span>
    `;

    if (i <= 5) {
      zonaA.appendChild(div);
    } else {
      zonaB.appendChild(div);
    }
  }

  // Actualizar estadísticas y gráfico circular
  const libres = TOTAL_COCHERAS - vehículosEstacionados.length;
  const ocupados = vehículosEstacionados.length;
  const porcentaje = Math.round((ocupados / TOTAL_COCHERAS) * 100);

  libresEl.innerText = libres;
  document.getElementById('stat-libres').innerText = libres;
  document.getElementById('stat-ocupados').innerText = ocupados;
  document.getElementById('porcentaje-ocupacion').innerText = `${porcentaje}%`;

  // Actualizar Donut Chart CSS
  const chart = document.getElementById('chart-ocupacion');
  const grados = (porcentaje / 100) * 360;
  chart.style.background = `conic-gradient(#ff3344 0deg ${grados}deg, #1e293b ${grados}deg 360deg)`;
}

// Evento Ingreso
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
  
  alert(`Ticket Generado:\nFolio: ${folio}\nCochera: N°A-${posicion}`);
  document.getElementById('form-ingreso').reset();
  renderizarPlano2D();
});

// Evento Salida
document.getElementById('form-salida').addEventListener('submit', (e) => {
  e.preventDefault();
  const busqueda = document.getElementById('buscar-ticket').value.toUpperCase();
  const index = vehículosEstacionados.findIndex(v => v.folio === busqueda || v.patente === busqueda);

  if (index === -1) {
    alert('Vehículo no encontrado');
    return;
  }

  const vehiculo = vehículosEstacionados[index];
  const horaSalida = new Date();
  const minutos = Math.max(1, Math.ceil((horaSalida - new Date(vehiculo.horaEntrada)) / 60000));
  const tarifaPorHora = TARIFAS[vehiculo.categoria];
  const total = (minutos / 60 * tarifaPorHora).toFixed(2);

  document.getElementById('detalle-cobro').innerHTML = `
    <h4>COMPROBANTE DE PAGO</h4>
    <p><strong>Folio:</strong> ${vehiculo.folio}</p>
    <p><strong>Patente:</strong> ${vehiculo.patente}</p>
    <p><strong>Total:</strong> $${total}</p>
    <button onclick="finalizarSalida(${index})" style="width:100%;">Confirmar Pago</button>
  `;
});

function finalizarSalida(index) {
  accionarBarrera();
  vehículosEstacionados.splice(index, 1);
  document.getElementById('detalle-cobro').innerHTML = '';
  document.getElementById('form-salida').reset();
  renderizarPlano2D();
}

renderizarPlano2D();
