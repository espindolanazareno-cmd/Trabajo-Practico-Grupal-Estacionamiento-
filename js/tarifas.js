const $ = id => document.getElementById(id);
let tarifas = [];

function mostrarMensaje(texto, tipo = 'exito') {
  const el = $('mensaje');
  el.className = `mensaje ${tipo}`;
  el.textContent = texto;
  clearTimeout(mostrarMensaje.timer);
  mostrarMensaje.timer = setTimeout(() => { el.textContent = ''; }, 6000);
}

function renderizarTarifas() {
  $('tabla-tarifas').querySelector('tbody').innerHTML = tarifas.map(t => `
    <tr>
      <td><strong>${escaparHtml(t.descripcion)}</strong></td>
      <td>${formatearMonto(t.precio_hora)}</td>
      <td>${formatearMonto(t.precio_fraccion)}</td>
      <td>${formatearMonto(t.precio_mensual)}</td>
    </tr>`).join('');

  $('tabla-editar').querySelector('tbody').innerHTML = tarifas.map(t => `
    <tr data-categoria="${escaparHtml(t.categoria)}">
      <td>${escaparHtml(t.descripcion)}</td>
      <td><input type="number" name="precio_hora" min="0" step="0.01" value="${t.precio_hora}" required></td>
      <td><input type="number" name="precio_fraccion" min="0" step="0.01" value="${t.precio_fraccion}" required></td>
      <td><input type="number" name="precio_mensual" min="0" step="0.01" value="${t.precio_mensual}" required></td>
    </tr>`).join('');

  const seleccionada = $('sim-categoria').value || 'Auto';
  $('sim-categoria').innerHTML = tarifas.map(t =>
    `<option value="${escaparHtml(t.categoria)}">${escaparHtml(t.descripcion)}</option>`).join('');
  $('sim-categoria').value = seleccionada;
}

async function cargar() {
  try {
    ({ tarifas } = await Api.request('tarifas'));
    renderizarTarifas();
  } catch (e) {
    mostrarMensaje(`No se pudieron cargar las tarifas: ${e.message}`, 'error');
  }
}

$('form-simulador').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { cotizacion: c } = await Api.request('tarifas', {
      params: { categoria: $('sim-categoria').value, minutos: $('sim-minutos').value }
    });
    $('sim-resultado').innerHTML = `
      <p><strong>Estadía:</strong> ${formatearDuracion(c.minutos)}</p>
      <p><strong>Detalle:</strong> ${describirCotizacion(c)}</p>
      <p><strong>Total:</strong> ${formatearMonto(c.monto)}</p>`;
  } catch (err) {
    mostrarMensaje(err.message, 'error');
  }
});

$('form-tarifas').addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = [...$('tabla-editar').querySelectorAll('tbody tr')].map(tr => ({
    categoria: tr.dataset.categoria,
    precio_hora: tr.querySelector('[name=precio_hora]').value,
    precio_fraccion: tr.querySelector('[name=precio_fraccion]').value,
    precio_mensual: tr.querySelector('[name=precio_mensual]').value
  }));
  try {
    ({ tarifas } = await Api.request('tarifas', { body: { tarifas: datos } }));
    renderizarTarifas();
    mostrarMensaje('Precios actualizados.');
  } catch (err) {
    mostrarMensaje(`No se pudieron guardar los precios: ${err.message}`, 'error');
  }
});

cargar();
