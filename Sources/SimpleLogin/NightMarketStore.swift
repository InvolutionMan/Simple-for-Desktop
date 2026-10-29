import Foundation

/// 夜市的数据层：开市状态 + 频道列表（含在线人数）。
///
///   GET /api/v3/night_markets/banners                → 是否开市、起止时间
///   GET /api/v3/night_markets?last_id=&per_page=10   → 夜市频道，游标分页
///
/// 注意两个坑：
///   1. 服务端按客户端版本决定每页条数。不带 `appVersionCode` 时只给 4 条，
///      带上 779（官方 1.9.32）才会按 `per_page` 返回。
///   2. 分页游标是上一页最后一条的 id，空串表示第一页。
@MainActor
final class NightMarketStore: ObservableObject {

    @Published private(set) var channels: [NightChannel] = []
    @Published private(set) var isLoading = false
    @Published private(set) var isOpen = false
    @Published private(set) var endAt: String?
    @Published private(set) var errorText: String?

    private let baseURL = URL(string: "https://simple.imsummer.cn")!
    private let pageSize = 10
    private var loaded = false

    /// 官方客户端的标识头，缺了版本号会被当 Web 端限流到 4 条/页。
    private static let clientHeaders: [String: String] = [
        "end": "ios",
        "os": "2",
        "channel": "appstore",
        "appVersionName": "1.9.32",
        "appVersionCode": "779",
        "languageCode": "zh",
    ]

    func load(force: Bool = false) async {
        guard !isLoading, force || !loaded else { return }
        isLoading = true
        errorText = nil
        defer { isLoading = false }

        do {
            let token = try requireToken()

            if let banner: [String: Any] = try? await json("api/v3/night_markets/banners", token: token) {
                isOpen = banner["is_in_progress"] as? Bool ?? false
                endAt = banner["end_at"] as? String
            }

            var collected: [NightChannel] = []
            var seen = Set<String>()
            var cursor = ""

            // 最多翻 10 页，防止异常数据导致死循环。
            for _ in 0..<10 {
                let path = "api/v3/night_markets?last_id=\(cursor)&per_page=\(pageSize)"
                let items: [[String: Any]] = try await json(path, token: token)
                if items.isEmpty { break }

                for item in items {
                    guard let id = item["id"] as? String, seen.insert(id).inserted else { continue }
                    let chat = item["chat_room"] as? [String: Any]
                    collected.append(
                        NightChannel(
                            title: item["name"] as? String ?? "未命名房间",
                            count: (chat?["chat_room_members_count"] as? NSNumber)?.intValue ?? 0,
                            roomID: id,
                            imID: chat?["im_id"] as? String
                        )
                    )
                }

                guard let next = items.last?["id"] as? String, next != cursor else { break }
                cursor = next
            }

            // 保持服务端顺序：官方客户端也是按这个顺序展示的。
            channels = collected
            loaded = true
        } catch {
            errorText = "夜市加载失败，请稍后再试。"
        }
    }

    // MARK: - 传输

    private func requireToken() throws -> String {
        guard let token = SessionVault.token(), !token.isEmpty else {
            throw APIError.http(401, "登录已过期")
        }
        return token
    }

    private func json<T>(_ path: String, token: String) async throws -> T {
        let url = URL(string: path, relativeTo: baseURL) ?? baseURL
        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        for (key, value) in Self.clientHeaders {
            request.setValue(value, forHTTPHeaderField: key)
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw APIError.http(status, nil)
        }
        guard let value = try JSONSerialization.jsonObject(with: data) as? T else {
            throw APIError.invalidResponse
        }
        return value
    }
}
