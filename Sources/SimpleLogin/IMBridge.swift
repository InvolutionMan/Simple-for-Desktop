import Foundation
import WebKit

/// stderr 无缓冲，便于重定向后立刻看到日志。
func dbg(_ text: String) {
    FileHandle.standardError.write(Data(("[\(Date().timeIntervalSince1970.rounded())] " + text + "\n").utf8))
}

/// 环信 IM 桥：在隐藏的 WKWebView 里跑官方 Web SDK。
///
/// 为什么这么绕：环信没有 macOS 原生 SDK，Flutter 端用的是 iOS 的 HyphenateSDK。
/// Web SDK 需要浏览器环境（WebSocket / IndexedDB / document），所以在 WebView 里跑，
/// 用 WKScriptMessageHandler 把消息回传给 Swift。
@MainActor
final class IMBridge: NSObject, ObservableObject {

    struct Message: Identifiable {
        let id: String
        let from: String
        let text: String
    }

    @Published private(set) var status = "未连接"
    @Published private(set) var messages: [Message] = []

    /// 环信 AppKey（公开标识，不含密码；密码从官方客户端 plist 读取）。
    static let appKey = "1184170304115842#summer"

    private var webView: WKWebView?
    private var groupID = ""

    func connect(groupID: String) {
        guard !groupID.isEmpty, groupID != self.groupID else { return }
        self.groupID = groupID

        guard let credentials = IMCredentials.load() else {
            status = "未找到环信账号"
            return
        }

        Task { [weak self] in
            guard let self else { return }
            let token = await Self.fetchToken(user: credentials.imID, password: credentials.password)
            guard let token else {
                self.status = "环信登录失败"
                return
            }
            self.loadWebView(user: credentials.imID, token: token, groupID: groupID)
        }
    }

    // MARK: - WebView

    private func loadWebView(user: String, token: String, groupID: String) {
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "log")
        config.userContentController.add(self, name: "msg")

        let web = WKWebView(frame: .zero, configuration: config)
        web.isHidden = true
        self.webView = web

        let html = Self.makeHTML(user: user, token: token, groupID: groupID)
        web.loadHTMLString(html, baseURL: URL(string: "https://localhost/"))
        status = "连接中"
    }

    private static func makeHTML(user: String, token: String, groupID: String) -> String {
        let sdk = Self.sdkSource()

        return """
        <!doctype html><html><head><meta charset="utf-8"></head><body>
        <script>
        window.onerror = function(m, src, line, col, err){
          try { window.webkit.messageHandlers.log.postMessage("SDK-ERR " + m + " @" + line + ":" + col); } catch (e) {}
        };
        </script>
        <script>\(sdk)</script>
        <script>
        function log(m){ window.webkit.messageHandlers.log.postMessage(String(m)); }
        try {
          const conn = new websdk.connection({ appKey: "\(Self.appKey)", url: "https://a1.easemob.com", isHttpDNS: true });
          window.__conn = conn;
          conn.addEventHandler("bridge", {
            onConnected: () => log("connected"),
            onDisconnected: (e) => log("disconnected " + (e && e.reason || "")),
            onMessage: (m) => {
              const d = (m && m.message) || m || {};
              const body = d.msg || (d.body && d.body.content) || "";
              window.webkit.messageHandlers.msg.postMessage(JSON.stringify({ id: d.id || "", from: d.from || "", text: String(body) }));
            }
          });
          conn.open({ user: "\(user)", accessToken: "\(token)" })
            .then(() => { log("open ok"); return conn.joinChatRoom({ roomId: "\(groupID)" }); })
            .then(() => log("joined chatroom \(groupID)"))
            .catch(e => log("ERR " + (e && (e.message || e.type || JSON.stringify(e)))));
        } catch (e) { log("EX " + (e && e.message)); }
        if (typeof websdk === "undefined") log("websdk undefined after load, keys=" + Object.keys(window).slice(0,8));
        </script></body></html>
        """
    }


    /// 裸可执行文件下 `Bundle.module` 不一定能解析到资源包，逐个候选路径兜底。
    private static func sdkSource() -> String {
        var candidates: [URL] = []
        if let url = Bundle.module.url(forResource: "Easemob-chat", withExtension: "js") {
            candidates.append(url)
        }
        let exeDir = Bundle.main.bundleURL
        candidates.append(exeDir.appendingPathComponent("SimpleLogin_SimpleLogin.bundle/Contents/Resources/Easemob-chat.js"))
        candidates.append(exeDir.appendingPathComponent("Resources/Easemob-chat.js"))
        let bundleDir = Bundle.main.bundleURL.deletingLastPathComponent()
        candidates.append(bundleDir.appendingPathComponent("SimpleLogin_SimpleLogin.bundle/Contents/Resources/Easemob-chat.js"))
        candidates.append(bundleDir.appendingPathComponent("SimpleLogin_SimpleLogin.bundle/Easemob-chat.js"))

        for url in candidates {
            if let text = try? String(contentsOf: url, encoding: .utf8), text.count > 1000 {
                dbg("[im] sdk loaded from \(url.path)")
                return text
            }
        }
        dbg("[im] sdk NOT found, tried \(candidates.map(\.path))")
        return ""
    }


    /// SDK v4 的 joinGroup 参数校验有问题，改用 REST 入群：
    /// POST /chatgroups/{group_id}/users/{username}
    private static func joinGroup(token: String, groupID: String, user: String) async {
        let url = URL(string: "https://a1.easemob.com/1184170304115842/summer/chatrooms/\(groupID)/users/\(user)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let (data, response) = try? await URLSession.shared.data(for: request) {
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            dbg("[im] join group \(groupID) → \(code) \(String(data: data, encoding: .utf8)?.prefix(80) ?? "")")
        }
    }

    // MARK: - 令牌

    private static func fetchToken(user: String, password: String) async -> String? {
        let url = URL(string: "https://a1.easemob.com/1184170304115842/summer/token")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: String] = ["grant_type": "password", "username": user, "password": password]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        guard let (data, _) = try? await URLSession.shared.data(for: request),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let token = json["access_token"] as? String
        else { return nil }
        return token
    }
}

extension IMBridge: WKScriptMessageHandler {
    nonisolated func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        MainActor.assumeIsolated {
            switch message.name {
            case "log":
                let text = String(describing: message.body)
                status = text
                dbg("[im] \(text)")
            case "msg":
                guard let raw = message.body as? String,
                      let data = raw.data(using: .utf8),
                      let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                else { return }
                let item = Message(
                    id: dict["id"] as? String ?? UUID().uuidString,
                    from: dict["from"] as? String ?? "",
                    text: dict["text"] as? String ?? ""
                )
                messages.append(item)
                dbg("[im] msg from \(item.from): \(item.text)")
            default:
                break
            }
        }
    }
}

/// 从官方客户端的 plist 里读环信账号，避免把凭据写进仓库。
enum IMCredentials {
    struct Account {
        let imID: String
        let password: String
    }

    static func load() -> Account? {
        let path = NSHomeDirectory()
            + "/Library/Containers/cn.imsummer.simple/Data/Library/Preferences/cn.imsummer.simple.plist"
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
              let plist = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any],
              let raw = plist["flutter.UserInfo"] as? String,
              let json = try? JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any],
              let imID = json["im_id"] as? String,
              let password = json["im_password"] as? String
        else { return nil }
        return Account(imID: imID, password: password)
    }
}
