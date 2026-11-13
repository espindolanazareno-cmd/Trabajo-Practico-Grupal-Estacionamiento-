<?php
// API de pagos mensuales de abonados.
//   GET  pagos.php?abonado_id=N | ?periodo=AAAA-MM   -> listado
//   POST pagos.php {accion: crear, abonado_id, periodo, monto, medio_pago, ...}
//   POST pagos.php {accion: anular, id}               -> elimina un pago cargado por error
require __DIR__ . '/db.php';

ejecutar_api(function () {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $sql = 'SELECT p.*, a.patente, a.titular
                  FROM pagos_abonados p
                  JOIN abonados a ON a.id = p.abonado_id
                 WHERE 1 = 1';
        $params = [];
        if (!empty($_GET['abonado_id'])) {
            $sql .= ' AND p.abonado_id = ?';
            $params[] = (int) $_GET['abonado_id'];
        }
        if (!empty($_GET['periodo'])) {
            $sql .= ' AND p.periodo = ?';
            $params[] = $_GET['periodo'];
        }
        $sql .= ' ORDER BY p.fecha_pago DESC, p.id DESC LIMIT 500';
        $st = db()->prepare($sql);
        $st->execute($params);
        responder(['pagos' => $st->fetchAll()]);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') error_api('Método no permitido.', 405);

    $in = entrada();
    $accion = $in['accion'] ?? 'crear';

    if ($accion === 'anular') {
        $st = db()->prepare('DELETE FROM pagos_abonados WHERE id = ?');
        $st->execute([(int) ($in['id'] ?? 0)]);
        if ($st->rowCount() === 0) error_api('Pago no encontrado.', 404);
        responder(['eliminado' => (int) $in['id']]);
    }

    if ($accion !== 'crear') error_api('Acción desconocida.');

    $st = db()->prepare('SELECT * FROM abonados WHERE id = ?');
    $st->execute([(int) ($in['abonado_id'] ?? 0)]);
    $abonado = $st->fetch();
    if (!$abonado) error_api('Abonado no encontrado.', 404);
    if ($abonado['estado'] === 'baja') error_api('El abonado está dado de baja; reactívelo antes de registrar pagos.');

    $periodo = !empty($in['periodo']) ? $in['periodo'] : date('Y-m');
    if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $periodo)) error_api('Período inválido (formato AAAA-MM).');

    $monto = isset($in['monto']) && $in['monto'] !== '' ? $in['monto'] : $abonado['monto_mensual'];
    if (!is_numeric($monto) || $monto <= 0) error_api('El monto debe ser mayor a cero.');

    $medio = $in['medio_pago'] ?? 'efectivo';
    if (!in_array($medio, MEDIOS_PAGO, true)) error_api('Medio de pago inválido.');

    $fecha = !empty($in['fecha_pago']) ? date('Y-m-d H:i:s', strtotime($in['fecha_pago'])) : date('Y-m-d H:i:s');

    $st = db()->prepare('INSERT INTO pagos_abonados
        (abonado_id, periodo, monto, fecha_pago, medio_pago, comprobante, observaciones)
        VALUES (?, ?, ?, ?, ?, ?, ?)');
    try {
        $st->execute([$abonado['id'], $periodo, $monto, $fecha, $medio,
            texto($in['comprobante'] ?? '', 40), texto($in['observaciones'] ?? '')]);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') error_api("El período $periodo ya está pagado para la patente {$abonado['patente']}.", 409);
        throw $e;
    }

    $st = db()->prepare('SELECT * FROM pagos_abonados WHERE id = ?');
    $st->execute([db()->lastInsertId()]);
    responder(['pago' => $st->fetch()], 201);
});
