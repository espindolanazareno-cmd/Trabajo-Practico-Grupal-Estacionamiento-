// Montos sugeridos al dar de alta según la lista de precios (se pueden modificar por abonado)
let planesMensuales = {};

let abonados = [];
let abonadoSeleccionado = null;

const $ = id => document.getElementById(id);

function mostrarMensaje(texto, tipo = 'exito') {
  const el = $('mensaje');
  el.className = `mensaje ${tipo}`;
  el.textContent = texto;
  clearTimeout(mostrarMensaje.timer);
  mostrarMensaje.timer = setTimeout(() => { el.textContent = ''; }, 6000);
}

function etiquetaEstado(a) {
  if (a.estado === 'baja') return '<span class="estado neutro">Baja</span>';
  if (a.estado === 'suspendido') return '<span class="estado neutro">Suspendido</span>';
  return Number(a.al_dia) === 1
    ? '<span class="estado ok">Al día</span>'
    : '<span class="estado deuda">Adeuda</span>';
}

// ---------- Listado ----------
async function cargarAbonados() {
  try {
    const data = await Api.request('abonados', {
      params: { estado: $('filtro-estado').value, q: $('filtro-q').value.trim() }
    });
    abonados = data.abonados;
    renderizarAbonados();
  } catch (e) {
    mostrarMensaje(`No se pudo cargar el listado: ${e.message}`, 'error');
  }
}

function renderizarAbonados() {
  const filtroDeuda = $('filtro-deuda').value;
  const lista = filtroDeuda === '' ? abonados
    : abonados.filter(a => String(Number(a.al_dia)) === filtroDeuda && a.estado === 'activo');

  const activos = abonados.filter(a => a.estado === 'activo');
  $('total-activos').textContent = activos.length;
  $('total-al-dia').textContent = activos.filter(a => Number(a.al_dia) === 1).length;

  const tbody = $('tabla-abonados').querySelector('tbody');
  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="vacio">No hay abonados para mostrar.</td></tr>';
    return;
  }

  tbody.innerHTML = lista.map(a => `
    <tr class="${abonadoSeleccionado && abonadoSeleccionado.id === a.id ? 'seleccionado' : ''}">
      <td><strong>${escaparHtml(a.patente)}</strong></td>
      <td>${escaparHtml(a.titular)}${a.documento ? `<br><small>${escaparHtml(a.documento)}</small>` : ''}</td>
      <td>${escaparHtml(a.telefono || '')}${a.email ? `<br><small>${escaparHtml(a.email)}</small>` : ''}</td>
      <td>${escaparHtml(a.categoria)}</td>
      <td>${formatearMonto(a.monto_mensual)}</td>
      <td>Día ${a.dia_vencimiento}</td>
      <td>${a.ultimo_periodo_pagado || 'Sin pagos'}</td>
      <td>${etiquetaEstado(a)}</td>
      <td class="acciones">
        <button class="chico" onclick="seleccionarAbonado(${a.id})">Pagos</button>
        ${a.estado === 'baja'
          ? `<button class="chico secundario" onclick="cambiarEstado(${a.id}, 'reactivar')">Reactivar</button>`
          : `<button class="chico secundario" onclick="editarAbonado(${a.id})">Editar</button>
             <button class="chico peligro" onclick="cambiarEstado(${a.id}, 'baja')">Baja</button>`}
      </td>
    </tr>
  `).join('');
}

// ---------- Alta / edición ----------
function limpiarFormulario() {
  $('form-abonado').reset();
  $('abonado-id').value = '';
  $('ab-monto').value = planesMensuales[$('ab-categoria').value] || '';
  $('titulo-form').textContent = 'Alta de Abonado';
  $('btn-guardar').textContent = 'Dar de Alta';
  $('btn-cancelar').hidden = true;
}

