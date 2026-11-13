// Simulador completo de Backend + Base de Datos en localStorage para GitHub Pages
const DB_KEY = 'estacionamiento_db_v1';

function obtenerDB() {
  const raw = localStorage.getItem(DB_KEY);
  if (raw) return JSON.parse(raw);

  // Datos iniciales por defecto
  const inicial = {
    tarifas: [
      { categoria: 'Moto', descripcion: 'Moto', precio_hora: 100, precio_fraccion: 25, precio_mensual: 15000 },
      { categoria: 'Auto', descripcion: 'Auto', precio_hora: 350, precio_fraccion: 87.5, precio_mensual: 45000 },
      { categoria: 'Camioneta', descripcion: 'Camioneta / SUV', precio_hora: 500, precio_fraccion: 125, precio_mensual: 60000 },
      { categoria: 'Bus', descripcion: 'Bus', precio_hora: 600, precio_fraccion: 150, precio_mensual: 75000 }
    ],
    abonados: [],
    pagos: [],
    movimientos: [],
    nextId: { abonados: 1, pagos: 1, movimientos: 1 }
  };
  guardarDB(inicial);
  return inicial;
}

function guardarDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function ahoraMySQL() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function calcularCotizacion(tarifa, minutosTotales, esAbonadoAlDia = false) {
  const minutos = Math.max(1, Math.ceil(minutosTotales));
  if (esAbonadoAlDia) {
    return { minutos, horas: 0, fracciones: 0, precio_hora: Number(tarifa.precio_hora), precio_fraccion: Number(tarifa.precio_fraccion), monto: 0 };
  }

  const precioHora = Number(tarifa.precio_hora);
  const precioFraccion = Number(tarifa.precio_fraccion);

  if (minutos <= 60) {
    return { minutos, horas: 1, fracciones: 0, precio_hora: precioHora, precio_fraccion: precioFraccion, monto: precioHora };
  }

  const horasCompletas = Math.floor(minutos / 60);
  const restoMinutos = minutos % 60;
  let fracciones = Math.ceil(restoMinutos / 15);
  let extra = fracciones * precioFraccion;

  // Las fracciones de una misma hora nunca superan el precio de la hora
  if (extra >= precioHora) {
    return {
      minutos,
      horas: horasCompletas + 1,
      fracciones: 0,
      precio_hora: precioHora,
      precio_fraccion: precioFraccion,
      monto: (horasCompletas + 1) * precioHora
    };
  }

  return {
    minutos,
    horas: horasCompletas,
    fracciones,
    precio_hora: precioHora,
    precio_fraccion: precioFraccion,
    monto: (horasCompletas * precioHora) + extra
  };
}

function abonadoEstaAlDia(db, abonado) {
  if (!abonado || abonado.estado !== 'activo') return false;
  const actual = periodoActual();
  return db.pagos.some(p => p.abonado_id === abonado.id && p.periodo >= actual);
}

function enriquecerAbonado(db, a) {
  const pagos = db.pagos
    .filter(p => p.abonado_id === a.id)
    .sort((x, y) => y.periodo.localeCompare(x.periodo));
  const ultimoPeriodo = pagos.length > 0 ? pagos[0].periodo : null;
  const alDia = abonadoEstaAlDia(db, a) ? 1 : 0;
  return { ...a, al_dia: alDia, ultimo_periodo_pagado: ultimoPeriodo };
}

