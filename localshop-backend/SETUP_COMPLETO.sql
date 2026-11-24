-- ============================================================
-- LocalShop - SETUP COMPLETO (un solo archivo)
-- Ejecuta TODO este script de una sola vez en MySQL Workbench.
-- Contiene: tu esquema original + columnas adicionales + datos de prueba.
-- Las cuentas de prueba usan la clave Cartagena.2026 (guardada con PBKDF2).
-- ============================================================

-- ---------- 1. ESQUEMA ORIGINAL ----------
-- ATENCION: borra la base Local_Shop si ya existe y la crea de nuevo.
-- Asi se evita que los datos de prueba queden duplicados al ejecutarlo dos veces.
DROP DATABASE IF EXISTS Local_Shop;
CREATE DATABASE Local_Shop CHARACTER SET utf8mb4;
USE Local_Shop;

CREATE TABLE categorias (
id INT AUTO_INCREMENT PRIMARY KEY,
nombre VARCHAR(100) NOT NULL,
descripcion_local TEXT,
imagen_banner VARCHAR(255),
icono VARCHAR(255),
color_tema VARCHAR(20),
estado ENUM('activo','inactivo') DEFAULT 'activo',
fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_categoria_nombre ON categorias(nombre);
CREATE INDEX idx_categoria_estado ON categorias(estado);

CREATE TABLE usuarios (
id INT AUTO_INCREMENT PRIMARY KEY,
nombre_completo VARCHAR(150) NOT NULL,
correo VARCHAR(150) NOT NULL UNIQUE,
telefono VARCHAR(20),
contrasena VARCHAR(255) NOT NULL,
ciudad_actual VARCHAR(100),
fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
estado ENUM('activo', 'inactivo') DEFAULT 'activo',
ultima_sesion DATETIME,
rol ENUM('cliente', 'negocio') NOT NULL DEFAULT 'cliente',
acepta_terminos TINYINT(1) DEFAULT 0
);
CREATE INDEX idx_usuario_correo ON usuarios(correo);
CREATE INDEX idx_usuario_estado ON usuarios(estado);
CREATE INDEX idx_usuario_rol ON usuarios(rol);

CREATE TABLE negocios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre_negocio VARCHAR(150) NOT NULL,
    propietario VARCHAR(150) NOT NULL,
    correo VARCHAR(150) NOT NULL UNIQUE,
    telefono VARCHAR(20),
    direccion VARCHAR(255),
    contrasena VARCHAR(255) NOT NULL,
    ciudad VARCHAR(100),
    categoria_id INT,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    estado ENUM('activo','inactivo','pendiente') DEFAULT 'pendiente',
    ultima_sesion DATETIME,
    rol ENUM('cliente', 'negocio') NOT NULL DEFAULT 'negocio',
    acepta_terminos TINYINT(1) DEFAULT 0,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id)
);
CREATE INDEX idx_negocio_correo ON negocios(correo);
CREATE INDEX idx_negocio_estado ON negocios(estado);
CREATE INDEX idx_negocio_categoria ON negocios(categoria_id);

CREATE TABLE productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre_producto VARCHAR(150) NOT NULL,
    descripcion_producto VARCHAR(255) NOT NULL,
    precio DECIMAL(10,2) NOT NULL,
    categoria_id INT,
    negocio_id INT,
    imagen_url VARCHAR(255),
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL,
    FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE SET NULL
);
ALTER TABLE productos ADD COLUMN stock INT DEFAULT 0;
ALTER TABLE productos ADD COLUMN fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
CREATE INDEX idx_producto_nombre ON productos(nombre_producto);
CREATE INDEX idx_producto_categoria ON productos(categoria_id);
CREATE INDEX idx_producto_negocio ON productos(negocio_id);

CREATE TABLE carrito (
id INT AUTO_INCREMENT PRIMARY KEY,
usuarios_id INT NOT NULL,
productos_id INT NOT NULL,
cantidad INT NOT NULL DEFAULT  1,
estado ENUM('pendiente','comprado') DEFAULT 'pendiente',
fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
FOREIGN KEY (usuarios_id) REFERENCES usuarios(id),
FOREIGN KEY (productos_id) REFERENCES productos(id)
);
CREATE INDEX idx_carrito_usuario ON carrito(usuarios_id);
CREATE INDEX idx_carrito_producto ON carrito(productos_id);

