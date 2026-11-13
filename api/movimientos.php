<?php
// API de movimientos: registra TODAS las entradas y salidas del estacionamiento.
//   GET  movimientos.php?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&patente=&tipo=entrada|salida|pago&tipo_cliente=&limite=
//   GET  movimientos.php?estacionados=1   (vehículos que están dentro de la playa)
//   GET  movimientos.php?cotizar=PATENTE|FOLIO   (importe a cobrar si sale ahora)
//   POST movimientos.php {tipo: entrada|salida, patente, categoria, cochera}
// El tipo de cliente (hora/abonado), el folio y el importe los determina el servidor.
require __DIR__ . '/db.php';

// Un vehículo está dentro si su última entrada no tiene una salida posterior.
const SQL_ESTACIONADOS = "SELECT e.*, a.titular
      FROM movimientos e
      LEFT JOIN abonados a ON a.id = e.abonado_id
     WHERE e.tipo = 'entrada'
       AND NOT EXISTS (SELECT 1 FROM movimientos p
                        WHERE p.patente = e.patente AND p.id > e.id)";

function entrada_abierta($patente)
{
    $st = db()->prepare(SQL_ESTACIONADOS . ' AND e.patente = ?');
    $st->execute([$patente]);
    return $st->fetch() ?: null;
}

function cotizar_salida(array $entrada)
{
    $minutos = (int) ceil((time() - strtotime($entrada['fecha_hora'])) / 60);
    $cotizacion = cotizar_estadia($entrada['categoria'], $minutos);
    if ($entrada['tipo_cliente'] === 'abonado') {
        $cotizacion['monto'] = 0;
    }
    return $cotizacion;
}

