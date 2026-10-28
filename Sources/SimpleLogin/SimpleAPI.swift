import Foundation

/// Simple 的短信登录三步。只依赖 Foundation，不引入第三方库。
///
///   1. GET  /api/v3/auths?provider=wechat&uid=&token=   → auth_token（带 auth_id）
///   2. POST /api/v3/phone_messages/deliveries           → 201 {"id": phone_message_id}
///   3. POST /api/v3/phone_messages/verifications        → 201 用户对象 + token
///
/// 第 1 步用来换一个 auth 身份的令牌：服务端读的是 JWT 里的 `auth_id`，
/// 而普通会话 JWT 里只有 `user_id`，直接拿会话令牌会被判成 auth 不存在。
struct SimpleAPI {

    let baseURL: URL

    init(baseURL: URL = URL(string: "https://simple.imsummer.cn")!) {
        self.baseURL = baseURL
    }

    // MARK: - 三步

    func authToken() async throws -> String {
        var components = URLComponents(
            url: baseURL.appendingPathComponent("api/v3/auths"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = [
            URLQueryItem(name: "provider", value: "wechat"),
            URLQueryItem(name: "uid", value: "mac-" + UUID().uuidString.prefix(8).lowercased()),
            URLQueryItem(name: "token", value: "mac"),
        ]
        let json = try await send(components.url!, method: "GET", body: nil)
        guard let token = json["auth_token"] as? String, !token.isEmpty else {
            throw APIError.invalidResponse
        }
        return token
    }

    func requestCode(phone: String, authToken: String) async throws -> String {
        let url = baseURL.appendingPathComponent("api/v3/phone_messages/deliveries")
        let body: [String: Any] = [
            "auth_token": authToken,
            "area_code": "+86",
            "phone": phone,
        ]
        let json = try await send(url, method: "POST", body: body)
        guard let id = json["id"] as? String, !id.isEmpty else {
            throw APIError.invalidResponse
        }
        return id
    }

    func verify(messageID: String, code: String) async throws -> Verification {
        let url = baseURL.appendingPathComponent("api/v3/phone_messages/verifications")
        let body: [String: Any] = [
            "phone_message_id": messageID,
            "code": code,
        ]
        let json = try await send(url, method: "POST", body: body)
        guard let token = json["token"] as? String, !token.isEmpty else {
            throw APIError.invalidResponse
        }
        return Verification(
            token: token,
            userID: json["id"] as? String,
            nickname: json["nickname"] as? String
        )
    }

    /// 用会话令牌打一次受保护接口，确认它真的可用。
    func validate(token: String) async throws -> Bool {
        let url = baseURL.appendingPathComponent("api/v3/current_user")
        do {
            _ = try await send(url, method: "GET", body: nil, bearer: token)
            return true
        } catch let error as APIError {
            if case .http(let status, _) = error, status == 401 { return false }
            throw error
        }
    }

    struct Verification {
        let token: String
        let userID: String?
        let nickname: String?
    }

    // MARK: - 传输

    private func send(
        _ url: URL,
        method: String,
        body: [String: Any]?,
        bearer: String? = nil
    ) async throws -> [String: Any] {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let bearer {
            request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [.sortedKeys])
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw APIError.network(error.localizedDescription)
        }

        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]

        guard (200..<300).contains(status) else {
            throw APIError.http(status, serverMessage(json, data: data))
        }
        return json ?? [:]
    }

    private func serverMessage(_ json: [String: Any]?, data: Data) -> String? {
        if let message = json?["message"] as? String, !message.isEmpty { return message }
        if let error = json?["error"] as? String, !error.isEmpty { return error }
        let text = String(data: data, encoding: .utf8) ?? ""
        return text.isEmpty ? nil : String(text.prefix(120))
    }
}

// MARK: - 错误

enum APIError: Error {
    case http(Int, String?)
    case network(String)
    case invalidResponse

    /// 界面直接展示这一句，所以写成没有技术味的短句。
    var userMessage: String {
        switch self {
        case .http(_, let message):
            let raw = message ?? ""
            if raw.contains("操作过快") {
                return "操作过于频繁，请稍后再试。"
            }
            if raw.contains("频率限制") {
                return "该手机号发送过于频繁，请过几分钟再试。"
            }
            if raw.contains("手机号不正确") {
                return "手机号格式不正确。"
            }
            if raw.contains("auth.not_found") {
                return "登录凭据已失效，请重新获取验证码。"
            }
            if raw.contains("验证码") {
                return "验证码不正确或已过期。"
            }
            return raw.isEmpty ? "服务暂时不可用，请稍后再试。" : raw
        case .network:
            return "网络连接失败，请检查网络后重试。"
        case .invalidResponse:
            return "服务返回了无法识别的内容。"
        }
    }

    var isRateLimited: Bool {
        guard case .http(_, let message) = self, let raw = message else { return false }
        return raw.contains("频率限制") || raw.contains("操作过快")
    }
}

// MARK: - 本地会话

/// 登录成功后的落盘位置。只存令牌与号码，验证码不落盘。
enum SessionVault {

    private static var fileURL: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("SimpleLogin/session.json")
    }

    static func save(token: String, phone: String, userID: String?, nickname: String?) {
        let payload: [String: Any] = [
            "token": token,
            "phone": phone,
            "user_id": userID ?? "",
            "nickname": nickname ?? "",
            "saved_at": ISO8601DateFormatter().string(from: Date()),
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted]) else {
            return
        }
        let url = fileURL
        try? FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: url, options: [.atomic])
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }

    static func load() -> [String: Any]? {
        guard let data = FileManager.default.contents(atPath: fileURL.path) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    static func token() -> String? {
        guard let token = load()?["token"] as? String, !token.isEmpty else { return nil }
        return token
    }

    static func clear() {
        try? FileManager.default.removeItem(at: fileURL)
    }

    static func savedPhone() -> String? {
        guard let data = FileManager.default.contents(atPath: fileURL.path),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        return json["phone"] as? String
    }
}
