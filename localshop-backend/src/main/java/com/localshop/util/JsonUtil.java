package com.localshop.util;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class JsonUtil {

    public static String toJson(Object obj) {
        StringBuilder sb = new StringBuilder();
        write(obj, sb);
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private static void write(Object obj, StringBuilder sb) {
        if (obj == null) {
            sb.append("null");
        } else if (obj instanceof Map) {
            sb.append("{");
            boolean first = true;
            for (Map.Entry<String, Object> e : ((Map<String, Object>) obj).entrySet()) {
                if (!first) sb.append(",");
                first = false;
                sb.append(quote(e.getKey())).append(":");
                write(e.getValue(), sb);
            }
            sb.append("}");
        } else if (obj instanceof List) {
            sb.append("[");
            boolean first = true;
            for (Object item : (List<?>) obj) {
                if (!first) sb.append(",");
                first = false;
                write(item, sb);
            }
            sb.append("]");
        } else if (obj instanceof Number || obj instanceof Boolean) {
            sb.append(obj.toString());
        } else {
            sb.append(quote(obj.toString()));
        }
    }

    private static String quote(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
                }
            }
        }
        return sb.append("\"").toString();
    }

    /**
     * Lee un objeto JSON plano ({"clave":"texto","otra":123}). Soporta comillas escapadas, saltos de línea
     * y caracteres unicode dentro de los textos. Los valores null se omiten del resultado.
     */
    public static Map<String, String> parseFlatObject(String json) {
        Map<String, String> result = new LinkedHashMap<>();
        if (json == null) return result;
        int n = json.length();
        int[] pos = {skipWs(json, 0)};
        if (pos[0] >= n || json.charAt(pos[0]) != '{') return result;
        pos[0]++;

        while (true) {
            pos[0] = skipWs(json, pos[0]);
            if (pos[0] >= n) break;
            char c = json.charAt(pos[0]);
            if (c == '}') break;
            if (c == ',') { pos[0]++; continue; }
            if (c != '"') break;

            String key = readString(json, pos);
            pos[0] = skipWs(json, pos[0]);
            if (pos[0] >= n || json.charAt(pos[0]) != ':') break;
            pos[0]++;
            pos[0] = skipWs(json, pos[0]);
            if (pos[0] >= n) break;

            if (json.charAt(pos[0]) == '"') {
                result.put(key, readString(json, pos));
            } else {
                int start = pos[0];
                while (pos[0] < n && ",}".indexOf(json.charAt(pos[0])) < 0) pos[0]++;
                String raw = json.substring(start, pos[0]).trim();
                if (!raw.equals("null")) result.put(key, raw);
            }
        }
        return result;
    }

    private static int skipWs(String s, int i) {
        while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++;
        return i;
    }

    /** Lee un texto JSON que empieza en pos[0] (en la comilla de apertura) y deja pos[0] después de la comilla de cierre. */
    private static String readString(String s, int[] pos) {
        StringBuilder sb = new StringBuilder();
        int i = pos[0] + 1;
        while (i < s.length()) {
            char c = s.charAt(i++);
            if (c == '"') break;
            if (c != '\\' || i >= s.length()) { sb.append(c); continue; }
            char e = s.charAt(i++);
            switch (e) {
                case 'n' -> sb.append('\n');
                case 'r' -> sb.append('\r');
                case 't' -> sb.append('\t');
                case 'b' -> sb.append('\b');
                case 'f' -> sb.append('\f');
                case 'u' -> {
                    if (i + 4 <= s.length()) {
                        try {
                            sb.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
                            i += 4;
                        } catch (NumberFormatException ex) {
                            sb.append("\\u");
                        }
                    }
                }
                default -> sb.append(e);
            }
        }
        pos[0] = i;
        return sb.toString();
    }
}
