-- ============================================================
-- LocalShop - Datos de prueba (seed_data.sql)
-- Ejecutar DESPUÉS de: tu script original + alter_schema.sql
-- Las contraseñas de prueba están hasheadas con SHA-256 (siguen siendo "123456").
-- ============================================================
USE Local_Shop;

INSERT INTO categorias (nombre, descripcion_local, icono, color_tema) VALUES
('Restaurantes',   'Comida preparada de negocios locales', '🍔', '#D9887A'),
('Supermercados',  'Mercado y víveres de tu zona',          '🛒', '#8FBFAE'),
('Farmacia',       'Medicamentos y cuidado personal',       '💊', '#BFE0C8'),
('Mascotas',       'Todo para tu mascota',                  '🐶', '#E0A99A'),
('Licores',        'Vinos, cervezas y licores',              '🍷', '#9B87C4'),
('Flores',         'Arreglos y flores frescas',              '🌷', '#E5B3C4'),
('Tecnología',     'Accesorios y dispositivos',              '💻', '#A8C4D9'),
('Moda',           'Ropa y accesorios',                      '👗', '#E8C468');

INSERT INTO usuarios (nombre_completo, correo, telefono, contrasena, ciudad_actual, estado, rol, acepta_terminos) VALUES
('Milena Martínez', 'milena@hotmail.com', '3211234567', 'pbkdf2$120000$fJLyE8HpUEmTO3nnJ7HqfQ==$+r3OGsNscN5U78JqKXoZBQNV9fFNnYlUEeiwStetKWA=', 'Cartagena', 'activo', 'cliente', 1),
('Jose Santos',      'jose@hotmail.com',   '3219876543', 'pbkdf2$120000$fJLyE8HpUEmTO3nnJ7HqfQ==$+r3OGsNscN5U78JqKXoZBQNV9fFNnYlUEeiwStetKWA=', 'Cartagena', 'activo', 'cliente', 1);

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

INSERT INTO promociones (nombre, descripcion, descuento, fecha_inicio, fecha_fin, estado, negocio_id) VALUES
('2x1 en el plato principal', 'Promoción de lanzamiento LocalShop', 50, NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY), 'activo', 1);
