# LocalShop - Backend (Java puro + JDBC + MySQL)

## Requisitos
Java 17+, Maven, MySQL 8 con la base `Local_Shop`.

## Base de datos
- Instalacion nueva: ejecutar `SETUP_COMPLETO.sql` completo.
- Base ya existente: ejecutar una sola vez `MIGRACION_BD_EXISTENTE.sql`
  (agrega notas, datos de entrega, `password_resets`, insumos, direcciones, el estado `cancelado`,
  quita imagenes externas y restablece las cuentas de prueba).
- Categorias repetidas por haber corrido el SETUP dos veces: ejecutar `LIMPIAR_CATEGORIAS_DUPLICADAS.sql`.
- `SETUP_COMPLETO.sql` borra y recrea `Local_Shop`: usarlo solo para empezar de cero.

Credenciales de prueba (todas las cuentas del seed): clave `Cartagena.2026`
Ejemplos: `jose@hotmail.com` (cliente), cuentas de negocio listadas en `seed_data.sql`.

## Ejecutar
1. Configurar usuario y clave de MySQL en `src/main/resources` (o `Database.java`).
2. Ejecutar `com.localshop.Main` desde IntelliJ. Escucha en http://localhost:8080
3. Abrir el frontend (puerto 5500, por ejemplo con Live Server) en `index.html`.

## Seguridad
- Claves con PBKDF2-HMAC-SHA256 (120000 iteraciones, sal aleatoria). Los hashes SHA-256 antiguos se actualizan al iniciar sesion.
- Politica de clave: 8 a 72 caracteres, letra y numero, no comun, sin el usuario del correo.
- Sesion con token aleatorio (8 h) enviado como `Authorization: Bearer <token>`. El servidor toma el id del token, no del cliente.
- Limite de intentos: 5 fallos de login por 10 min; 3 solicitudes de recuperacion por 15 min.
- Roles: `cliente` y `negocio`. Cada endpoint exige el rol y comprueba que el recurso sea del usuario.

## Recuperar contrasena
`POST /api/auth/forgot {correo, rol}` y `POST /api/auth/reset {token, clave}`.
No hay SMTP: el enlace se imprime en la consola del backend
(`http://localhost:5500/reset.html?token=...`). Vence a los 30 min y es de un solo uso.
Se puede cambiar la URL base con la propiedad `app.front_url`.

## Endpoints principales
auth (login, register, forgot, reset, logout), usuarios (+ `/usuarios/{id}/password`),
carrito (con nota), pedidos (avanza pendiente -> enviado -> entregado; cliente o negocio pueden cancelar un pedido pendiente y el stock se devuelve),
insumos (+ `/insumos/movimientos`, solo negocio), direcciones (cliente),
promociones (automaticas y cupones; `POST /pedidos/cotizar` calcula el total con descuento),
publicidad (campanias con impresiones y clics; el pago es simulado),
negocios, productos (si ya tienen pedidos, eliminar los oculta con `activo = 0`), promociones, favoritos, reviews (`?recientes=N`; se califica al negocio, una vez por pedido entregado), categorias, configuracion.

## Sesiones
Cliente y negocio guardan su sesion por separado (`localshop_session_cliente` y `localshop_session_negocio`),
asi se pueden usar los dos perfiles a la vez en el mismo navegador.

## Un solo enlace para todo

El backend también sirve el frontend (carpeta `web/`), así que con el backend corriendo todo abre en `http://localhost:8080`.
Para compartirlo con un enlace público desde tu computador:

1. Corre `Main.java` en IntelliJ (MySQL activo).
2. En otra terminal: `cloudflared tunnel --url http://localhost:8080`
3. Copia el enlace `https://....trycloudflare.com` que aparece y ábrelo desde cualquier dispositivo.

El enlace funciona mientras el computador, MySQL, el backend y el túnel estén encendidos. Si editas el frontend, copia los cambios a `web/`.

## Publicar en la nube (sin dejar nada corriendo en tu computador)

El proyecto incluye `Dockerfile` y `docker-entrypoint.sh`: un solo contenedor con el backend Java y su base de datos MariaDB, que se carga sola con `SETUP_COMPLETO.sql` en cada arranque. En Render (plan gratis):

1. Sube la carpeta `localshop-backend` a un repositorio de GitHub (la raíz del repositorio debe tener `Dockerfile`, `pom.xml`, `src` y `web`).
2. En render.com: New > Web Service > conecta ese repositorio > Language: Docker > Instance type: Free.
3. Espera el despliegue (varios minutos la primera vez). Render te da un enlace `https://tu-app.onrender.com`.

Limitaciones del plan gratis:
- Tras 15 minutos sin visitas el servicio se duerme y la primera visita tarda cerca de un minuto en despertar. Ábrelo unos minutos antes de sustentar.
- Al dormirse o reiniciarse, los datos vuelven a los de prueba (pedidos nuevos y cambios se pierden).
