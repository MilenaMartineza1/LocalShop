package com.localshop.util;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.security.spec.InvalidKeySpecException;
import java.util.Base64;
import java.util.Set;

/**
 * Manejo de contraseñas.
 *
 * Formato guardado: pbkdf2$iteraciones$salt$hash (PBKDF2-HMAC-SHA256 con salt aleatorio por usuario).
 * Las cuentas antiguas con SHA-256 simple siguen funcionando y se migran solas al formato nuevo
 * la próxima vez que inician sesión.
 */
public final class PasswordUtil {

    private static final String PREFIX = "pbkdf2";
    private static final int ITERACIONES = 120_000;
    private static final int SALT_BYTES = 16;
    private static final int KEY_BITS = 256;
    private static final SecureRandom RNG = new SecureRandom();

    private static final Set<String> MUY_COMUNES = Set.of(
            "12345678", "123456789", "1234567890", "password", "password1", "qwerty123",
            "abc12345", "contraseña1", "contrasena1", "admin123", "iloveyou1", "localshop1");

    private PasswordUtil() {}

    public static String hash(String clave) {
        byte[] salt = new byte[SALT_BYTES];
        RNG.nextBytes(salt);
        byte[] derivada = derivar(clave, salt, ITERACIONES);
        Base64.Encoder b64 = Base64.getEncoder();
        return PREFIX + "$" + ITERACIONES + "$" + b64.encodeToString(salt) + "$" + b64.encodeToString(derivada);
    }

    public static boolean matches(String clave, String guardado) {
        if (clave == null || guardado == null) return false;
        if (!guardado.startsWith(PREFIX + "$")) {
            return MessageDigest.isEqual(sha256Hex(clave).getBytes(StandardCharsets.UTF_8),
                    guardado.getBytes(StandardCharsets.UTF_8));
        }
        String[] partes = guardado.split("\\$");
        if (partes.length != 4) return false;
        try {
            int iteraciones = Integer.parseInt(partes[1]);
            byte[] salt = Base64.getDecoder().decode(partes[2]);
            byte[] esperado = Base64.getDecoder().decode(partes[3]);
            return MessageDigest.isEqual(derivar(clave, salt, iteraciones), esperado);
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    /** True si el hash guardado es del formato viejo y conviene reemplazarlo. */
    public static boolean necesitaActualizar(String guardado) {
        return guardado == null || !guardado.startsWith(PREFIX + "$" + ITERACIONES + "$");
    }

    /**
     * Reglas mínimas para una contraseña nueva.
     * @return null si es válida; si no, el mensaje que se le muestra al usuario.
     */
    public static String validar(String clave, String correo) {
        if (clave == null || clave.length() < 8) return "La contraseña debe tener al menos 8 caracteres.";
        if (clave.length() > 72) return "La contraseña no puede superar los 72 caracteres.";
        if (clave.chars().noneMatch(Character::isLetter)) return "La contraseña debe incluir al menos una letra.";
        if (clave.chars().noneMatch(Character::isDigit)) return "La contraseña debe incluir al menos un número.";
        if (MUY_COMUNES.contains(clave.toLowerCase())) return "Esa contraseña es demasiado común. Elige una más difícil de adivinar.";
        if (correo != null && correo.contains("@")) {
            String usuario = correo.substring(0, correo.indexOf('@')).toLowerCase();
            if (usuario.length() >= 4 && clave.toLowerCase().contains(usuario)) {
                return "La contraseña no debe contener tu correo.";
            }
        }
        return null;
    }

    public static String sha256Hex(String texto) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(texto.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 no disponible", e);
        }
    }

    private static byte[] derivar(String clave, byte[] salt, int iteraciones) {
        try {
            PBEKeySpec spec = new PBEKeySpec(clave.toCharArray(), salt, iteraciones, KEY_BITS);
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        } catch (NoSuchAlgorithmException | InvalidKeySpecException e) {
            throw new IllegalStateException("PBKDF2 no disponible", e);
        }
    }

    /** Genera una cadena aleatoria segura en hexadecimal (para tokens). */
    public static String tokenAleatorio(int bytes) {
        byte[] b = new byte[bytes];
        RNG.nextBytes(b);
        StringBuilder sb = new StringBuilder(bytes * 2);
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }
}
