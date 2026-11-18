import SwiftUI
import UIKit
import WebKit

private let appURL = URL(string: "https://figurinhas-gabtavarez.vercel.app/")!
private let bg = UIColor(red: 11 / 255, green: 20 / 255, blue: 26 / 255, alpha: 1)

@main
struct FigurinhasApp: App {
    var body: some Scene {
        WindowGroup {
            WebContainer()
                .ignoresSafeArea()
                .background(Color(bg))
                .preferredColorScheme(.dark)
        }
    }
}

struct WebContainer: UIViewRepresentable {
    func makeCoordinator() -> WhatsAppBridge { WhatsAppBridge() }

    func makeUIView(context: Context) -> WKWebView {
        let ucc = WKUserContentController()
        ucc.add(context.coordinator, name: "wa")
        ucc.add(context.coordinator, name: "copy")
        ucc.addUserScript(WKUserScript(source: "window.FIG_NATIVE = true;", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let cfg = WKWebViewConfiguration()
        cfg.userContentController = ucc
        cfg.websiteDataStore = .default()

        let wv = WKWebView(frame: .zero, configuration: cfg)
        wv.isOpaque = false
        wv.backgroundColor = bg
        wv.scrollView.backgroundColor = bg
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        wv.allowsBackForwardNavigationGestures = true
        context.coordinator.webView = wv
        wv.load(URLRequest(url: appURL))
        return wv
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

struct BridgeError: Error { let message: String }

final class WhatsAppBridge: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?

    private static let pasteboardType = "net.whatsapp.third-party.sticker-pack"

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        if message.name == "copy" {
            Task { await self.copySticker(body) }
        } else {
            Task { await self.addPack(body) }
        }
    }

    @MainActor
    private func status(_ ok: Bool, _ msg: String) {
        let arg = (try? JSONSerialization.data(withJSONObject: [msg])).flatMap { String(data: $0, encoding: .utf8) } ?? "[\"\"]"
        webView?.evaluateJavaScript("window.__waStatus && window.__waStatus(\(ok ? "true" : "false"), \(arg)[0])")
    }

    private func fetch(_ url: URL) async throws -> Data {
        var lastError: Error = BridgeError(message: "download")
        for _ in 0..<3 {
            do {
                let (data, resp) = try await URLSession.shared.data(from: url)
                if (resp as? HTTPURLResponse)?.statusCode == 200, !data.isEmpty { return data }
                lastError = BridgeError(message: "http")
            } catch { lastError = error }
        }
        throw lastError
    }

    // WebP animado: chunk VP8X com o bit de animação ligado
    private func isAnimatedWebP(_ d: Data) -> Bool {
        guard d.count > 21 else { return false }
        let b = [UInt8](d.prefix(21))
        return b[12] == 0x56 && b[13] == 0x50 && b[14] == 0x38 && b[15] == 0x58 && (b[20] & 0x02) != 0
    }

    private func pngData(from data: Data, side: CGFloat?) -> Data? {
        guard let img = UIImage(data: data) else { return nil }
        guard let side = side else { return img.pngData() }
        let fmt = UIGraphicsImageRendererFormat()
        fmt.scale = 1
        fmt.opaque = false
        let out = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: fmt).image { _ in
            let s = img.size
            let k = min(side / max(s.width, 1), side / max(s.height, 1))
            let w = s.width * k, h = s.height * k
            img.draw(in: CGRect(x: (side - w) / 2, y: (side - h) / 2, width: w, height: h))
        }
        return out.pngData()
    }

    private func copySticker(_ p: [String: Any]) async {
        guard let s = p["url"] as? String, let u = URL(string: s) else { return }
        do {
            let data = try await fetch(u)
            guard let png = pngData(from: data, side: nil) else { throw BridgeError(message: "imagem") }
            await MainActor.run { UIPasteboard.general.setData(png, forPasteboardType: "public.png") }
            await status(true, "Copiada! Cole no chat do WhatsApp")
        } catch {
            await status(false, "Não consegui baixar essa figurinha")
        }
    }

    private func addPack(_ p: [String: Any]) async {
        guard let trayString = p["tray"] as? String, let trayURL = URL(string: trayString),
              let items = p["stickers"] as? [[String: Any]], items.count >= 3, items.count <= 30 else {
            await status(false, "Pacote inválido para o WhatsApp")
            return
        }
        let canOpen = await MainActor.run { UIApplication.shared.canOpenURL(URL(string: "whatsapp://")!) }
        guard canOpen else {
            await status(false, "WhatsApp não encontrado neste iPhone")
            return
        }
        await status(true, "Baixando \(items.count) figurinhas…")
        do {
            let raw = (p["raw"] as? Bool) ?? false
            var tray = try await fetch(trayURL)
            if raw {
                guard let t = pngData(from: tray, side: 96) else { throw BridgeError(message: "tray") }
                tray = t
            }
            var images = [Data?](repeating: nil, count: items.count)
            try await withThrowingTaskGroup(of: (Int, Data).self) { group in
                for (i, item) in items.enumerated() {
                    guard let s = item["url"] as? String, let u = URL(string: s) else { continue }
                    group.addTask { (i, try await self.fetch(u)) }
                }
                for try await (i, data) in group { images[i] = data }
            }
            let animated = raw && images.compactMap { $0 }.contains { isAnimatedWebP($0) }
            var stickers: [[String: Any]] = []
            for (i, item) in items.enumerated() {
                guard let data = images[i] else { continue }
                if raw {
                    // WhatsApp: estático <= 100 KB, animado <= 500 KB, nunca misturado
                    if isAnimatedWebP(data) != animated { continue }
                    if data.count > (animated ? 500 : 100) * 1024 { continue }
                }
                let emojis = Array(((item["emojis"] as? [String]) ?? []).prefix(3))
                stickers.append(["image_data": data.base64EncodedString(), "emojis": emojis])
            }
            guard stickers.count >= 3 else { throw BridgeError(message: "poucas figurinhas") }

            var pack: [String: Any] = [
                "identifier": (p["identifier"] as? String) ?? UUID().uuidString,
                "name": (p["name"] as? String) ?? "Figurinhas",
                "publisher": (p["publisher"] as? String) ?? "Figurinhas",
                "tray_image": tray.base64EncodedString(),
                "stickers": stickers,
            ]
            if animated { pack["animated_sticker_pack"] = true }
            let data = try JSONSerialization.data(withJSONObject: pack)

            await MainActor.run {
                UIPasteboard.general.setItems(
                    [[Self.pasteboardType: data]],
                    options: [.localOnly: true, .expirationDate: Date(timeIntervalSinceNow: 60)]
                )
                UIApplication.shared.open(URL(string: "whatsapp://stickerPack")!, options: [:]) { ok in
                    Task { await self.status(ok, ok ? "Abrindo o WhatsApp…" : "Não consegui abrir o WhatsApp") }
                }
            }
        } catch {
            await status(false, "Falha ao baixar as figurinhas. Tente de novo.")
        }
    }
}
