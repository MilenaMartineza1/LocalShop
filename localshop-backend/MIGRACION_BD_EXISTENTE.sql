-- ============================================================
-- LocalShop - Migración para una base Local_Shop que YA tienes creada
-- (si vas a crearla desde cero, usa SETUP_COMPLETO.sql y NO corras este archivo).
-- Córrelo UNA sola vez en MySQL Workbench.
-- ============================================================
USE Local_Shop;
SET SQL_SAFE_UPDATES = 0;

ALTER TABLE carrito
  ADD COLUMN nota VARCHAR(200) NOT NULL DEFAULT '';

ALTER TABLE detalle_pedido
  ADD COLUMN nota VARCHAR(200) NOT NULL DEFAULT '';

ALTER TABLE pedidos
  ADD COLUMN costo_envio DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN direccion_entrega VARCHAR(255) NULL,
  ADD COLUMN metodo_pago VARCHAR(40) NULL,
  ADD COLUMN nota VARCHAR(200) NULL;

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

-- Las fotos aleatorias de picsum no tenían relación con el negocio: el sitio ahora genera
-- la imagen a partir del nombre y la categoría cuando imagen_url está vacía.
UPDATE negocios  SET imagen_url = NULL WHERE imagen_url LIKE '%picsum.photos%';
UPDATE productos SET imagen_url = NULL WHERE imagen_url LIKE '%picsum.photos%';

-- Cuentas de prueba: la contraseña 123456 aparece en listas de claves filtradas (Chrome avisa de ello).
-- Nueva contraseña de prueba para todas: Cartagena.2026
UPDATE usuarios SET contrasena = 'pbkdf2$120000$fJLyE8HpUEmTO3nnJ7HqfQ==$+r3OGsNscN5U78JqKXoZBQNV9fFNnYlUEeiwStetKWA='
 WHERE correo IN ('milena@hotmail.com', 'jose@hotmail.com');
UPDATE negocios SET contrasena = 'pbkdf2$120000$fJLyE8HpUEmTO3nnJ7HqfQ==$+r3OGsNscN5U78JqKXoZBQNV9fFNnYlUEeiwStetKWA='
 WHERE correo IN ('parrilla@hotmail.com','mercado@hotmail.com','farmacia@hotmail.com','mascotas@hotmail.com',
                  'licores@hotmail.com','flores@hotmail.com','tecno@hotmail.com','moda@hotmail.com');

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

-- Insumos de ejemplo para La Parrilla del Sur (los demas negocios empiezan sin insumos).
INSERT INTO insumos (negocio_id, nombre, unidad, cantidad, minimo)
SELECT id, 'Carne de res', 'kg', 12, 8 FROM negocios WHERE correo = 'parrilla@hotmail.com'
UNION ALL SELECT id, 'Arroz', 'kg', 4, 10 FROM negocios WHERE correo = 'parrilla@hotmail.com'
UNION ALL SELECT id, 'Frijoles', 'kg', 9, 5 FROM negocios WHERE correo = 'parrilla@hotmail.com'
UNION ALL SELECT id, 'Gallina', 'unidades', 3, 4 FROM negocios WHERE correo = 'parrilla@hotmail.com'
UNION ALL SELECT id, 'Limones', 'kg', 6, 3 FROM negocios WHERE correo = 'parrilla@hotmail.com'
UNION ALL SELECT id, 'Gas propano', 'cilindros', 1, 2 FROM negocios WHERE correo = 'parrilla@hotmail.com';

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

-- Las promociones anteriores eran solo un texto y no descontaban nada. Ahora si descuentan,
-- asi que se dejan pausadas; el negocio puede activarlas de nuevo desde su panel.
UPDATE promociones SET estado = 'inactivo' WHERE codigo IS NULL;

-- ---------- 2e. Las calificaciones son del negocio (una por pedido entregado) ----------
ALTER TABLE reviews MODIFY productos_id INT NULL;
ALTER TABLE reviews
  ADD COLUMN negocio_id INT NULL,
  ADD COLUMN pedido_id INT NULL,
  ADD UNIQUE KEY uq_review_pedido (pedido_id),
  ADD CONSTRAINT fk_review_negocio FOREIGN KEY (negocio_id) REFERENCES negocios(id),
  ADD CONSTRAINT fk_review_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id);
UPDATE reviews r JOIN productos p ON r.productos_id = p.id SET r.negocio_id = p.negocio_id WHERE r.id > 0 AND r.negocio_id IS NULL;
