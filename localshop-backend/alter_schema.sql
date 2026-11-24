-- ============================================================
-- LocalShop - Ajustes al esquema (alter_schema.sql)
-- Ejecutar DESPUÉS de tu script original, ANTES de seed_data.sql
-- Son cambios ADITIVOS: no borran ni modifican nada de lo que ya tenías.
-- ============================================================
USE Local_Shop;

ALTER TABLE negocios
  ADD COLUMN imagen_url VARCHAR(255) NULL,
  ADD COLUMN descripcion TEXT NULL,
  ADD COLUMN horario VARCHAR(100) DEFAULT 'Lun - Dom 9:00 AM - 8:00 PM',
  ADD COLUMN tiempo_entrega_min INT DEFAULT 30,
  ADD COLUMN costo_envio DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN pedido_minimo DECIMAL(10,2) DEFAULT 0;

ALTER TABLE promociones
  ADD COLUMN negocio_id INT NULL,
  ADD CONSTRAINT fk_promo_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id);

CREATE INDEX idx_promo_negocio ON promociones(negocio_id);

-- ---------- 2b. SEGURIDAD, NOTAS EN PEDIDOS Y ENTREGA ----------
ALTER TABLE carrito
  ADD COLUMN nota VARCHAR(200) NOT NULL DEFAULT '';

ALTER TABLE detalle_pedido
  ADD COLUMN nota VARCHAR(200) NOT NULL DEFAULT '';

ALTER TABLE pedidos
  ADD COLUMN costo_envio DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN direccion_entrega VARCHAR(255) NULL,
  ADD COLUMN metodo_pago VARCHAR(40) NULL,
  ADD COLUMN nota VARCHAR(200) NULL;

-- Enlaces de "olvidé mi contraseña": solo se guarda el hash del token, nunca el token.
CREATE TABLE password_resets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tipo ENUM('cliente','negocio') NOT NULL,
  usuario_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expira DATETIME NOT NULL,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_reset_token (token_hash),
  INDEX idx_reset_usuario (tipo, usuario_id)
);

-- ---------- 2c. Insumos, direcciones guardadas y cancelación de pedidos ----------
ALTER TABLE pedidos MODIFY estado ENUM('pendiente','enviado','entregado','cancelado') DEFAULT 'pendiente';
ALTER TABLE historial_pedido MODIFY estado_anterior ENUM('pendiente','enviado','entregado','cancelado');
ALTER TABLE historial_pedido MODIFY estado_nuevo ENUM('pendiente','enviado','entregado','cancelado');

CREATE TABLE insumos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  negocio_id INT NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  unidad VARCHAR(20) NOT NULL DEFAULT 'unidades',
  cantidad DECIMAL(10,2) NOT NULL DEFAULT 0,
  minimo DECIMAL(10,2) NOT NULL DEFAULT 0,
  fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_insumo_negocio (negocio_id, nombre),
  FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE
);

CREATE TABLE movimientos_insumo (
  id INT AUTO_INCREMENT PRIMARY KEY,
  insumo_id INT NOT NULL,
  tipo ENUM('entrada','salida') NOT NULL,
  cantidad DECIMAL(10,2) NOT NULL,
  motivo VARCHAR(120) NULL,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (insumo_id) REFERENCES insumos(id) ON DELETE CASCADE
);

CREATE TABLE direcciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuarios_id INT NOT NULL,
  etiqueta VARCHAR(40) NOT NULL,
  direccion VARCHAR(255) NOT NULL,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_direccion_usuario (usuarios_id),
  FOREIGN KEY (usuarios_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- ---------- 2d. Productos ocultos, promociones reales y publicidad local ----------
ALTER TABLE productos ADD COLUMN activo TINYINT(1) NOT NULL DEFAULT 1;

ALTER TABLE promociones
  ADD COLUMN codigo VARCHAR(30) NULL,
  ADD COLUMN producto_id INT NULL,
  ADD COLUMN compra_minima DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN usos_max INT NULL,
  ADD COLUMN usos INT NOT NULL DEFAULT 0,
  ADD UNIQUE KEY uq_promo_codigo (negocio_id, codigo);

ALTER TABLE pedidos
  ADD COLUMN descuento DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN promo_id INT NULL,
  ADD COLUMN promo_nombre VARCHAR(100) NULL,
  ADD COLUMN codigo_promo VARCHAR(30) NULL;

CREATE TABLE campanias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  negocio_id INT NOT NULL,
  paquete ENUM('basico','principal','premium') NOT NULL,
  titulo VARCHAR(60) NOT NULL,
  mensaje VARCHAR(140) NOT NULL,
  fecha_inicio DATETIME NOT NULL,
  fecha_fin DATETIME NOT NULL,
  estado ENUM('activa','pausada','cancelada') NOT NULL DEFAULT 'activa',
  costo_total DECIMAL(10,2) NOT NULL,
  impresiones INT NOT NULL DEFAULT 0,
  clics INT NOT NULL DEFAULT 0,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_campania_negocio (negocio_id),
  FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE
);

-- ---------- 2e. Las calificaciones son del negocio (una por pedido entregado) ----------
ALTER TABLE reviews MODIFY productos_id INT NULL;
ALTER TABLE reviews
  ADD COLUMN negocio_id INT NULL,
  ADD COLUMN pedido_id INT NULL,
  ADD UNIQUE KEY uq_review_pedido (pedido_id),
  ADD CONSTRAINT fk_review_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id),
  ADD CONSTRAINT fk_review_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id);
UPDATE reviews r JOIN productos p ON r.productos_id = p.id SET r.negocio_id = p.negocio_id WHERE r.id > 0 AND r.negocio_id IS NULL;
