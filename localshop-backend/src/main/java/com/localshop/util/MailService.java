package com.localshop.util;

/**
 * Envío de correos.
 *
 * El proyecto no tiene servidor SMTP configurado, así que el "correo" se imprime en la consola del backend
 * (la de IntelliJ). Para producción se reemplaza el cuerpo de {@link #enviar} por un proveedor real
 * (SMTP, SendGrid, etc.) sin tocar el resto del código.
 */
public final class MailService {

    private MailService() {}

    public static void enviar(String para, String asunto, String cuerpo) {
        System.out.println("\n----- CORREO SIMULADO (no hay SMTP configurado) -----");
        System.out.println("Para:    " + para);
        System.out.println("Asunto:  " + asunto);
        System.out.println(cuerpo);
        System.out.println("-----------------------------------------------------\n");
    }
}
