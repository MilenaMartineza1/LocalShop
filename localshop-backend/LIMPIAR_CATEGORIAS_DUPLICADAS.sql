-- ============================================================
-- LocalShop - Quita categorias repetidas (por haber corrido el SETUP dos veces).
-- Conserva la de menor id, pasa los negocios y productos a esa y borra las demas.
-- Es seguro correrlo mas de una vez.
-- ============================================================
USE Local_Shop;
SET SQL_SAFE_UPDATES = 0;

UPDATE negocios n
JOIN categorias c ON c.id = n.categoria_id
JOIN (SELECT nombre, MIN(id) AS id_ok FROM categorias GROUP BY nombre) k ON k.nombre = c.nombre
SET n.categoria_id = k.id_ok
WHERE n.categoria_id <> k.id_ok;

UPDATE productos p
JOIN categorias c ON c.id = p.categoria_id
JOIN (SELECT nombre, MIN(id) AS id_ok FROM categorias GROUP BY nombre) k ON k.nombre = c.nombre
SET p.categoria_id = k.id_ok
WHERE p.categoria_id <> k.id_ok;

DELETE c FROM categorias c
JOIN (SELECT nombre, MIN(id) AS id_ok FROM categorias GROUP BY nombre) k ON k.nombre = c.nombre
WHERE c.id <> k.id_ok;

SELECT id, nombre FROM categorias ORDER BY id;
