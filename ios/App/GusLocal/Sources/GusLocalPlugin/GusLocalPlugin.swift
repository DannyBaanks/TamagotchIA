import Foundation
import Capacitor
import GUSBridge

/// The creature's local brain on iOS: loads a GGUF from the app's own models folder and
/// turns a composed chat into text. It holds no game state and cannot reach it: the web
/// layer sends strings and gets a string back, which still goes through the validator.
///
/// Models are addressed by file name only, resolved inside Application Support/models:
/// the web layer cannot point the runtime at an arbitrary path.
@objc(GusLocalPlugin)
public class GusLocalPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GusLocalPlugin"
    public let jsName = "GusLocal"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "load", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "generate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unload", returnType: CAPPluginReturnPromise),
    ]

    private static let maxTokensCap = 512
    /// One model and one inference at a time.
    private let lane = DispatchQueue(label: "io.github.dannybaanks.tamagotchia.gus-local")
    private var context: OpaquePointer?
    private var loadedModel: String?

    deinit {
        if let context { gus_llama_destroy(context) }
    }

    static func modelURL(named name: String) -> URL? {
        guard !name.isEmpty, !name.contains("/"), !name.contains("\\"), !name.hasPrefix("."), name.hasSuffix(".gguf"),
              let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        return support.appendingPathComponent("models", isDirectory: true).appendingPathComponent(name)
    }

    @objc func load(_ call: CAPPluginCall) {
        guard let name = call.getString("model"), let url = Self.modelURL(named: name) else {
            call.reject("Nombre de modelo inválido.", "BAD_MODEL"); return
        }
        guard FileManager.default.fileExists(atPath: url.path) else {
            call.reject("El modelo no está instalado.", "MODEL_MISSING"); return
        }
        let contextTokens = UInt32(max(512, min(call.getInt("contextTokens") ?? 2048, 4096)))
        lane.async {
            if let old = self.context { gus_llama_destroy(old); self.context = nil; self.loadedModel = nil }
            var error = [CChar](repeating: 0, count: 512)
            guard let created = gus_llama_create(url.path, contextTokens, &error, error.count) else {
                call.reject(String(cString: error).isEmpty ? "No se pudo cargar el modelo." : String(cString: error), "LOAD_FAILED")
                return
            }
            self.context = created
            self.loadedModel = name
            call.resolve(["model": name])
        }
    }

    @objc func generate(_ call: CAPPluginCall) {
        guard let raw = call.getArray("messages", JSObject.self), !raw.isEmpty else {
            call.reject("Faltan mensajes.", "BAD_REQUEST"); return
        }
        var chat: [(role: String, content: String)] = []
        for item in raw {
            guard let role = item["role"] as? String, role == "system" || role == "user",
                  let content = item["content"] as? String else {
                call.reject("Mensajes mal formados.", "BAD_REQUEST"); return
            }
            chat.append((role, content))
        }
        let maxTokens = UInt32(max(1, min(call.getInt("maxTokens") ?? 160, Self.maxTokensCap)))
        lane.async {
            guard let context = self.context else { call.reject("No hay modelo cargado.", "NOT_LOADED"); return }
            // C strings are UTF-8; they live until the call returns.
            let cStrings = chat.flatMap { [strdup($0.role), strdup($0.content)] }
            defer { cStrings.forEach { free($0) } }
            var messages = (0..<chat.count).map { index in
                GUSChatMessage(role: UnsafePointer(cStrings[index * 2]), content: UnsafePointer(cStrings[index * 2 + 1]))
            }
            var sampling = gus_llama_default_chat_sampling()
            var error = [CChar](repeating: 0, count: 512)
            guard let text = gus_llama_generate_chat_sampled(context, &messages, messages.count, nil, maxTokens,
                                                             &sampling, nil, &error, error.count) else {
                call.reject(String(cString: error).isEmpty ? "La inferencia local falló." : String(cString: error), "GENERATE_FAILED")
                return
            }
            // String(cString:) repairs invalid UTF-8 (output can end mid code point) instead of failing.
            let result = String(cString: text)
            gus_llama_free_text(text)
            call.resolve(["text": result, "model": self.loadedModel ?? ""])
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        if let context { gus_llama_cancel(context) }
        call.resolve()
    }

    @objc func unload(_ call: CAPPluginCall) {
        lane.async {
            if let context = self.context { gus_llama_destroy(context); self.context = nil; self.loadedModel = nil }
            call.resolve()
        }
    }
}

/// Registers the app's own plugins before the web app starts.
open class TamaBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(GusLocalPlugin())
    }
}