ejecutar_api(function () {
    if ($_SERVER['REQUEST_METHOD'] === 'GET' && !empty($_GET['estacionados'])) {
        $st = db()->query(SQL_ESTACIONADOS . ' ORDER BY e.id');
        responder(['estacionados' => $st->fetchAll()]);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'GET' && !empty($_GET['cotizar'])) {
        $busqueda = strtoupper(trim($_GET['cotizar']));
        $st = db()->prepare(SQL_ESTACIONADOS . ' AND (e.folio = ? OR e.patente = ?) ORDER BY e.id DESC LIMIT 1');
        $st->execute([$busqueda, normalizar_patente($busqueda)]);
        $entrada = $st->fetch();
        if (!$entrada) error_api('Vehículo no encontrado. Verifique la patente o el folio.', 404);
        responder([
            'estacionado' => $entrada,
            'cotizacion'  => cotizar_salida($entrada),
            'sin_cargo'   => $entrada['tipo_cliente'] === 'abonado',
        ]);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $limite = min(500, max(1, (int) ($_GET['limite'] ?? 500)));
        $where = ' WHERE 1 = 1';
        $params = [];
        if (!empty($_GET['desde'])) {
            $where .= ' AND m.fecha_hora >= ?';
            $params[] = $_GET['desde'] . ' 00:00:00';
        }
        if (!empty($_GET['hasta'])) {
            $where .= ' AND m.fecha_hora <= ?';
            $params[] = $_GET['hasta'] . ' 23:59:59';
        }
        if (!empty($_GET['patente'])) {
            $where .= ' AND m.patente LIKE ?';
            $params[] = '%' . normalizar_patente($_GET['patente']) . '%';
        }
        if (in_array($_GET['tipo'] ?? '', ['entrada', 'salida', 'pago'], true)) {
            $where .= ' AND m.tipo = ?';
            $params[] = $_GET['tipo'];
        }
        if (in_array($_GET['tipo_cliente'] ?? '', ['hora', 'abonado'], true)) {
            $where .= ' AND m.tipo_cliente = ?';
            $params[] = $_GET['tipo_cliente'];
        }

        // Los pagos de abonos mensuales se listan junto a las entradas y
        // salidas (tipo 'pago') para que sumen en la cobranza del período.
        $origen = "(SELECT mv.id, mv.patente, mv.tipo, mv.fecha_hora, mv.tipo_cliente, mv.abonado_id,
                           mv.categoria, mv.cochera, mv.folio, mv.minutos, mv.monto, mv.observaciones,
                           a.titular, NULL AS periodo, NULL AS medio_pago
                      FROM movimientos mv
                      LEFT JOIN abonados a ON a.id = mv.abonado_id
                    UNION ALL
                    SELECT p.id, a.patente, 'pago', p.fecha_pago, 'abonado', p.abonado_id,
                           a.categoria, NULL, p.comprobante, NULL, p.monto, p.observaciones,
                           a.titular, p.periodo, p.medio_pago
                      FROM pagos_abonados p
                      JOIN abonados a ON a.id = p.abonado_id) m";

        $st = db()->prepare("SELECT m.* FROM $origen $where
                              ORDER BY m.fecha_hora DESC, m.tipo = 'pago', m.id DESC LIMIT $limite");
        $st->execute($params);
        $movimientos = $st->fetchAll();

        $st = db()->prepare("SELECT
                SUM(m.tipo = 'entrada') AS entradas,
                SUM(m.tipo = 'salida') AS salidas,
                SUM(m.tipo_cliente = 'abonado' AND m.tipo = 'entrada') AS entradas_abonados,
                SUM(m.tipo = 'pago') AS pagos_mensuales,
                COALESCE(SUM(CASE WHEN m.tipo = 'salida' THEN m.monto END), 0) AS recaudado_estadias,
                COALESCE(SUM(CASE WHEN m.tipo = 'pago' THEN m.monto END), 0) AS recaudado_mensuales,
                COALESCE(SUM(CASE WHEN m.tipo IN ('salida', 'pago') THEN m.monto END), 0) AS recaudado
              FROM $origen $where");
        $st->execute($params);
        responder(['movimientos' => $movimientos, 'resumen' => $st->fetch()]);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') error_api('Método no permitido.', 405);

    $in = entrada();
    $tipo = $in['tipo'] ?? '';
    if (!in_array($tipo, ['entrada', 'salida'], true)) error_api('Tipo de movimiento inválido.');
    $patente = normalizar_patente($in['patente'] ?? '');
    if ($patente === '' || strlen($patente) > 10) error_api('Patente inválida.');
    $cochera = is_numeric($in['cochera'] ?? null) ? (int) $in['cochera'] : null;

    $abierta = entrada_abierta($patente);
    $cotizacion = null;
    if ($tipo === 'entrada') {
        $categoria = $in['categoria'] ?? '';
        if (!in_array($categoria, CATEGORIAS, true)) error_api('Categoría de vehículo inválida.');
        if ($abierta) error_api("La patente $patente ya se encuentra dentro del estacionamiento (cochera N°{$abierta['cochera']}).", 409);
        if ($cochera !== null) {
            foreach (db()->query(SQL_ESTACIONADOS)->fetchAll() as $v) {
                if ((int) $v['cochera'] === $cochera) error_api("La cochera N°$cochera está ocupada por {$v['patente']}.", 409);
            }
        }
        $folio = null;
    } else {
        if (!$abierta) error_api("La patente $patente no registra una entrada pendiente de salida.", 409);
        $folio = $abierta['folio'];
        $categoria = $abierta['categoria'];
        $cochera = $abierta['cochera'] !== null ? (int) $abierta['cochera'] : $cochera;
        $cotizacion = cotizar_salida($abierta);
    }

    $st = db()->prepare('SELECT * FROM v_abonados_estado WHERE patente = ?');
    $st->execute([$patente]);
    $abonado = $st->fetch() ?: null;

    $tipoCliente = ($abonado && (int) $abonado['al_dia'] === 1) ? 'abonado' : 'hora';
    $abonadoId = $abonado ? $abonado['id'] : null;
    $observaciones = texto($in['observaciones'] ?? '');
    if ($abonado && $tipoCliente === 'hora' && !$observaciones) {
        $observaciones = $abonado['estado'] === 'activo' ? 'Abono mensual impago: se cobra por hora' : 'Abonado ' . $abonado['estado'];
    }

    // La salida respeta la condición con la que el vehículo entró.
    if ($tipo === 'salida') {
        $tipoCliente = $abierta['tipo_cliente'];
        $abonadoId = $abierta['abonado_id'] ?: $abonadoId;
    }

    $st = db()->prepare('INSERT INTO movimientos
        (patente, tipo, fecha_hora, tipo_cliente, abonado_id, categoria, cochera, folio, minutos, monto, observaciones)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $st->execute([
        $patente,
        $tipo,
        date('Y-m-d H:i:s'),
        $tipoCliente,
        $abonadoId,
        $categoria,
        $cochera,
        $folio,
        $cotizacion ? $cotizacion['minutos'] : null,
        $cotizacion ? $cotizacion['monto'] : null,
        $observaciones,
    ]);
    $id = db()->lastInsertId();
    if ($tipo === 'entrada') {
        db()->prepare('UPDATE movimientos SET folio = ? WHERE id = ?')
            ->execute([sprintf('FOL-%06d', $id), $id]);
    }

    $st = db()->prepare('SELECT * FROM movimientos WHERE id = ?');
    $st->execute([$id]);
    responder([
        'movimiento' => $st->fetch(),
        'cotizacion' => $cotizacion,
        'abonado'    => $abonado,
        'sin_cargo'  => $tipoCliente === 'abonado',
    ], 201);
});
