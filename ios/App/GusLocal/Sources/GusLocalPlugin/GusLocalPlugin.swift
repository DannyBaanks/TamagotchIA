import Foundation
import Capacitor
import CryptoKit
import GUSBridge
import UIKit
import UniformTypeIdentifiers

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
        CAPPluginMethod(name: "listModels", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "importModel", returnType: CAPPluginReturnPromise),
    ]

    private static let maxTokensCap = 512
    /// One model and one inference at a time.
    private let lane = DispatchQueue(label: "io.github.dannybaanks.tamagotchia.gus-local")
    private var context: OpaquePointer?
    private var loadedModel: String?
    /** Copies of imported models: big and slow, kept off the inference lane. */
    private let io = DispatchQueue(label: "io.github.dannybaanks.tamagotchia.gus-import")
    private var pendingImport: CAPPluginCall?
    /** Room left on the phone after a copy, so the game's own save never runs out of space. */
    private static let spaceHeadroom: Int64 = 64 * 1024 * 1024

    deinit {
        if let context { gus_llama_destroy(context) }
    }

    static func modelsDirectory() -> URL? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent("models", isDirectory: true)
    }

    static func modelURL(named name: String) -> URL? {
        guard !name.isEmpty, !name.contains("/"), !name.contains("\\"), !name.hasPrefix("."), name.hasSuffix(".gguf"),
              let dir = modelsDirectory() else { return nil }
        return dir.appendingPathComponent(name)
    }

    /// The installed models, by file name.
    @objc func listModels(_ call: CAPPluginCall) {
        guard let dir = Self.modelsDirectory(),
              let names = try? FileManager.default.contentsOfDirectory(atPath: dir.path) else {
            call.resolve(["models": []]); return
        }
        let models: [JSObject] = names.sorted().compactMap { name in
            guard let url = Self.modelURL(named: name),
                  let size = (try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? NSNumber else { return nil }
            return ["model": name, "bytes": size.intValue]
        }
        call.resolve(["models": models])
    }

    /// Lets the player pick a .gguf with the system document picker and copies it into the
    /// models folder. Nothing is downloaded. The copy is hashed (CryptoKit SHA-256) and must
    /// start with the GGUF magic, or it is discarded.
    @objc func importModel(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else { call.reject("No hay ventana para el selector.", "IMPORT_FAILED"); return }
            self.pendingImport?.reject("Se abrió otro selector.", "CANCELLED")
            self.pendingImport = call
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.data], asCopy: true)
            picker.allowsMultipleSelection = false
            picker.delegate = self
            presenter.present(picker, animated: true)
        }
    }

    fileprivate func finishImport(from source: URL?) {
        guard let call = pendingImport else { return }
        pendingImport = nil
        guard let source else { call.reject("No se eligió ningún archivo.", "CANCELLED"); return }
        guard let target = Self.modelURL(named: source.lastPathComponent), let dir = Self.modelsDirectory() else {
            try? FileManager.default.removeItem(at: source)
            call.reject("El archivo debe ser un modelo .gguf.", "BAD_MODEL"); return
        }
        io.async {
            // asCopy: the picker handed us a temporary copy; it is ours to clean up.
            defer { try? FileManager.default.removeItem(at: source) }
            let part = dir.appendingPathComponent(target.lastPathComponent + ".part")
            do {
                try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                let size = ((try? FileManager.default.attributesOfItem(atPath: source.path))?[.size] as? NSNumber)?.int64Value ?? 0
                if let free = (try? dir.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]))?.volumeAvailableCapacityForImportantUsage,
                   size > 0, free < size + Self.spaceHeadroom {
                    call.reject("No hay espacio suficiente en el teléfono.", "NO_SPACE"); return
                }
                FileManager.default.createFile(atPath: part.path, contents: nil)
                let input = try FileHandle(forReadingFrom: source)
                let output = try FileHandle(forWritingTo: part)
                defer { try? input.close(); try? output.close() }
                var hasher = SHA256()
                var head = Data()
                var total: Int64 = 0
                while true {
                    let chunk = try autoreleasepool { try input.read(upToCount: 1 << 20) ?? Data() }
                    if chunk.isEmpty { break }
                    if head.count < 4 { head.append(chunk.prefix(4 - head.count)) }
                    hasher.update(data: chunk)
                    try output.write(contentsOf: chunk)
                    total += Int64(chunk.count)
                }
                try output.synchronize()
                try output.close()
                guard head == Data("GGUF".utf8) else {
                    try? FileManager.default.removeItem(at: part)
                    call.reject("El archivo no es un modelo GGUF.", "BAD_MODEL"); return
                }
                _ = try? FileManager.default.removeItem(at: target)
                try FileManager.default.moveItem(at: part, to: target)
                var values = URLResourceValues()
                values.isExcludedFromBackup = true // a re-importable model, not player data
                var stored = target
                try? stored.setResourceValues(values)
                let sha = hasher.finalize().map { String(format: "%02x", $0) }.joined()
                call.resolve(["model": target.lastPathComponent, "bytes": Int(total), "sha256": sha])
            } catch {
                try? FileManager.default.removeItem(at: part)
                call.reject(error.localizedDescription, "IMPORT_FAILED")
            }
        }
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

extension GusLocalPlugin: UIDocumentPickerDelegate {
    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        finishImport(from: urls.first)
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        finishImport(from: nil)
    }
}

/// Registers the app's own plugins before the web app starts.
open class TamaBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(GusLocalPlugin())
    }
}
