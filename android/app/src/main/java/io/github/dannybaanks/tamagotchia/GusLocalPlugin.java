package io.github.dannybaanks.tamagotchia;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.nio.ByteBuffer;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The creature's local brain on Android: loads a GGUF from the app's own models folder and
 * turns a composed chat into text. It holds no game state and cannot reach it: the web
 * layer sends strings and gets a string back, which still goes through the validator.
 *
 * Models are addressed by file name only, resolved inside filesDir/models: the web layer
 * cannot point the runtime at an arbitrary path.
 */
@CapacitorPlugin(name = "GusLocal")
public class GusLocalPlugin extends Plugin {
    private static final int MAX_TOKENS_CAP = 512;
    private static Throwable loadError;

    static {
        try {
            System.loadLibrary("tama_gus");
        } catch (Throwable t) {
            loadError = t;
        }
    }

    /** One model and one inference at a time. */
    private final ExecutorService lane = Executors.newSingleThreadExecutor();
    /** Copies of imported models: big and slow, kept off the inference lane. */
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private static final byte[] GGUF_MAGIC = { 'G', 'G', 'U', 'F' };
    /** Room left on the phone after a copy, so the game's own save never runs out of space. */
    private static final long SPACE_HEADROOM = 64L * 1024 * 1024;
    /** Same hosts as iSyCode Móvil's ModelStore: every hop of a download must stay on them. */
    private static final Set<String> ALLOWED_HOSTS = new HashSet<>(Arrays.asList(
        "huggingface.co", "us.aws.cdn.hf.co", "cdn-lfs.huggingface.co", "cas-bridge.xethub.hf.co"));
    /** Hugging Face, a pinned 40-hex revision, a bare file name. Nothing else is downloadable. */
    private static final Pattern SOURCE = Pattern.compile(
        "^https://huggingface\\.co/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+/resolve/[0-9a-f]{40}/([A-Za-z0-9._-]+\\.gguf)$");
    private static final long MAX_MODEL_BYTES = 8L * 1024 * 1024 * 1024;
    private final ExecutorService net = Executors.newSingleThreadExecutor();
    private volatile String downloading = null;
    private volatile boolean cancelDownload = false;
    private long handle = 0;
    private String loadedModel = null;

    static native long nativeCreate(byte[] path, int contextTokens);
    static native void nativeDestroy(long handle);
    static native void nativeCancel(long handle);
    static native byte[] nativeGenerate(long handle, byte[][] roles, byte[][] contents, int maxTokens);

    private boolean runtimeMissing(PluginCall call) {
        if (loadError == null) return false;
        call.reject("GUS local no está en este build: " + loadError.getMessage(), "RUNTIME_MISSING");
        return true;
    }

    private File modelFile(String name) {
        if (name == null || name.isEmpty() || name.contains("/") || name.contains("\\") || name.startsWith(".") || !name.endsWith(".gguf")) return null;
        return new File(modelsDir(), name);
    }

    private File modelsDir() {
        return new File(getContext().getFilesDir(), "models");
    }

    /** The installed models, by file name. */
    @PluginMethod
    public void listModels(PluginCall call) {
        JSArray list = new JSArray();
        File[] files = modelsDir().listFiles();
        if (files != null) {
            Arrays.sort(files);
            for (File f : files) {
                if (!f.isFile() || modelFile(f.getName()) == null) continue;
                JSObject m = new JSObject();
                m.put("model", f.getName());
                m.put("bytes", f.length());
                list.put(m);
            }
        }
        JSObject out = new JSObject();
        out.put("models", list);
        call.resolve(out);
    }

    /**
     * Lets the player pick a .gguf with the system file picker and copies it into the models
     * folder. Nothing is downloaded. The copy is hashed (platform SHA-256) and must start with
     * the GGUF magic, or it is discarded.
     */
    @PluginMethod
    public void importModel(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        startActivityForResult(call, intent, "importModelResult");
    }

