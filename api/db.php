<?php
// Conexión PDO y utilidades comunes de la API (compatible PHP 7.3+).

$CONFIG = require __DIR__ . '/config.php';
date_default_timezone_set($CONFIG['timezone']);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function db()
{
    global $CONFIG;
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $CONFIG['host'], $CONFIG['port'], $CONFIG['dbname']);
        $pdo = new PDO($dsn, $CONFIG['user'], $CONFIG['password'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
        // CURDATE()/NOW() de la vista v_abonados_estado usan la hora local.
        $pdo->exec("SET time_zone = '" . date('P') . "'");
    }
    return $pdo;
}

function responder($data, $status = 200)
{
    http_response_code($status);
    echo json_encode(['ok' => $status < 400] + $data, JSON_UNESCAPED_UNICODE);
    exit;
}

function error_api($mensaje, $status = 400)
{
    responder(['error' => $mensaje], $status);
}

// Acepta JSON (fetch) o form-urlencoded.
function entrada()
{
    $raw = file_get_contents('php://input');
    $json = json_decode($raw, true);
    return is_array($json) ? $json : $_POST;
}

function texto($valor, $max = 255)
{
    $valor = trim((string) $valor);
    return $valor === '' ? null : mb_substr($valor, 0, $max);
}

function normalizar_patente($patente)
{
    return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $patente));
}

function ejecutar_api(callable $fn)
{
    try {
        $fn();
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') {
            error_api('Registro duplicado o con referencias inválidas: ' . $e->errorInfo[2], 409);
        }
        error_api('Error de base de datos: ' . $e->getMessage(), 500);
    } catch (Exception $e) {
        error_api($e->getMessage(), 500);
    }
}

const CATEGORIAS = ['Moto', 'Auto', 'Camioneta', 'Bus'];
const MINUTOS_FRACCION = 15;

// Primera hora completa; después, horas completas más cada fracción de
// 15 minutos iniciada. Las fracciones nunca superan el precio de una hora.
function cotizar_estadia($categoria, $minutos)
{
    $st = db()->prepare('SELECT * FROM tarifas WHERE categoria = ?');
    $st->execute([$categoria]);
    $tarifa = $st->fetch();
    if (!$tarifa) throw new Exception("No hay tarifa cargada para la categoría '$categoria'.");

    $minutos = max(1, (int) $minutos);
    $horas = intdiv($minutos, 60);
    $fracciones = (int) ceil(($minutos % 60) / MINUTOS_FRACCION);
    if ($horas === 0) {
        $horas = 1;
        $fracciones = 0;
    }
    $importeHoras = $horas * (float) $tarifa['precio_hora'];
    $importeFracciones = min($fracciones * (float) $tarifa['precio_fraccion'], (float) $tarifa['precio_hora']);

    return [
        'categoria'          => $categoria,
        'minutos'            => $minutos,
        'horas'              => $horas,
        'fracciones'         => $fracciones,
        'precio_hora'        => $tarifa['precio_hora'],
        'precio_fraccion'    => $tarifa['precio_fraccion'],
        'importe_horas'      => round($importeHoras, 2),
        'importe_fracciones' => round($importeFracciones, 2),
        'monto'              => round($importeHoras + $importeFracciones, 2),
    ];
}
const MEDIOS_PAGO = ['efectivo', 'debito', 'credito', 'transferencia', 'mercadopago', 'otro'];
