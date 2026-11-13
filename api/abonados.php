<?php
// API de abonados mensuales.
//   GET  abonados.php                      -> listado (filtros: estado, q)
//   GET  abonados.php?id=N                 -> detalle con pagos y movimientos
//   GET  abonados.php?patente=AA123CD      -> busca un abonado por patente
//   POST abonados.php {accion: crear|actualizar|baja|reactivar, ...}
require __DIR__ . '/db.php';

function buscar_abonado($id)
{
    $st = db()->prepare('SELECT * FROM v_abonados_estado WHERE id = ?');
    $st->execute([$id]);
    return $st->fetch() ?: null;
}

function datos_abonado(array $in)
{
    $datos = [
        'patente'         => normalizar_patente($in['patente'] ?? ''),
        'titular'         => texto($in['titular'] ?? '', 120),
        'documento'       => texto($in['documento'] ?? '', 20),
        'telefono'        => texto($in['telefono'] ?? '', 30),
        'email'           => texto($in['email'] ?? '', 120),
        'categoria'       => $in['categoria'] ?? 'Auto',
        'monto_mensual'   => $in['monto_mensual'] ?? null,
        'dia_vencimiento' => (int) ($in['dia_vencimiento'] ?? 10),
        'observaciones'   => texto($in['observaciones'] ?? ''),
    ];
    if ($datos['patente'] === '' || strlen($datos['patente']) > 10) error_api('Patente inválida.');
    if (!$datos['titular']) error_api('El titular es obligatorio.');
    if (!in_array($datos['categoria'], CATEGORIAS, true)) error_api('Categoría inválida.');
    if (!is_numeric($datos['monto_mensual']) || $datos['monto_mensual'] <= 0) error_api('El monto mensual debe ser mayor a cero.');
    if ($datos['dia_vencimiento'] < 1 || $datos['dia_vencimiento'] > 28) error_api('El día de vencimiento debe estar entre 1 y 28.');
    if ($datos['email'] && !filter_var($datos['email'], FILTER_VALIDATE_EMAIL)) error_api('Email inválido.');
    return $datos;
}

ejecutar_api(function () {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        if (isset($_GET['id'])) {
            $abonado = buscar_abonado((int) $_GET['id']);
            if (!$abonado) error_api('Abonado no encontrado.', 404);
            $st = db()->prepare('SELECT * FROM pagos_abonados WHERE abonado_id = ? ORDER BY periodo DESC');
            $st->execute([$abonado['id']]);
            $abonado['pagos'] = $st->fetchAll();
            $st = db()->prepare('SELECT * FROM movimientos WHERE abonado_id = ? ORDER BY fecha_hora DESC, id DESC LIMIT 50');
            $st->execute([$abonado['id']]);
            $abonado['movimientos'] = $st->fetchAll();
            responder(['abonado' => $abonado]);
        }

        if (isset($_GET['patente'])) {
            $st = db()->prepare('SELECT * FROM v_abonados_estado WHERE patente = ?');
            $st->execute([normalizar_patente($_GET['patente'])]);
            responder(['abonado' => $st->fetch() ?: null]);
        }

        $sql = 'SELECT * FROM v_abonados_estado WHERE 1 = 1';
        $params = [];
        $estado = $_GET['estado'] ?? 'vigentes';
        if ($estado === 'vigentes') {
            $sql .= " AND estado <> 'baja'";
        } elseif (in_array($estado, ['activo', 'suspendido', 'baja'], true)) {
            $sql .= ' AND estado = ?';
            $params[] = $estado;
        }
        if (!empty($_GET['q'])) {
            $sql .= ' AND (patente LIKE ? OR titular LIKE ? OR documento LIKE ?)';
            $q = '%' . trim($_GET['q']) . '%';
            array_push($params, $q, $q, $q);
        }
        $sql .= ' ORDER BY titular, patente';
        $st = db()->prepare($sql);
        $st->execute($params);
        responder(['abonados' => $st->fetchAll()]);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') error_api('Método no permitido.', 405);

    $in = entrada();
    $accion = $in['accion'] ?? 'crear';

    if ($accion === 'crear') {
        $d = datos_abonado($in);
        $d['fecha_alta'] = !empty($in['fecha_alta']) ? $in['fecha_alta'] : date('Y-m-d');
        $st = db()->prepare('INSERT INTO abonados
            (patente, titular, documento, telefono, email, categoria, monto_mensual, dia_vencimiento, observaciones, fecha_alta)
            VALUES (:patente, :titular, :documento, :telefono, :email, :categoria, :monto_mensual, :dia_vencimiento, :observaciones, :fecha_alta)');
        try {
            $st->execute($d);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') error_api('Ya existe un abonado con la patente ' . $d['patente'] . ' (si está dado de baja, reactívelo).', 409);
            throw $e;
        }
        responder(['abonado' => buscar_abonado((int) db()->lastInsertId())], 201);
    }

    $id = (int) ($in['id'] ?? 0);
    $actual = buscar_abonado($id);
    if (!$actual) error_api('Abonado no encontrado.', 404);

    if ($accion === 'actualizar') {
        $d = datos_abonado($in);
        $d['estado'] = in_array($in['estado'] ?? '', ['activo', 'suspendido'], true) ? $in['estado'] : $actual['estado'];
        $d['id'] = $id;
        $st = db()->prepare('UPDATE abonados SET
            patente = :patente, titular = :titular, documento = :documento, telefono = :telefono,
            email = :email, categoria = :categoria, monto_mensual = :monto_mensual,
            dia_vencimiento = :dia_vencimiento, observaciones = :observaciones, estado = :estado
            WHERE id = :id');
        try {
            $st->execute($d);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') error_api('La patente ' . $d['patente'] . ' ya pertenece a otro abonado.', 409);
            throw $e;
        }
    } elseif ($accion === 'baja') {
        db()->prepare("UPDATE abonados SET estado = 'baja', fecha_baja = CURDATE() WHERE id = ?")->execute([$id]);
    } elseif ($accion === 'reactivar') {
        db()->prepare("UPDATE abonados SET estado = 'activo', fecha_baja = NULL WHERE id = ?")->execute([$id]);
    } else {
        error_api('Acción desconocida.');
    }

    responder(['abonado' => buscar_abonado($id)]);
});