CREATE TABLE pedidos (
id INT AUTO_INCREMENT PRIMARY KEY,
usuarios_id INT NOT NULL,
negocios_id INT NOT NULL,
estado ENUM('pendiente','enviado','entregado') DEFAULT 'pendiente',
fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
total decimal (10,2) NOT NULL,
tiempo_entrega int,
Foreign key (usuarios_id) REFERENCES usuarios(id),
Foreign key (negocios_id) REFERENCES negocios(id)
);
CREATE INDEX idx_pedido_usuario ON pedidos(usuarios_id);
CREATE INDEX idx_pedido_negocio ON pedidos(negocios_id);
CREATE INDEX idx_pedido_estado ON pedidos(estado);

CREATE TABLE detalle_pedido (
id INT AUTO_INCREMENT PRIMARY KEY,
pedidos_id INT not null,
productos_id INT not null,
cantidad int not null,
precio_unitario decimal (10,2) not null,
precio_total decimal (10,2) not null,
Foreign key (pedidos_id) REFERENCES pedidos(id) ON DELETE CASCADE,
Foreign key (productos_id) REFERENCES productos(id)
);
CREATE INDEX idx_detalle_pedido_pedido ON detalle_pedido(pedidos_id);
CREATE INDEX idx_detalle_pedido_producto ON detalle_pedido(productos_id);

CREATE TABLE reviews (
id INT AUTO_INCREMENT PRIMARY KEY,
usuarios_id INT not null,
productos_id INT not null,
calificacion TINYINT not null,
comentario text,
fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
Foreign key (usuarios_id) REFERENCES usuarios(id),
Foreign key (productos_id) REFERENCES productos(id)
);
CREATE INDEX idx_review_usuario ON reviews(usuarios_id);
CREATE INDEX idx_review_producto ON reviews(productos_id);
CREATE INDEX idx_review_calificacion ON reviews(calificacion);

CREATE TABLE favoritos (
id INT AUTO_INCREMENT PRIMARY KEY,
usuarios_id INT not null,
negocios_id INT NOT NULL,
fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
Foreign key (usuarios_id) REFERENCES usuarios(id) ON DELETE CASCADE,
Foreign key (negocios_id) REFERENCES negocios(id) ON DELETE CASCADE
);
CREATE INDEX idx_favoritos_usuario ON favoritos(usuarios_id);
CREATE INDEX idx_favoritos_negocio ON favoritos(negocios_id);

CREATE TABLE configuracion_usuario (
id INT AUTO_INCREMENT PRIMARY KEY,
usuarios_id INT not null,
direccion text,
metodo_pago ENUM('PSE','Tarjeta de credito o debito','efectivo') NOT NULL,
preferencias text,
fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
Foreign key (usuarios_id) REFERENCES usuarios(id) ON DELETE CASCADE
);
CREATE INDEX idx_config_usuario_usuario ON configuracion_usuario(usuarios_id);

