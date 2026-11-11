const TOTAL_COCHERAS = 10;
const TARIFAS = { Moto: 100, Auto: 350, Camioneta: 500, Bus: 600 };
let vehículosEstacionados = [];

// Inicializar cocheras
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

// Ingreso de vehículo
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
  alert(`Ticket Generado:\nFolio: ${folio}\nCochera: N°${posicion}`);
  document.getElementById('form-ingreso').reset();
  renderizarCocheras();
});

// Cobro y salida
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
    <h3>COMPROBANTE DE PAGO</h3>
    <p><strong>Folio:</strong> ${vehiculo.folio}</p>
    <p><strong>Patente:</strong> ${vehiculo.patente}</p>
    <p><strong>Entrada:</strong> ${new Date(vehiculo.horaEntrada).toLocaleTimeString()}</p>
    <p><strong>Salida:</strong> ${horaSalida.toLocaleTimeString()}</p>
    <p><strong>Total a Pagar:</strong> $${total}</p>
    <button onclick="finalizarSalida(${index})">Confirmar Pago y Abrir Barrera</button>
  `;
});

function finalizarSalida(index) {
  vehículosEstacionados.splice(index, 1);
  document.getElementById('detalle-cobro').innerHTML = '';
  document.getElementById('form-salida').reset();
  renderizarCocheras();
  alert('Pago recibido. Barrera abierta.');
}

renderizarCocheras();
