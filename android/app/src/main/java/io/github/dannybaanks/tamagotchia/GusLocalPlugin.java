package io.github.dannybaanks.tamagotchia;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.File;
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
        return new File(new File(getContext().getFilesDir(), "models"), name);
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
