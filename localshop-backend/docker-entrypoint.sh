#!/bin/bash
# Arranca MariaDB, carga la base con los datos de prueba y luego el backend.
mkdir -p /run/mysqld && chown mysql:mysql /run/mysqld
# Ajustes de memoria bajos: el plan gratis de la nube ofrece 512 MB en total
mysqld_safe --user=mysql --bind-address=127.0.0.1 --innodb-buffer-pool-size=32M --performance-schema=OFF --max-connections=30 >/dev/null 2>&1 &

for i in $(seq 1 60); do
  mariadb -uroot -e "select 1" >/dev/null 2>&1 && break
  sleep 1
done

mariadb -uroot -e "ALTER USER 'root'@'localhost' IDENTIFIED BY '${DB_PASSWORD}'; FLUSH PRIVILEGES;" 2>/dev/null
mariadb -uroot -p"${DB_PASSWORD}" --default-character-set=utf8mb4 < /app/setup.sql

exec java -Xmx160m -Duser.timezone=America/Bogota -jar /app/app.jar