function editarAbonado(id) {
  const a = abonados.find(x => x.id === id);
  if (!a) return;
  $('abonado-id').value = a.id;
  $('ab-patente').value = a.patente;
  $('ab-categoria').value = a.categoria;
  $('ab-titular').value = a.titular;
  $('ab-documento').value = a.documento || '';
  $('ab-telefono').value = a.telefono || '';
  $('ab-email').value = a.email || '';
  $('ab-monto').value = a.monto_mensual;
  $('ab-vencimiento').value = a.dia_vencimiento;
  $('ab-estado').value = a.estado === 'suspendido' ? 'suspendido' : 'activo';
  $('ab-observaciones').value = a.observaciones || '';
  $('titulo-form').textContent = `Editar Abonado ${a.patente}`;
  $('btn-guardar').textContent = 'Guardar Cambios';
  $('btn-cancelar').hidden = false;
  $('ab-titular').focus();
}

$('ab-categoria').addEventListener('change', () => {
  if (!$('abonado-id').value) $('ab-monto').value = planesMensuales[$('ab-categoria').value] || '';
});

$('btn-cancelar').addEventListener('click', limpiarFormulario);

$('form-abonado').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('abonado-id').value;
  const datos = {
    accion: id ? 'actualizar' : 'crear',
    id: id ? Number(id) : undefined,
    patente: $('ab-patente').value.trim().toUpperCase(),
    categoria: $('ab-categoria').value,
    titular: $('ab-titular').value.trim(),
    documento: $('ab-documento').value.trim(),
    telefono: $('ab-telefono').value.trim(),
    email: $('ab-email').value.trim(),
    monto_mensual: $('ab-monto').value,
    dia_vencimiento: $('ab-vencimiento').value,
    estado: $('ab-estado').value,
    observaciones: $('ab-observaciones').value.trim()
  };

  try {
    const data = await Api.request('abonados', { body: datos });
    mostrarMensaje(id ? `Abonado ${data.abonado.patente} actualizado.` : `Abonado ${data.abonado.patente} dado de alta.`);
    limpiarFormulario();
    await cargarAbonados();
    if (!id) seleccionarAbonado(data.abonado.id);
  } catch (err) {
    mostrarMensaje(err.message, 'error');
  }
});

async function cambiarEstado(id, accion) {
  const a = abonados.find(x => x.id === id);
  const pregunta = accion === 'baja'
    ? `¿Dar de baja al abonado ${a.patente} (${a.titular})? Se conserva su historial.`
    : `¿Reactivar al abonado ${a.patente}?`;
  if (!confirm(pregunta)) return;

  try {
    await Api.request('abonados', { body: { accion, id } });
    mostrarMensaje(accion === 'baja' ? `Abonado ${a.patente} dado de baja.` : `Abonado ${a.patente} reactivado.`);
    if (abonadoSeleccionado && abonadoSeleccionado.id === id) seleccionarAbonado(id);
    cargarAbonados();
  } catch (err) {
    mostrarMensaje(err.message, 'error');
  }
}

