CREATE DATABASE IF NOT EXISTS promoinvest_saf;

USE promoinvest_saf;

CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    correo VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    rol ENUM('admin', 'interno', 'inversionista', 'fideicomisario', 'estructurador', 'operaciones') NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bitacora (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NULL,
    accion VARCHAR(80) NOT NULL,
    entidad VARCHAR(80) NOT NULL,
    entidad_id BIGINT NULL,
    detalle TEXT,
    fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS valor_cuota_diario (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha DATE NOT NULL,
    valor_cuota DECIMAL(18,2) NOT NULL,
    descripcion VARCHAR(150) DEFAULT '',
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_valor_cuota_diario_fecha (fecha)
);

CREATE TABLE IF NOT EXISTS clientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    correo VARCHAR(150) NOT NULL,
    dni VARCHAR(20) NULL,
    numero_cuotas INT NOT NULL,
    valor_cuota_diario_id INT NOT NULL,
    importe_total DECIMAL(18,2) NOT NULL DEFAULT 0,
    clave VARCHAR(255) NULL,
    requiere_cambio_clave BOOLEAN NOT NULL DEFAULT TRUE,
    estado VARCHAR(30) NOT NULL DEFAULT 'Pendiente',
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (valor_cuota_diario_id) REFERENCES valor_cuota_diario(id),
    CHECK (numero_cuotas > 0)
);

CREATE TABLE IF NOT EXISTS suscripciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT NOT NULL,
    dni VARCHAR(20) NOT NULL,
    fecha DATE NOT NULL,
    numero_cuotas INT NOT NULL,
    valor_cuota DECIMAL(18,2) NOT NULL,
    importe_total DECIMAL(18,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    CHECK (numero_cuotas > 0)
);

CREATE TABLE IF NOT EXISTS rescates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT NOT NULL,
    dni VARCHAR(20) NOT NULL,
    fecha DATE NOT NULL,
    numero_cuotas INT NOT NULL,
    valor_cuota DECIMAL(18,2) NOT NULL,
    importe_total DECIMAL(18,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    CHECK (numero_cuotas > 0)
);

DELIMITER $$
CREATE TRIGGER trg_clientes_importe_insert
BEFORE INSERT ON clientes
FOR EACH ROW
BEGIN
    DECLARE v_valor DECIMAL(18,2);
    SELECT valor_cuota INTO v_valor
    FROM valor_cuota_diario
    WHERE id = NEW.valor_cuota_diario_id AND activo = 1
    LIMIT 1;

    SET NEW.importe_total = NEW.numero_cuotas * COALESCE(v_valor, 0);
END$$

CREATE TRIGGER trg_clientes_importe_update
BEFORE UPDATE ON clientes
FOR EACH ROW
BEGIN
    DECLARE v_valor DECIMAL(18,2);
    SELECT valor_cuota INTO v_valor
    FROM valor_cuota_diario
    WHERE id = NEW.valor_cuota_diario_id AND activo = 1
    LIMIT 1;

    SET NEW.importe_total = NEW.numero_cuotas * COALESCE(v_valor, 0);
END$$
DELIMITER ;

CREATE OR REPLACE VIEW vw_clientes_detalle AS
SELECT
    c.id,
    c.nombre,
    c.apellidos,
    c.correo,
    c.dni,
    c.numero_cuotas,
    v.fecha,
    v.valor_cuota,
    c.importe_total,
    c.requiere_cambio_clave,
    c.estado,
    c.activo
FROM clientes c
LEFT JOIN valor_cuota_diario v ON v.id = c.valor_cuota_diario_id;

CREATE OR REPLACE VIEW vw_suscripciones_detalle AS
SELECT s.id, s.cliente_id, s.dni, c.nombre, c.apellidos, s.fecha,
       s.numero_cuotas, s.valor_cuota, s.importe_total, s.created_at
FROM suscripciones s
INNER JOIN clientes c ON c.id = s.cliente_id;

CREATE OR REPLACE VIEW vw_rescates_detalle AS
SELECT r.id, r.cliente_id, r.dni, c.nombre, c.apellidos, r.fecha,
       r.numero_cuotas, r.valor_cuota, r.importe_total, r.created_at
FROM rescates r
INNER JOIN clientes c ON c.id = r.cliente_id;