const Api = {
  async request(recurso, { params = {}, body } = {}) {
    const db = obtenerDB();

    // ==================== TARIFAS ====================
    if (recurso === 'tarifas') {
      if (body && body.tarifas) {
        body.tarifas.forEach(item => {
          const t = db.tarifas.find(x => x.categoria === item.categoria);
          if (t) {
            t.precio_hora = Number(item.precio_hora);
            t.precio_fraccion = Number(item.precio_fraccion);
            t.precio_mensual = Number(item.precio_mensual);
          }
        });
        guardarDB(db);
        return { ok: true, tarifas: db.tarifas };
      }
      if (params.categoria && params.minutos) {
        const t = db.tarifas.find(x => x.categoria === params.categoria);
        if (!t) throw new Error('Categoría no encontrada');
        return { ok: true, cotizacion: calcularCotizacion(t, Number(params.minutos), false) };
      }
      return { ok: true, tarifas: db.tarifas };
    }

    // ==================== ABONADOS ====================
    if (recurso === 'abonados') {
      if (body) {
        if (body.accion === 'crear') {
          if (db.abonados.some(x => x.patente === body.patente && x.estado !== 'baja')) {
            throw new Error('Ya existe un abonado activo con esa patente.');
          }
          const nuevo = {
            id: db.nextId.abonados++,
            patente: body.patente,
            categoria: body.categoria,
            titular: body.titular,
            documento: body.documento || '',
            telefono: body.telefono || '',
            email: body.email || '',
            monto_mensual: Number(body.monto_mensual),
            dia_vencimiento: Number(body.dia_vencimiento) || 10,
            estado: body.estado || 'activo',
            observaciones: body.observaciones || ''
          };
          db.abonados.push(nuevo);
          guardarDB(db);
          return { ok: true, abonado: enriquecerAbonado(db, nuevo) };
        }

        if (body.accion === 'actualizar') {
          const idx = db.abonados.findIndex(x => x.id === Number(body.id));
          if (idx === -1) throw new Error('Abonado no encontrado');
          db.abonados[idx] = {
            ...db.abonados[idx],
            patente: body.patente,
            categoria: body.categoria,
            titular: body.titular,
            documento: body.documento || '',
            telefono: body.telefono || '',
            email: body.email || '',
            monto_mensual: Number(body.monto_mensual),
            dia_vencimiento: Number(body.dia_vencimiento) || 10,
            estado: body.estado || 'activo',
            observaciones: body.observaciones || ''
          };
          guardarDB(db);
          return { ok: true, abonado: enriquecerAbonado(db, db.abonados[idx]) };
        }

        if (body.accion === 'baja' || body.accion === 'reactivar') {
          const a = db.abonados.find(x => x.id === Number(body.id));
          if (!a) throw new Error('Abonado no encontrado');
          a.estado = body.accion === 'baja' ? 'baja' : 'activo';
          guardarDB(db);
          return { ok: true };
        }
      }

      if (params.id) {
        const a = db.abonados.find(x => x.id === Number(params.id));
        if (!a) throw new Error('Abonado no encontrado');
        const enriquecido = enriquecerAbonado(db, a);
        enriquecido.pagos = db.pagos
          .filter(p => p.abonado_id === a.id)
          .sort((x, y) => y.periodo.localeCompare(x.periodo));
        enriquecido.movimientos = db.movimientos
          .filter(m => m.patente === a.patente)
          .sort((x, y) => y.id - x.id);
        return { ok: true, abonado: enriquecido };
      }

      let lista = db.abonados.map(a => enriquecerAbonado(db, a));
      if (params.estado) {
        lista = lista.filter(a => a.estado === params.estado);
      }
      if (params.q) {
        const q = params.q.toUpperCase();
        lista = lista.filter(a =>
          a.patente.includes(q) ||
          a.titular.toUpperCase().includes(q) ||
          (a.documento && a.documento.toUpperCase().includes(q))
        );
      }
      return { ok: true, abonados: lista };
    }

    // ==================== PAGOS DE ABONADOS ====================
    if (recurso === 'pagos') {
      if (body && body.accion === 'crear') {
        const a = db.abonados.find(x => x.id === Number(body.abonado_id));
        if (!a) throw new Error('Abonado no encontrado');
        if (db.pagos.some(p => p.abonado_id === a.id && p.periodo === body.periodo)) {
          throw new Error(`El período ${body.periodo} ya está pagado.`);
        }
        const pago = {
          id: db.nextId.pagos++,
          abonado_id: a.id,
          periodo: body.periodo,
          monto: Number(body.monto),
          fecha_pago: ahoraMySQL(),
          medio_pago: body.medio_pago,
          comprobante: body.comprobante || ''
        };
        db.pagos.push(pago);

        // Registrar también en movimientos generales
        db.movimientos.push({
          id: db.nextId.movimientos++,
          fecha_hora: pago.fecha_pago,
          tipo: 'pago',
          patente: a.patente,
          categoria: a.categoria,
          cochera: null,
          folio: pago.comprobante || `ABN-${pago.id}`,
          tipo_cliente: 'abonado',
          titular: a.titular,
          minutos: null,
          monto: pago.monto,
          periodo: pago.periodo,
          medio_pago: pago.medio_pago,
          observaciones: pago.comprobante
        });

        guardarDB(db);
        return { ok: true, pago };
      }

      if (body && body.accion === 'anular') {
        const idx = db.pagos.findIndex(p => p.id === Number(body.id));
        if (idx === -1) throw new Error('Pago no encontrado');
        const pagoAnulado = db.pagos[idx];
        db.pagos.splice(idx, 1);
        db.movimientos = db.movimientos.filter(m => !(m.tipo === 'pago' && m.periodo === pagoAnulado.periodo && m.folio === (pagoAnulado.comprobante || `ABN-${pagoAnulado.id}`)));
        guardarDB(db);
        return { ok: true };
      }
    }

    // ==================== MOVIMIENTOS (PLAYA Y LISTADO) ====================
    if (recurso === 'movimientos') {
      // Obtener vehículos actualmente estacionados
      const entradas = db.movimientos.filter(m => m.tipo === 'entrada');
      const salidasFolios = new Set(db.movimientos.filter(m => m.tipo === 'salida').map(m => m.folio));
      const estacionados = entradas.filter(e => !salidasFolios.has(e.folio));

      if (params.estacionados) {
        return { ok: true, estacionados };
      }

      if (params.cotizar) {
        const q = params.cotizar.toUpperCase();
        const est = estacionados.find(e => e.folio === q || e.patente === q);
        if (!est) throw new Error('Vehículo no encontrado en la playa.');

        const tarifa = db.tarifas.find(t => t.categoria === est.categoria) || db.tarifas[1];
        const abonado = db.abonados.find(a => a.patente === est.patente && a.estado === 'activo');
        const sinCargo = abonadoEstaAlDia(db, abonado);
        const min = (new Date() - new Date(est.fecha_hora.replace(' ', 'T'))) / 60000;
        const cotizacion = calcularCotizacion(tarifa, min, sinCargo);

        return { ok: true, estacionado: est, cotizacion, sin_cargo: sinCargo };
      }

      if (body && body.tipo === 'entrada') {
        if (estacionados.some(e => e.patente === body.patente)) {
          throw new Error('Ese vehículo ya se encuentra en la playa.');
        }
        const abonado = db.abonados.find(a => a.patente === body.patente && a.estado === 'activo');
        const sinCargo = abonadoEstaAlDia(db, abonado);
        const folio = 'FOL-' + Math.floor(100000 + Math.random() * 900000);

        const mov = {
          id: db.nextId.movimientos++,
          fecha_hora: ahoraMySQL(),
          tipo: 'entrada',
          patente: body.patente,
          categoria: body.categoria,
          cochera: body.cochera,
          folio,
          tipo_cliente: abonado ? 'abonado' : 'por_hora',
          titular: abonado ? abonado.titular : null,
          minutos: null,
          monto: 0,
          observaciones: sinCargo ? 'Abonado al día' : ''
        };
        db.movimientos.push(mov);
        guardarDB(db);
        return { ok: true, movimiento: mov, sin_cargo: sinCargo, abonado };
      }

      if (body && body.tipo === 'salida') {
        const est = estacionados.find(e => e.patente === body.patente);
        if (!est) throw new Error('No se encontró el ingreso activo de esa patente.');

        const tarifa = db.tarifas.find(t => t.categoria === est.categoria) || db.tarifas[1];
        const abonado = db.abonados.find(a => a.patente === est.patente && a.estado === 'activo');
        const sinCargo = abonadoEstaAlDia(db, abonado);
        const min = (new Date() - new Date(est.fecha_hora.replace(' ', 'T'))) / 60000;
        const cotizacion = calcularCotizacion(tarifa, min, sinCargo);

        const mov = {
          id: db.nextId.movimientos++,
          fecha_hora: ahoraMySQL(),
          tipo: 'salida',
          patente: est.patente,
          categoria: est.categoria,
          cochera: est.cochera,
          folio: est.folio,
          tipo_cliente: est.tipo_cliente,
          titular: est.titular,
          minutos: cotizacion.minutos,
          monto: cotizacion.monto,
          observaciones: sinCargo ? 'Abonado al día (sin cargo)' : ''
        };
        db.movimientos.push(mov);
        guardarDB(db);
        return { ok: true, movimiento: mov };
      }

      // Listado filtrado de movimientos
      let lista = [...db.movimientos].sort((a, b) => b.id - a.id);

      if (params.desde) {
        lista = lista.filter(m => m.fecha_hora.slice(0, 10) >= params.desde);
      }
      if (params.hasta) {
        lista = lista.filter(m => m.fecha_hora.slice(0, 10) <= params.hasta);
      }
      if (params.patente) {
        const p = params.patente.toUpperCase();
        lista = lista.filter(m => m.patente.includes(p));
      }
      if (params.tipo) {
        lista = lista.filter(m => m.tipo === params.tipo);
      }
      if (params.tipo_cliente) {
        lista = lista.filter(m => m.tipo_cliente === params.tipo_cliente);
      }

      const resumen = {
        entradas: lista.filter(m => m.tipo === 'entrada').length,
        salidas: lista.filter(m => m.tipo === 'salida').length,
        entradas_abonados: lista.filter(m => m.tipo === 'entrada' && m.tipo_cliente === 'abonado').length,
        recaudado_estadias: lista.filter(m => m.tipo === 'salida').reduce((acc, m) => acc + Number(m.monto || 0), 0),
        recaudado_mensuales: lista.filter(m => m.tipo === 'pago').reduce((acc, m) => acc + Number(m.monto || 0), 0),
        recaudado: lista.filter(m => m.tipo === 'salida' || m.tipo === 'pago').reduce((acc, m) => acc + Number(m.monto || 0), 0)
      };

      if (params.limite) {
        lista = lista.slice(0, Number(params.limite));
      }

      return { ok: true, movimientos: lista, resumen };
    }

    throw new Error(`Recurso desconocido: ${recurso}`);
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

function formatearFechaHora(valor) {
  if (!valor) return '-';
  const d = new Date(valor.replace(' ', 'T'));
  return isNaN(d) ? valor : d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

const NOMBRES_MEDIOS_PAGO = {
  efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito',
  transferencia: 'Transferencia', mercadopago: 'Mercado Pago', otro: 'Otro'
};

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

async function cargarTarifas() {
  const { tarifas } = await Api.request('tarifas');
  return Object.fromEntries(tarifas.map(t => [t.categoria, t]));
}

function formatearDuracion(minutos) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

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