// ---------- Pagos y movimientos del abonado ----------
async function seleccionarAbonado(id) {
  try {
    const { abonado } = await Api.request('abonados', { params: { id } });
    abonadoSeleccionado = abonado;
  } catch (err) {
    mostrarMensaje(err.message, 'error');
    return;
  }

  const a = abonadoSeleccionado;
  $('pago-abonado-sel').innerHTML = `
    <strong>${escaparHtml(a.patente)}</strong> - ${escaparHtml(a.titular)} ${etiquetaEstado(a)}<br>
    <small>Mensual: ${formatearMonto(a.monto_mensual)} · Vence el día ${a.dia_vencimiento} ·
    Último período pagado: ${a.ultimo_periodo_pagado || 'ninguno'}</small>`;

  const pagados = a.pagos.map(p => p.periodo);
  let periodo = periodoActual();
  if (pagados.includes(periodo)) {
    const [anio, mes] = periodo.split('-').map(Number);
    const siguiente = new Date(anio, mes, 1);
    periodo = `${siguiente.getFullYear()}-${String(siguiente.getMonth() + 1).padStart(2, '0')}`;
  }
  $('form-pago').hidden = a.estado === 'baja';
  $('pago-periodo').value = periodo;
  $('pago-monto').value = a.monto_mensual;
  $('pago-comprobante').value = '';

  const tablaPagos = $('tabla-pagos');
  tablaPagos.hidden = false;
  tablaPagos.querySelector('tbody').innerHTML = a.pagos.length === 0
    ? '<tr><td colspan="6" class="vacio">Sin pagos registrados.</td></tr>'
    : a.pagos.map(p => `
      <tr>
        <td>${p.periodo}</td>
        <td>${formatearMonto(p.monto)}</td>
        <td>${formatearFechaHora(p.fecha_pago)}</td>
        <td>${NOMBRES_MEDIOS_PAGO[p.medio_pago] || p.medio_pago}</td>
        <td>${escaparHtml(p.comprobante || '')}</td>
        <td><button class="chico peligro" onclick="anularPago(${p.id}, '${p.periodo}')">Anular</button></td>
      </tr>`).join('');

  $('seccion-mov-abonado').hidden = false;
  $('tabla-mov-abonado').querySelector('tbody').innerHTML = a.movimientos.length === 0
    ? '<tr><td colspan="6" class="vacio">Sin movimientos registrados.</td></tr>'
    : a.movimientos.map(m => `
      <tr>
        <td>${formatearFechaHora(m.fecha_hora)}</td>
        <td>${m.tipo === 'entrada' ? 'Entrada' : 'Salida'}</td>
        <td>${m.cochera ? 'N°' + m.cochera : '-'}</td>
        <td>${escaparHtml(m.folio || '-')}</td>
        <td>${m.tipo_cliente === 'abonado' ? 'Abonado' : 'Por hora'}</td>
        <td>${formatearMonto(m.monto)}</td>
      </tr>`).join('');

  renderizarAbonados();
}

$('form-pago').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!abonadoSeleccionado) return;
  try {
    const { pago } = await Api.request('pagos', {
      body: {
        accion: 'crear',
        abonado_id: abonadoSeleccionado.id,
        periodo: $('pago-periodo').value,
        monto: $('pago-monto').value,
        medio_pago: $('pago-medio').value,
        comprobante: $('pago-comprobante').value.trim()
      }
    });
    mostrarMensaje(`Pago del período ${pago.periodo} registrado para ${abonadoSeleccionado.patente}.`);
    await seleccionarAbonado(abonadoSeleccionado.id);
    cargarAbonados();
  } catch (err) {
    mostrarMensaje(err.message, 'error');
  }
});

async function anularPago(id, periodo) {
  if (!confirm(`¿Anular el pago del período ${periodo}?`)) return;
  try {
    await Api.request('pagos', { body: { accion: 'anular', id } });
    mostrarMensaje(`Pago del período ${periodo} anulado.`);
    await seleccionarAbonado(abonadoSeleccionado.id);
    cargarAbonados();
  } catch (err) {
    mostrarMensaje(err.message, 'error');
  }
}

// ---------- Filtros ----------
let demoraBusqueda;
$('filtro-q').addEventListener('input', () => {
  clearTimeout(demoraBusqueda);
  demoraBusqueda = setTimeout(cargarAbonados, 300);
});
$('filtro-estado').addEventListener('change', cargarAbonados);
$('filtro-deuda').addEventListener('change', renderizarAbonados);

limpiarFormulario();
cargarAbonados();
cargarTarifas().then(tarifas => {
  planesMensuales = Object.fromEntries(Object.values(tarifas).map(t => [t.categoria, t.precio_mensual]));
  if (!$('abonado-id').value) $('ab-monto').value = planesMensuales[$('ab-categoria').value] || '';
}).catch(e => mostrarMensaje(`No se pudieron cargar las tarifas: ${e.message}`, 'error'));
