<?php
// API de la lista de precios.
//   GET  tarifas.php                              -> lista de precios
//   GET  tarifas.php?categoria=Auto&minutos=95    -> cotiza una estadía por hora
//   POST tarifas.php {tarifas: [{categoria, precio_hora, precio_fraccion, precio_mensual}]}
require __DIR__ . '/db.php';

ejecutar_api(function () {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        if (isset($_GET['minutos'])) {
            responder(['cotizacion' => cotizar_estadia($_GET['categoria'] ?? '', $_GET['minutos'])]);
        }
        $st = db()->query('SELECT * FROM tarifas ORDER BY orden, categoria');
        responder(['tarifas' => $st->fetchAll(), 'minutos_fraccion' => MINUTOS_FRACCION]);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') error_api('Método no permitido.', 405);

    $tarifas = entrada()['tarifas'] ?? null;
    if (!is_array($tarifas) || !$tarifas) error_api('No se recibieron tarifas.');

    $st = db()->prepare('UPDATE tarifas SET precio_hora = ?, precio_fraccion = ?, precio_mensual = ? WHERE categoria = ?');
    db()->beginTransaction();
    foreach ($tarifas as $t) {
        $categoria = $t['categoria'] ?? '';
        if (!in_array($categoria, CATEGORIAS, true)) error_api("Categoría inválida: $categoria.");
        foreach (['precio_hora', 'precio_fraccion', 'precio_mensual'] as $campo) {
            if (!is_numeric($t[$campo] ?? null) || $t[$campo] < 0) error_api("Precio inválido en $categoria ($campo).");
        }
        $st->execute([$t['precio_hora'], $t['precio_fraccion'], $t['precio_mensual'], $categoria]);
    }
    db()->commit();

    $st = db()->query('SELECT * FROM tarifas ORDER BY orden, categoria');
    responder(['tarifas' => $st->fetchAll()]);
});
