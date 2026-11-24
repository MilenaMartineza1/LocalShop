# Compila el backend
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn -q -DskipTests package

# Imagen final: Java + MariaDB (base de datos) en un solo contenedor
FROM eclipse-temurin:17-jre
ENV TZ=America/Bogota
RUN apt-get update && apt-get install -y --no-install-recommends mariadb-server && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/target/localshop-backend.jar app.jar
COPY web ./web
COPY SETUP_COMPLETO.sql setup.sql
COPY docker-entrypoint.sh .
RUN chmod +x docker-entrypoint.sh
ENV WEB_DIR=/app/web DB_URL="jdbc:mysql://127.0.0.1:3306/Local_Shop?useSSL=false&serverTimezone=America/Bogota&allowPublicKeyRetrieval=true" DB_USER=root DB_PASSWORD=localshop
EXPOSE 8080
CMD ["./docker-entrypoint.sh"]