CREATE TABLE historial_pedido (
id INT AUTO_INCREMENT PRIMARY KEY,
pedido_id INT,
estado_anterior ENUM('pendiente', 'enviado', 'entregado'),
estado_nuevo ENUM('pendiente', 'enviado', 'entregado'),
fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
usuario_id INT,
FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE promociones (
id INT AUTO_INCREMENT PRIMARY KEY,
nombre VARCHAR(100),
descripcion TEXT,
descuento DECIMAL(5,2),
fecha_inicio TIMESTAMP,
    fecha_fin TIMESTAMP,
    estado ENUM('activo', 'inactivo') DEFAULT 'activo'
);

-- ---------- 2. AJUSTES (columnas que el frontend necesita) ----------
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

-- ---------- 3. DATOS DE PRUEBA ----------
INSERT INTO categorias (nombre, descripcion_local, icono, color_tema) VALUES
('Restaurantes',   'Comida preparada de negocios locales', '🍔', '#D9887A'),
('Supermercados',  'Mercado y víveres de tu zona',          '🛒', '#8FBFAE'),
('Farmacia',       'Medicamentos y cuidado personal',       '💊', '#BFE0C8'),
('Mascotas',       'Todo para tu mascota',                  '🐶', '#E0A99A'),
('Licores',        'Vinos, cervezas y licores',              '🍷', '#9B87C4'),
('Flores',         'Arreglos y flores frescas',              '🌷', '#E5B3C4'),
('Tecnología',     'Accesorios y dispositivos',              '💻', '#A8C4D9'),
('Moda',           'Ropa y accesorios',                      '👗', '#E8C468');

-- contraseña de prueba: Cartagena.2026 (guardada con PBKDF2 + salt)
INSERT INTO usuarios (nombre_completo, correo, telefono, contrasena, ciudad_actual, estado, rol, acepta_terminos) VALUES
('Milena Martínez', 'milena@hotmail.com', '3211234567', 'pbkdf2$120000$fJLyE8HpUEmTO3nnJ7HqfQ==$+r3OGsNscN5U78JqKXoZBQNV9fFNnYlUEeiwStetKWA=', 'Cartagena', 'activo', 'cliente', 1),
('Jose Santos',      'jose@hotmail.com',   '3219876543', 'pbkdf2$120000$fJLyE8HpUEmTO3nnJ7HqfQ==$+r3OGsNscN5U78JqKXoZBQNV9fFNnYlUEeiwStetKWA=', 'Cartagena', 'activo', 'cliente', 1);

-- contraseña de prueba para todos: Cartagena.2026 (guardada con PBKDF2 + salt)
INSERT INTO negocios (nombre_negocio, propietario, correo, telefono, direccion, contrasena, ciudad, categoria_id, estado, rol, acepta_terminos, imagen_url, descripcion, horario, tiempo_entrega_min, costo_envio, pedido_minimo) VALUES
('La Parrilla del Sur', 'Carlos Pérez',  'parrilla@hotmail.com', '3101234567', 'Calle 85 #15-32, Cartagena', 'pbkdf2$120000$fJLyE8HpUEmTO3nnJ7HqfQ==$+r3OGsNscN5U78JqKXoZBQNV9fFNnYlUEeiwStetKWA=', 'Cartagena', 1, 'activo', 'negocio', 1, NULL, 'Comida típica a la parrilla, ingredientes frescos y locales.', 'Lun - Dom 11:00 AM - 10:00 PM', 25, 2500, 15000),
('Mercado Fresco',      'Ana Torres',    'mercado@hotmail.com',  '3102234567', 'Cra 20 #45-10, Cartagena',   'pbkdf2$120000$fJLyE8HpUEmTO3nnJ7HqfQ==$+r3OGsNscN5U78JqKXoZBQNV9fFNnYlUEeiwStetKWA=', 'Cartagena', 2, 'activo', 'negocio', 1, NULL,  'Frutas, verduras y víveres frescos todos los días.',         'Lun - Sáb 7:00 AM - 8:00 PM',   40, 3000, 20000),
('Farmacia San José',   'Luis Ramírez',  'farmacia@hotmail.com', '3103234567', 'Av. Pedro de Heredia #12-05','pbkdf2$120000$fJLyE8HpUEmTO3nnJ7HqfQ==$+r3OGsNscN5U78JqKXoZBQNV9fFNnYlUEeiwStetKWA=', 'Cartagena', 3, 'activo', 'negocio', 1, NULL, 'Medicamentos y cuidado personal con atención 24 horas.',     'Lun - Dom 24 horas',            15, 2000, 10000),
('Mundo Mascotas',      'Diana Gómez',   'mascotas@hotmail.com', '3104234567', 'Calle 30 #8-19, Cartagena',  'pbkdf2$120000$fJLyE8HpUEmTO3nnJ7HqfQ==$+r3OGsNscN5U78JqKXoZBQNV9fFNnYlUEeiwStetKWA=', 'Cartagena', 4, 'activo', 'negocio', 1, NULL, 'Todo para el cuidado y alimentación de tu mascota.',         'Lun - Sáb 9:00 AM - 7:00 PM',   35, 3500, 15000),
('Licorera del Centro', 'Jorge Salcedo', 'licores@hotmail.com',  '3105234567', 'Centro, Cartagena',          'pbkdf2$120000$fJLyE8HpUEmTO3nnJ7HqfQ==$+r3OGsNscN5U78JqKXoZBQNV9fFNnYlUEeiwStetKWA=', 'Cartagena', 5, 'activo', 'negocio', 1, NULL,  'Vinos, cervezas y licores nacionales e importados.',         'Lun - Dom 10:00 AM - 11:00 PM', 20, 3000, 25000),
('Flores del Caribe',   'Paola Díaz',    'flores@hotmail.com',   '3106234567', 'Calle 50 #22-14, Cartagena', 'pbkdf2$120000$fJLyE8HpUEmTO3nnJ7HqfQ==$+r3OGsNscN5U78JqKXoZBQNV9fFNnYlUEeiwStetKWA=', 'Cartagena', 6, 'activo', 'negocio', 1, NULL,   'Arreglos florales para toda ocasión.',                        'Lun - Sáb 8:00 AM - 6:00 PM',   30, 4000, 30000),
('TecnoExpress',        'Andrés Muñoz',  'tecno@hotmail.com',    '3107234567', 'Cra 15 #33-21, Cartagena',   'pbkdf2$120000$fJLyE8HpUEmTO3nnJ7HqfQ==$+r3OGsNscN5U78JqKXoZBQNV9fFNnYlUEeiwStetKWA=', 'Cartagena', 7, 'activo', 'negocio', 1, NULL,    'Accesorios y dispositivos tecnológicos.',                     'Lun - Sáb 10:00 AM - 8:00 PM',  30, 3000, 20000),
('Urban Style',         'Camila Rojas',  'moda@hotmail.com',     '3108234567', 'Calle 44 #10-08, Cartagena', 'pbkdf2$120000$fJLyE8HpUEmTO3nnJ7HqfQ==$+r3OGsNscN5U78JqKXoZBQNV9fFNnYlUEeiwStetKWA=', 'Cartagena', 8, 'activo', 'negocio', 1, NULL,     'Ropa y accesorios de moda urbana.',                           'Lun - Sáb 10:00 AM - 8:00 PM',  25, 3000, 25000);

INSERT INTO productos (nombre_producto, descripcion_producto, precio, categoria_id, negocio_id, imagen_url, stock) VALUES
('Bandeja paisa', 'Plato típico con carne, frijoles y arroz', 28000, 1, 1, NULL, 50),
('Jugo natural', 'Jugo de fruta natural del día', 8000, 1, 1, NULL, 100),
('Sancocho de gallina', 'Sancocho tradicional con presa de gallina', 26000, 1, 1, NULL, 40),
('Canasta familiar', 'Combo de productos básicos', 65000, 2, 2, NULL, 30),
('Frutas y verduras', 'Selección fresca de temporada', 22000, 2, 2, NULL, 40),
('Acetaminofén', 'Caja x20 tabletas', 9000, 3, 3, NULL, 200),
('Vitaminas', 'Frasco multivitamínico', 35000, 3, 3, NULL, 80),
('Concentrado para perro', 'Bulto 8kg', 62000, 4, 4, NULL, 25),
('Shampoo para mascotas', 'Shampoo antipulgas 500ml', 24000, 4, 4, NULL, 60),
('Botella de vino tinto', 'Vino tinto reserva 750ml', 48000, 5, 5, NULL, 40),
('Cerveza artesanal (six pack)', 'Six pack cerveza local', 32000, 5, 5, NULL, 70),
('Ramo de rosas', 'Docena de rosas rojas', 45000, 6, 6, NULL, 20),
('Arreglo mixto', 'Arreglo floral variado', 55000, 6, 6, NULL, 15),
('Audífonos inalámbricos', 'Bluetooth 5.0, estuche de carga', 89000, 7, 7, NULL, 35),
('Power bank', 'Batería portátil 10000mAh', 55000, 7, 7, NULL, 45),
('Camiseta básica', 'Algodón 100%, varias tallas', 35000, 8, 8, NULL, 90),
('Tenis urbanos', 'Diseño casual unisex', 120000, 8, 8, NULL, 30);

INSERT INTO reviews (usuarios_id, productos_id, calificacion, comentario) VALUES
(1, 1, 5, 'Excelente sabor, llegó caliente y a tiempo.'),
(2, 1, 4, 'Muy buena porción, repetiré pronto.'),
(1, 4, 5, 'Productos frescos, tal como se ven en las fotos.'),
(2, 10, 5, 'Buen precio y entrega rápida.');
UPDATE reviews r JOIN productos p ON r.productos_id = p.id SET r.negocio_id = p.negocio_id WHERE r.id > 0 AND r.negocio_id IS NULL;

INSERT INTO promociones (nombre, descripcion, descuento, fecha_inicio, fecha_fin, estado, negocio_id, codigo, compra_minima) VALUES
('Cupón de bienvenida', '10% de descuento en compras desde $20.000', 10, NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY), 'activo', 1, 'LOCAL10', 20000);

-- Insumos de ejemplo para La Parrilla del Sur (los demas negocios empiezan sin insumos).
INSERT INTO insumos (negocio_id, nombre, unidad, cantidad, minimo)
SELECT id, 'Carne de res', 'kg', 12, 8 FROM negocios WHERE correo = 'parrilla@hotmail.com'
UNION ALL SELECT id, 'Arroz', 'kg', 4, 10 FROM negocios WHERE correo = 'parrilla@hotmail.com'
UNION ALL SELECT id, 'Frijoles', 'kg', 9, 5 FROM negocios WHERE correo = 'parrilla@hotmail.com'
UNION ALL SELECT id, 'Gallina', 'unidades', 3, 4 FROM negocios WHERE correo = 'parrilla@hotmail.com'
UNION ALL SELECT id, 'Limones', 'kg', 6, 3 FROM negocios WHERE correo = 'parrilla@hotmail.com'
UNION ALL SELECT id, 'Gas propano', 'cilindros', 1, 2 FROM negocios WHERE correo = 'parrilla@hotmail.com';

-- ============================================================
-- LISTO. Si no salió ningún error rojo, tu base de datos
-- Local_Shop ya está completa y lista para usar.
-- ============================================================
