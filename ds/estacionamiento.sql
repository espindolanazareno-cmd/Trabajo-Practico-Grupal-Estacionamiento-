-- =====================================================================
-- Base de datos del Sistema de Control de Estacionamiento
-- Motor: MySQL 5.7+ / MariaDB 10.1+ (XAMPP)
--
-- Script idempotente: puede ejecutarse varias veces sin borrar datos.
--   mysql -u root -p < db/estacionamiento.sql
-- o importarlo desde phpMyAdmin (pestaña "Importar").
-- =====================================================================

CREATE DATABASE IF NOT EXISTS tp_estacionamiento
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE tp_estacionamiento;

-- ---------------------------------------------------------------------
-- Lista de precios por categoría.
-- Estadía por hora: la primera hora se cobra completa; después, cada
-- fracción de 15 minutos (o parte) se cobra a precio_fraccion.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tarifas (
  categoria       ENUM('Moto','Auto','Camioneta','Bus') NOT NULL,
  descripcion     VARCHAR(60)   NOT NULL,
  precio_hora     DECIMAL(10,2) NOT NULL,
  precio_fraccion DECIMAL(10,2) NOT NULL,
  precio_mensual  DECIMAL(10,2) NOT NULL,
  orden           TINYINT UNSIGNED NOT NULL DEFAULT 0,
  actualizado_en  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (categoria)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO tarifas (categoria, descripcion, precio_hora, precio_fraccion, precio_mensual, orden) VALUES
  ('Moto',      'Moto',              100.00,  25.00, 15000.00, 1),
  ('Auto',      'Auto',              350.00,  87.50, 45000.00, 2),
  ('Camioneta', 'Camioneta / SUV',   500.00, 125.00, 60000.00, 3),
  ('Bus',       'Bus',               600.00, 150.00, 80000.00, 4);

-- ---------------------------------------------------------------------
-- Abonados: vehículos/clientes que pagan en forma mensual.
-- La baja es lógica (estado = 'baja'), nunca se borran filas.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS abonados (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  patente         VARCHAR(10)  NOT NULL,
  titular         VARCHAR(120) NOT NULL,
  documento       VARCHAR(20)  NULL,
  telefono        VARCHAR(30)  NULL,
  email           VARCHAR(120) NULL,
  categoria       ENUM('Moto','Auto','Camioneta','Bus') NOT NULL DEFAULT 'Auto',
  monto_mensual   DECIMAL(10,2) NOT NULL,
  dia_vencimiento TINYINT UNSIGNED NOT NULL DEFAULT 10,
  fecha_alta      DATE NOT NULL,
  fecha_baja      DATE NULL,
  estado          ENUM('activo','suspendido','baja') NOT NULL DEFAULT 'activo',
  observaciones   VARCHAR(255) NULL,
  creado_en       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_abonados_patente (patente),
  KEY idx_abonados_estado (estado),
  KEY idx_abonados_titular (titular)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Pagos mensuales de los abonados. Un pago por abonado y período.
-- periodo con formato 'AAAA-MM'.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pagos_abonados (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  abonado_id    INT UNSIGNED NOT NULL,
  periodo       CHAR(7)      NOT NULL,
  monto         DECIMAL(10,2) NOT NULL,
  fecha_pago    DATETIME     NOT NULL,
  medio_pago    ENUM('efectivo','debito','credito','transferencia','mercadopago','otro') NOT NULL DEFAULT 'efectivo',
  comprobante   VARCHAR(40)  NULL,
  observaciones VARCHAR(255) NULL,
  creado_en     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pagos_abonado_periodo (abonado_id, periodo),
  KEY idx_pagos_periodo (periodo),
  KEY idx_pagos_fecha (fecha_pago),
  CONSTRAINT fk_pagos_abonado FOREIGN KEY (abonado_id)
    REFERENCES abonados (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Movimientos: TODAS las entradas y salidas del estacionamiento,
-- tanto de clientes por hora como de abonados mensuales.
-- monto = importe cobrado en la salida (0 para abonados al día,
-- NULL en las entradas).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movimientos (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  patente       VARCHAR(10)  NOT NULL,
  tipo          ENUM('entrada','salida') NOT NULL,
  fecha_hora    DATETIME     NOT NULL,
  tipo_cliente  ENUM('hora','abonado') NOT NULL DEFAULT 'hora',
  abonado_id    INT UNSIGNED NULL,
  categoria     VARCHAR(20)  NULL,
  cochera       TINYINT UNSIGNED NULL,
  folio         VARCHAR(20)  NULL,
  minutos       INT UNSIGNED NULL,
  monto         DECIMAL(10,2) NULL,
  observaciones VARCHAR(255) NULL,
  creado_en     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_mov_fecha (fecha_hora),
  KEY idx_mov_patente_fecha (patente, fecha_hora),
  KEY idx_mov_folio (folio),
  KEY idx_mov_tipo_cliente (tipo_cliente, fecha_hora),
  KEY idx_mov_abonado (abonado_id),
  CONSTRAINT fk_mov_abonado FOREIGN KEY (abonado_id)
    REFERENCES abonados (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Estado de cuenta de cada abonado.
-- al_dia = 1 si está activo y pagó el mes en curso, o si todavía no
-- pasó su día de vencimiento y tiene pago el mes anterior.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_abonados_estado AS
SELECT
  a.*,
  (SELECT MAX(p.periodo) FROM pagos_abonados p WHERE p.abonado_id = a.id) AS ultimo_periodo_pagado,
  (SELECT MAX(p.fecha_pago) FROM pagos_abonados p WHERE p.abonado_id = a.id) AS ultimo_pago,
  CASE
    WHEN a.estado <> 'activo' THEN 0
    WHEN EXISTS (SELECT 1 FROM pagos_abonados p
                  WHERE p.abonado_id = a.id
                    AND p.periodo = DATE_FORMAT(CURDATE(), '%Y-%m')) THEN 1
    WHEN DAY(CURDATE()) <= a.dia_vencimiento
     AND EXISTS (SELECT 1 FROM pagos_abonados p
                  WHERE p.abonado_id = a.id
                    AND p.periodo = DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m')) THEN 1
    ELSE 0
  END AS al_dia
FROM abonados a;