    @ActivityCallback
    private void importModelResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) { call.reject("No se eligió ningún archivo.", "CANCELLED"); return; }
        String name = null;
        long size = -1;
        try (Cursor c = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int n = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int s = c.getColumnIndex(OpenableColumns.SIZE);
                if (n >= 0) name = c.getString(n);
                if (s >= 0 && !c.isNull(s)) size = c.getLong(s);
            }
        } catch (Exception ignored) {
            // fall through: no name means a bad model below
        }
        File target = modelFile(name);
        if (target == null) { call.reject("El archivo debe ser un modelo .gguf.", "BAD_MODEL"); return; }
        File dir = modelsDir();
        if (!dir.isDirectory() && !dir.mkdirs()) { call.reject("No pude crear la carpeta de modelos.", "IMPORT_FAILED"); return; }
        if (size > 0 && dir.getUsableSpace() < size + SPACE_HEADROOM) { call.reject("No hay espacio suficiente en el teléfono.", "NO_SPACE"); return; }
        final long expected = size;
        io.execute(() -> {
            File part = new File(dir, target.getName() + ".part");
            try (InputStream in = getContext().getContentResolver().openInputStream(uri);
                 OutputStream out = new FileOutputStream(part)) {
                if (in == null) throw new IllegalStateException("No pude abrir el archivo.");
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                byte[] buf = new byte[1 << 20];
                byte[] head = new byte[4];
                long total = 0;
                int read;
                while ((read = in.read(buf)) > 0) {
                    for (int i = 0; i < read && total + i < 4; i++) head[(int) total + i] = buf[i];
                    digest.update(buf, 0, read);
                    out.write(buf, 0, read);
                    total += read;
                }
                out.flush();
                if (total < 4 || !Arrays.equals(head, GGUF_MAGIC)) throw new IllegalArgumentException("El archivo no es un modelo GGUF.");
                if (expected > 0 && total != expected) throw new IllegalStateException("La copia quedó incompleta.");
                if (!part.renameTo(target)) throw new IllegalStateException("No pude guardar el modelo.");
                JSObject ok = new JSObject();
                ok.put("model", target.getName());
                ok.put("bytes", total);
                ok.put("sha256", hex(digest.digest()));
                call.resolve(ok);
            } catch (IllegalArgumentException e) {
                part.delete();
                call.reject(e.getMessage(), "BAD_MODEL");
            } catch (Throwable t) {
                part.delete();
                call.reject(t.getMessage() == null ? "No pude importar el modelo." : t.getMessage(), "IMPORT_FAILED");
            }
        });
    }

    /**
     * Downloads a pinned model from Hugging Face into the models folder, resuming a previous
     * partial file. Usable only after its size and SHA-256 match what the caller pinned; the
     * request carries nothing about the creature or the player.
     */
    @PluginMethod
    public void downloadModel(PluginCall call) {
        String url = call.getString("url");
        String sha256 = call.getString("sha256");
        Long bytes = call.getLong("bytes");
        Matcher m = url == null ? null : SOURCE.matcher(url);
        File target = m != null && m.matches() ? modelFile(m.group(1)) : null;
        if (target == null || sha256 == null || !sha256.matches("^[0-9a-f]{64}$") || bytes == null || bytes <= 0 || bytes > MAX_MODEL_BYTES) {
            call.reject("La descarga no corresponde a un modelo fijado de Hugging Face.", "BAD_SOURCE");
            return;
        }
        if (downloading != null) { call.reject("Ya hay una descarga de modelo en curso.", "BUSY"); return; }
        File dir = modelsDir();
        if (!dir.isDirectory() && !dir.mkdirs()) { call.reject("No pude crear la carpeta de modelos.", "DOWNLOAD_FAILED"); return; }
        File part = new File(dir, target.getName() + ".partial");
        long have = part.isFile() && part.length() < bytes ? part.length() : 0L;
        if (dir.getUsableSpace() < bytes - have + SPACE_HEADROOM) { call.reject("No hay espacio suficiente en el teléfono.", "NO_SPACE"); return; }
        downloading = target.getName();
        cancelDownload = false;
        net.execute(() -> {
            try {
                fetch(url, part, bytes, target.getName());
                if (cancelDownload) { call.reject("Descarga cancelada.", "CANCELLED"); return; }
                if (part.length() != bytes) throw new IllegalStateException("La descarga quedó incompleta (" + part.length() + " de " + bytes + " bytes). Reintenta para continuar.");
                String digest;
                try (InputStream in = new FileInputStream(part)) { digest = sha256Of(in); }
                if (!digest.equals(sha256)) {
                    part.delete();
                    call.reject("El SHA-256 no coincide. El modelo no se instaló.", "BAD_MODEL");
                    return;
                }
                target.delete();
                if (!part.renameTo(target)) throw new IllegalStateException("No pude guardar el modelo.");
                JSObject ok = new JSObject();
                ok.put("model", target.getName());
                ok.put("bytes", bytes);
                ok.put("sha256", digest);
                call.resolve(ok);
            } catch (SecurityException e) {
                call.reject(e.getMessage(), "BAD_SOURCE");
            } catch (Throwable t) {
                // The partial file stays: the next attempt resumes it.
                call.reject(cancelDownload ? "Descarga cancelada." : "Falló la descarga: " + (t.getMessage() == null ? "sin conexión" : t.getMessage()),
                    cancelDownload ? "CANCELLED" : "DOWNLOAD_FAILED");
            } finally {
                downloading = null;
            }
        });
    }

    /** Follows redirects by hand so every hop is checked against ALLOWED_HOSTS. */
    private void fetch(String source, File part, long expected, String name) throws Exception {
        long offset = part.isFile() && part.length() < expected ? part.length() : 0L;
        if (offset == 0L) part.delete();
        URL url = new URL(source);
        HttpURLConnection conn = null;
        for (int hop = 0; hop < 8; hop++) {
            if (!"https".equals(url.getProtocol()) || !ALLOWED_HOSTS.contains(url.getHost().toLowerCase())) {
                throw new SecurityException("La descarga salió de los hosts aprobados de Hugging Face.");
            }
            conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(30_000);
            conn.setReadTimeout(60_000);
            if (offset > 0) conn.setRequestProperty("Range", "bytes=" + offset + "-");
            int code = conn.getResponseCode();
            if (code >= 300 && code < 400) {
                String location = conn.getHeaderField("Location");
                conn.disconnect();
                if (location == null) throw new IllegalStateException("Redirección sin destino.");
                url = new URL(url, location);
                continue;
            }
            break;
        }
        if (conn == null) throw new IllegalStateException("Sin respuesta.");
        try {
            int code = conn.getResponseCode();
            if (code != 200 && code != 206) throw new IllegalStateException("El servidor respondió " + code + ".");
            boolean append = offset > 0 && code == 206;
            long written = append ? offset : 0L;
            long lastReport = -1;
            try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(part, append)) {
                byte[] buf = new byte[1 << 16];
                int read;
                while ((read = in.read(buf)) > 0) {
                    if (cancelDownload) return;
                    written += read;
                    if (written > expected) { part.delete(); throw new IllegalStateException("El archivo es más grande que el aprobado."); }
                    out.write(buf, 0, read);
                    if (lastReport < 0 || written - lastReport >= 4L * 1024 * 1024 || written == expected) {
                        lastReport = written;
                        JSObject progress = new JSObject();
                        progress.put("model", name);
                        progress.put("received", written);
                        progress.put("total", expected);
                        notifyListeners("downloadProgress", progress);
                    }
                }
            }
        } finally {
            conn.disconnect();
        }
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        if (downloading != null) cancelDownload = true;
        call.resolve();
    }

    /** Removes an installed model (and any partial download of it). Unloads it first if loaded. */
    @PluginMethod
    public void deleteModel(PluginCall call) {
        File file = modelFile(call.getString("model"));
        if (file == null) { call.reject("Nombre de modelo inválido.", "BAD_MODEL"); return; }
        if (file.getName().equals(downloading)) { call.reject("Ese modelo se está descargando.", "BUSY"); return; }
        lane.execute(() -> {
            if (file.getName().equals(loadedModel) && handle != 0 && loadError == null) { nativeDestroy(handle); handle = 0; loadedModel = null; }
            file.delete();
            new File(file.getParentFile(), file.getName() + ".partial").delete();
            call.resolve();
        });
    }

    private static String sha256Of(InputStream in) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buf = new byte[1 << 20];
        int read;
        while ((read = in.read(buf)) > 0) digest.update(buf, 0, read);
        return hex(digest.digest());
    }

    private static String hex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    @PluginMethod
    public void load(PluginCall call) {
        if (runtimeMissing(call)) return;
        String name = call.getString("model");
        int context = call.getInt("contextTokens", 2048);
        File file = modelFile(name);
        if (file == null) { call.reject("Nombre de modelo inválido.", "BAD_MODEL"); return; }
        if (!file.isFile()) { call.reject("El modelo no está instalado.", "MODEL_MISSING"); return; }
        lane.execute(() -> {
            try {
                if (handle != 0) { nativeDestroy(handle); handle = 0; loadedModel = null; }
                handle = nativeCreate(file.getAbsolutePath().getBytes(StandardCharsets.UTF_8), context);
                loadedModel = name;
                JSObject ok = new JSObject();
                ok.put("model", name);
                call.resolve(ok);
            } catch (Throwable t) {
                call.reject(t.getMessage() == null ? "No se pudo cargar el modelo." : t.getMessage(), "LOAD_FAILED");
            }
        });
    }

    @PluginMethod
    public void generate(PluginCall call) {
        if (runtimeMissing(call)) return;
        JSArray messages = call.getArray("messages");
        int maxTokens = Math.max(1, Math.min(call.getInt("maxTokens", 160), MAX_TOKENS_CAP));
        if (messages == null || messages.length() == 0) { call.reject("Faltan mensajes.", "BAD_REQUEST"); return; }
        final byte[][] roles = new byte[messages.length()][];
        final byte[][] contents = new byte[messages.length()][];
        try {
            for (int i = 0; i < messages.length(); i++) {
                JSONObject m = messages.getJSONObject(i);
                String role = m.getString("role");
                if (!role.equals("system") && !role.equals("user")) { call.reject("Rol inválido.", "BAD_REQUEST"); return; }
                roles[i] = role.getBytes(StandardCharsets.UTF_8);
                contents[i] = m.getString("content").getBytes(StandardCharsets.UTF_8);
            }
        } catch (Exception e) {
            call.reject("Mensajes mal formados.", "BAD_REQUEST");
            return;
        }
        lane.execute(() -> {
            if (handle == 0) { call.reject("No hay modelo cargado.", "NOT_LOADED"); return; }
            try {
                byte[] raw = nativeGenerate(handle, roles, contents, maxTokens);
                JSObject out = new JSObject();
                out.put("text", decodeLenient(raw));
                out.put("model", loadedModel);
                call.resolve(out);
            } catch (Throwable t) {
                call.reject(t.getMessage() == null ? "La inferencia local falló." : t.getMessage(), "GENERATE_FAILED");
            }
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        long h = handle;
        if (h != 0 && loadError == null) nativeCancel(h);
        call.resolve();
    }

    @PluginMethod
    public void unload(PluginCall call) {
        if (loadError != null) { call.resolve(); return; }
        lane.execute(() -> {
            if (handle != 0) { nativeDestroy(handle); handle = 0; loadedModel = null; }
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        lane.execute(() -> {
            if (handle != 0 && loadError == null) { nativeDestroy(handle); handle = 0; }
        });
        lane.shutdown();
        io.shutdownNow();
        cancelDownload = true;
        net.shutdownNow();
    }

    /** Output can end mid code point when max tokens is hit: replace, never throw. */
    static String decodeLenient(byte[] raw) {
        if (raw == null) return "";
        CharsetDecoder decoder = StandardCharsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPLACE)
            .onUnmappableCharacter(CodingErrorAction.REPLACE);
        try {
            return decoder.decode(ByteBuffer.wrap(raw)).toString();
        } catch (Exception e) {
            return "";
        }
    }
}
