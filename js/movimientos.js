const $ = id => document.getElementById(id);

async function cargarMovimientos() {
  const mensaje = $('mensaje');
  try {
    const { movimientos, resumen } = await Api.request('movimientos', {
      params: {
        desde: $('f-desde').value,
        hasta: $('f-hasta').value,
        patente: $('f-patente').value.trim(),
        tipo: $('f-tipo').value,
        tipo_cliente: $('f-cliente').value
      }
    });
    mensaje.textContent = '';

    $('r-entradas').textContent = Number(resumen.entradas || 0);
    $('r-salidas').textContent = Number(resumen.salidas || 0);
    $('r-abonados').textContent = Number(resumen.entradas_abonados || 0);
    $('r-estadias').textContent = formatearMonto(resumen.recaudado_estadias || 0);
    $('r-mensuales').textContent = formatearMonto(resumen.recaudado_mensuales || 0);
    $('r-recaudado').textContent = formatearMonto(resumen.recaudado || 0);

    const tbody = $('tabla-movimientos').querySelector('tbody');
    tbody.innerHTML = movimientos.length === 0
      ? '<tr><td colspan="10" class="vacio">No hay movimientos para los filtros seleccionados.</td></tr>'
      : movimientos.map(m => `
        <tr>
          <td>${formatearFechaHora(m.fecha_hora)}</td>
          <td>${etiquetaTipoMovimiento(m)}</td>
          <td><strong>${escaparHtml(m.patente)}</strong></td>
          <td>${escaparHtml(m.categoria || '-')}</td>
          <td>${m.cochera ? 'N°' + m.cochera : '-'}</td>
          <td>${escaparHtml(m.folio || '-')}</td>
          <td>${clienteMovimiento(m)}</td>
          <td>${m.minutos ?? '-'}</td>
          <td>${cobradoMovimiento(m)}</td>
          <td>${observacionesMovimiento(m)}</td>
        </tr>`).join('');
  } catch (e) {
    mensaje.className = 'mensaje error';
    mensaje.textContent = `No se pudieron cargar los movimientos: ${e.message}`;
  }
}

$('form-filtros').addEventListener('submit', (e) => {
  e.preventDefault();
  cargarMovimientos();
});

// Cobranza del día: fija ambas fechas en hoy
$('btn-hoy').addEventListener('click', () => {
  const hoy = new Date();
  const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  $('f-desde').value = iso;
  $('f-hasta').value = iso;
  cargarMovimientos();
});

cargarMovimientos();
setInterval(cargarMovimientos, 30000);
