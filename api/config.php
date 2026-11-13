<?php
// Parámetros de conexión a MySQL/MariaDB.
// Para no tocar este archivo en cada servidor, crear api/config.local.php
// devolviendo un array con las claves que se quieran sobrescribir.
$config = [
    'host'     => '127.0.0.1',
    'port'     => 3306,
    'dbname'   => 'tp_estacionamiento',
    'user'     => 'root',
    'password' => '',
    'timezone' => 'America/Argentina/Buenos_Aires',
];

$local = __DIR__ . '/config.local.php';
if (is_file($local)) {
    $config = array_merge($config, require $local);
}

return $config;
