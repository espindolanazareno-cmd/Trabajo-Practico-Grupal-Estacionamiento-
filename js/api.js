// Cliente de la API PHP (carpeta api/).
const Api = {
  async request(recurso, { params, body } = {}) {
    const url = new URL(`api/${recurso}.php`, window.location.href);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
      });
    }
    const resp = await fetch(url, body ? {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    } : undefined);

    let data;
    try {
      data = await resp.json();
    } catch (e) {
      throw new Error(`Respuesta inválida del servidor (HTTP ${resp.status})`);
    }
    if (!resp.ok || !data.ok) throw new Error(data.error || `Error HTTP ${resp.status}`);
    return data;
  }
};

// Utilidades de presentación compartidas por los módulos
function escaparHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function formatearMonto(valor) {
  if (valor === null || valor === undefined || valor === '') return '-';
  return '$' + Number(valor).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Las fechas llegan de MySQL como 'AAAA-MM-DD HH:MM:SS' en hora local
function formatearFechaHora(valor) {
  if (!valor) return '-';
  const d = new Date(valor.replace(' ', 'T'));
  return isNaN(d) ? valor : d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

const NOMBRES_MEDIOS_PAGO = {
  efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito',
  transferencia: 'Transferencia', mercadopago: 'Mercado Pago', otro: 'Otro'
};

// Filas del listado de movimientos: entradas, salidas y pagos de abonos mensuales
function etiquetaTipoMovimiento(m) {
  if (m.tipo === 'pago') return '<span class="estado neutro">Pago mensual</span>';
  return m.tipo === 'entrada'
    ? '<span class="estado ok">Entrada</span>'
    : '<span class="estado deuda">Salida</span>';
}

function clienteMovimiento(m) {
  return m.tipo_cliente === 'abonado'
    ? `Abonado${m.titular ? ' - ' + escaparHtml(m.titular) : ''}`
    : 'Por hora';
}

function cobradoMovimiento(m) {
  return m.tipo === 'entrada' ? '-' : formatearMonto(m.monto);
}

function observacionesMovimiento(m) {
  if (m.tipo !== 'pago') return escaparHtml(m.observaciones || '');
  return [`Abono ${m.periodo}`, NOMBRES_MEDIOS_PAGO[m.medio_pago] || m.medio_pago, m.observaciones]
    .filter(Boolean).map(escaparHtml).join(' · ');
}

// Devuelve las tarifas indexadas por categoría
async function cargarTarifas() {
  const { tarifas } = await Api.request('tarifas');
  return Object.fromEntries(tarifas.map(t => [t.categoria, t]));
}

function formatearDuracion(minutos) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

// Ej.: "2 h × $350,00 + 1 fracción de 15' × $87,50"
function describirCotizacion(c) {
  let texto = `${c.horas} h × ${formatearMonto(c.precio_hora)}`;
  if (c.fracciones > 0) {
    texto += ` + ${c.fracciones} ${c.fracciones === 1 ? 'fracción' : 'fracciones'} de 15' × ${formatearMonto(c.precio_fraccion)}`;
  }
  return texto;
}

function periodoActual() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
}
