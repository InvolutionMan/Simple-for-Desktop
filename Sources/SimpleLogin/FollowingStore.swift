import Foundation
import SwiftUI

// MARK: - 接口模型

struct FeedUser: Decodable, Hashable {
    let id: String
    let nickname: String?
    let avatarURL: String?
    let avatarColor: String?

    enum CodingKeys: String, CodingKey {
        case id, nickname
        case avatarURL = "avatar_url"
        case avatarColor = "avatar_color"
    }

    /// 服务端会给一个 #RRGGBB 形式的底色，用它兜住没有头像的用户。
    var color: Color? {
        guard let avatarColor, let value = UInt32(avatarColor, radix: 16) else { return nil }
        return Color(hex: value)
    }
}

struct FeedMedia: Decodable, Hashable {
    let url: String
    let type: String?
    let thumbnailURL: String?

    enum CodingKeys: String, CodingKey {
        case url, type
        case thumbnailURL = "thumbnail_url"
    }
}

/// 卡片里按顺序渲染的一条媒体：图片或视频。
enum FeedItem: Hashable, Identifiable {
    case image(URL)
    case video(url: URL, thumbnail: URL?)

    var id: String {
        switch self {
        case .image(let url): return "img:" + url.absoluteString
        case .video(let url, _): return "vid:" + url.absoluteString
        }
    }
}

struct FeedPost: Decodable, Identifiable, Hashable {
    let id: String
    let content: String?
    let createdAt: String?
    let commentsCount: Int?
    let isVoted: Bool?
    let votesCount: Int?
    let media: [FeedMedia]?
    let user: FeedUser?

    enum CodingKeys: String, CodingKey {
        case id, content, media, user
        case createdAt = "created_at"
        case commentsCount = "comments_count"
        case isVoted = "is_voted"
        case votesCount = "votes_count"
    }

    var voteCount: Int { votesCount ?? 0 }

    var displayName: String { user?.nickname ?? "匿名用户" }
    var initial: String { String(displayName.prefix(1)) }
    var timeText: String { RelativeTime.text(from: createdAt) }
    /// 图片与视频按服务端顺序排列，不能只挑图片，否则视频动态会整条空白。
    var items: [FeedItem] {
        (media ?? []).compactMap { entry in
            guard let url = URL(string: entry.url) else { return nil }
            if entry.type == "video" {
                return .video(url: url, thumbnail: entry.thumbnailURL.flatMap(URL.init(string:)))
            }
            return .image(url)
        }
    }

    var imageURLs: [URL] {
        items.compactMap { if case .image(let url) = $0 { return url } else { return nil } }
    }
}

struct FeedComment: Decodable, Identifiable, Hashable {
    let id: String
    let content: String?
    let createdAt: String?
    let isAuthor: Bool?
    let isVoted: Bool?
    let repliesCount: Int?
    let user: FeedUser?

    enum CodingKeys: String, CodingKey {
        case id, content, user
        case createdAt = "created_at"
        case isAuthor = "is_author"
        case isVoted = "is_voted"
        case repliesCount = "replies_count"
    }

    var displayName: String { user?.nickname ?? "匿名用户" }
    var initial: String { String(displayName.prefix(1)) }
    var timeText: String { RelativeTime.text(from: createdAt) }
    var avatarURL: URL? { user?.avatarURL.flatMap(URL.init(string:)) }
}

/// 把服务端的 ISO8601 时间转成列表上那句「N 分钟前」。
enum RelativeTime {
    private static let parser: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let fallbackParser: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static func date(from text: String?) -> Date? {
        guard var text else { return nil }
        if let date = parser.date(from: text) { return date }
        // 服务端给的是 6 位微秒（2026-09-01T10:24:07.211553+08:00），
        // ISO8601DateFormatter 只认 3 位，先截断再解析。
        if let range = text.range(of: #"\.\d+"#, options: .regularExpression) {
            let digits = text[range].dropFirst()
            if digits.count > 3 {
                text.replaceSubrange(range, with: "." + digits.prefix(3))
            }
        }
        return parser.date(from: text) ?? fallbackParser.date(from: text)
    }

    static func text(from raw: String?) -> String {
        guard let date = date(from: raw) else { return "" }
        let seconds = Date().timeIntervalSince(date)
        if seconds < 60 { return "刚刚" }
        if seconds < 3600 { return "\(Int(seconds / 60)) 分钟前" }
        if seconds < 86_400 { return "\(Int(seconds / 3600)) 小时前" }
        if seconds < 86_400 * 2 { return "昨天" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "M月d日"
        return formatter.string(from: date)
    }
}

// MARK: - 数据层

@MainActor
final class FollowingStore: ObservableObject {

    enum Tab: String, CaseIterable {
        case following, plaza, discover
    }

    @Published private(set) var posts: [FeedPost] = []
    @Published private(set) var comments: [FeedComment] = []
    @Published private(set) var me: FeedUser?
    @Published private(set) var isLoading = false
    @Published private(set) var commentsLoading = false
    @Published private(set) var errorText: String?
    @Published private(set) var loadedTabs: Set<Tab> = []
    @Published private(set) var isLoadingMore = false
    @Published private(set) var canLoadMore = true
    @Published private(set) var replies: [String: [FeedComment]] = [:]
    @Published private(set) var loadingReplies: Set<String> = []
    @Published private(set) var isLoadingMoreComments = false
    @Published private(set) var canLoadMoreComments = true
    @Published private(set) var isPostingComment = false
    @Published private(set) var commentError: String?
    @Published private(set) var isPostingReply = false

    private let pageSize = 10
    private var cursor: String?
    private var commentCursor: String?
    private var commentPostID: String?

    private let baseURL = URL(string: "https://simple.imsummer.cn")!

    func load(tab: Tab) async {
        guard !isLoading else { return }
        isLoading = true
        errorText = nil
        defer { isLoading = false }

        do {
            let token = try requireToken()
            if me == nil {
                me = try await get("api/v3/current_user", token: token, as: FeedUser.self)
            }
            switch tab {
            case .following:
                // 关注流专用端点；/moments 是「动态」，对关注关系不返回内容。
                posts = try await get("api/v3/posts/followings", token: token, as: [FeedPost].self)
            case .plaza:
                posts = try await get("api/v3/posts", token: token, as: [FeedPost].self)
            case .discover:
                posts = []
            }
            cursor = posts.last?.id
            canLoadMore = posts.count >= pageSize
            loadedTabs.insert(tab)
        } catch {
            errorText = message(for: error)
            posts = []
        }
    }

    /// 往下翻一页：用上一页最后一条的 id 作为游标。
    func loadMore(tab: Tab) async {
        guard !isLoadingMore, !isLoading, canLoadMore, tab != .discover else { return }
        guard let cursor, !cursor.isEmpty else { return }

        isLoadingMore = true
        defer { isLoadingMore = false }

        do {
            let token = try requireToken()
            let path = basePath(tab) + "?last_id=\(cursor)"
            let page: [FeedPost] = try await get(path, token: token, as: [FeedPost].self)
            let fresh = page.filter { candidate in
                !posts.contains { $0.id == candidate.id }
            }
            posts.append(contentsOf: fresh)
            if let next = page.last?.id { self.cursor = next }
            canLoadMore = !page.isEmpty && !fresh.isEmpty
        } catch {
            canLoadMore = false
        }
    }

    private func basePath(_ tab: Tab) -> String {
        switch tab {
        case .following: return "api/v3/posts/followings"
        case .plaza: return "api/v3/posts"
        case .discover: return "api/v3/posts"
        }
    }

    func loadComments(postID: String) async {
        commentsLoading = true
        commentPostID = postID
        comments = []
        replies = [:]
        defer { commentsLoading = false }
        do {
            let token = try requireToken()
            let page: [FeedComment] = try await get("api/v3/comments?post_id=\(postID)", token: token, as: [FeedComment].self)
            comments = page
            commentCursor = page.last?.id
            canLoadMoreComments = page.count >= pageSize
        } catch {
            comments = []
            canLoadMoreComments = false
            errorText = message(for: error)
        }
    }

    /// 评论本身也是 10 条一页，游标同样是上一页最后一条 id。
    func loadMoreComments() async {
        guard !isLoadingMoreComments, canLoadMoreComments,
              let commentPostID, let cursor = commentCursor else { return }
        isLoadingMoreComments = true
        defer { isLoadingMoreComments = false }
        do {
            let token = try requireToken()
            let path = "api/v3/comments?post_id=\(commentPostID)&last_id=\(cursor)"
            let page: [FeedComment] = try await get(path, token: token, as: [FeedComment].self)
            let fresh = page.filter { candidate in !comments.contains { $0.id == candidate.id } }
            comments.append(contentsOf: fresh)
            if let next = page.last?.id { self.commentCursor = next }
            canLoadMoreComments = !page.isEmpty && !fresh.isEmpty
        } catch {
            canLoadMoreComments = false
        }
    }

    /// 发表评论：POST /api/v3/comments { post_id, content }
    @discardableResult
    func postComment(postID: String, content: String) async -> Bool {
        let text = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isPostingComment else { return false }

        isPostingComment = true
        commentError = nil
        defer { isPostingComment = false }

        do {
            let token = try requireToken()
            let data = try await postReturningData(
                "api/v3/comments", token: token,
                body: ["post_id": postID, "content": text])
            if let created = try? JSONDecoder().decode(FeedComment.self, from: data) {
                comments.insert(created, at: 0)
            } else {
                await loadComments(postID: postID)
            }
            return true
        } catch {
            commentError = message(for: error)
            return false
        }
    }

    /// 回复某条评论：POST /api/v3/comments/replies { comment_id, content }
    @discardableResult
    func postReply(commentID: String, content: String) async -> Bool {
        let text = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isPostingReply else { return false }

        isPostingReply = true
        commentError = nil
        defer { isPostingReply = false }

        do {
            let token = try requireToken()
            let data = try await postReturningData(
                "api/v3/comments/replies", token: token,
                body: ["comment_id": commentID, "content": text])
            if let created = try? JSONDecoder().decode(FeedComment.self, from: data) {
                replies[commentID, default: []].append(created)
            } else {
                await loadReplies(commentID: commentID)
            }
            bumpReplyCount(commentID)
            return true
        } catch {
            commentError = message(for: error)
            return false
        }
    }

    /// 回复成功后本地把根评论的计数 +1，避免整页重拉。
    private func bumpReplyCount(_ commentID: String) {
        guard let index = comments.firstIndex(where: { $0.id == commentID }) else { return }
        let current = comments[index]
        comments[index] = current.withRepliesCount((current.repliesCount ?? 0) + 1)
    }

    /// 楼中楼：按根评论 id 取回复。
    func loadReplies(commentID: String) async {
        guard !loadingReplies.contains(commentID) else { return }
        loadingReplies.insert(commentID)
        defer { loadingReplies.remove(commentID) }
        do {
            let token = try requireToken()
            let list: [FeedComment] = try await get(
                "api/v3/comments/replies?comment_id=\(commentID)",
                token: token, as: [FeedComment].self)
            replies[commentID] = list
        } catch {
            replies[commentID] = []
        }
    }

    func toggleVote(on post: FeedPost) async {
        guard let index = posts.firstIndex(where: { $0.id == post.id }) else { return }
        let original = posts[index]
        posts[index] = original.withVoted(!(original.isVoted ?? false))
        do {
            let token = try requireToken()
            try await postJSON("api/v3/votes/posts", token: token, body: ["post_id": post.id])
        } catch {
            posts[index] = original
            errorText = message(for: error)
        }
    }

    private func requireToken() throws -> String {
        guard let token = SessionVault.token(), !token.isEmpty else {
            throw APIError.http(401, "登录已过期")
        }
        return token
    }

    private func request(_ path: String, method: String, token: String, body: [String: Any]?) -> URLRequest {
        // 注意：不能用 appendingPathComponent，它会把 "?last_id=…" 转义进路径里。
        let url = URL(string: path, relativeTo: baseURL) ?? baseURL
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try? JSONSerialization.data(withJSONObject: body, options: [.sortedKeys])
        }
        return request
    }

    private func get<T: Decodable>(_ path: String, token: String, as type: T.Type) async throws -> T {
        let (data, response) = try await URLSession.shared.data(for: request(path, method: "GET", token: token, body: nil))
        try ensureSuccess(response, data)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func postReturningData(_ path: String, token: String, body: [String: Any]) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(for: request(path, method: "POST", token: token, body: body))
        try ensureSuccess(response, data)
        return data
    }

    private func postJSON(_ path: String, token: String, body: [String: Any]) async throws {
        let (data, response) = try await URLSession.shared.data(for: request(path, method: "POST", token: token, body: body))
        try ensureSuccess(response, data)
    }

    private func ensureSuccess(_ response: URLResponse, _ data: Data) throws {
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let serverText = (json?["message"] as? String) ?? (json?["error"] as? String)
            throw APIError.http(status, serverText)
        }
    }

    private func message(for error: Error) -> String {
        if let apiError = error as? APIError { return apiError.userMessage }
        if error is DecodingError { return "数据格式异常，请稍后再试。" }
        return "加载失败，请检查网络后重试。"
    }
}

extension FeedComment {
    func withRepliesCount(_ count: Int) -> FeedComment {
        FeedComment(
            id: id, content: content, createdAt: createdAt,
            isAuthor: isAuthor, isVoted: isVoted,
            repliesCount: count, user: user
        )
    }
}

extension FeedPost {
    func withVoted(_ voted: Bool) -> FeedPost {
        let current = isVoted ?? false
        var count = votesCount ?? 0
        if voted != current {
            count = max(0, count + (voted ? 1 : -1))
        }
        return FeedPost(
            id: id, content: content, createdAt: createdAt,
            commentsCount: commentsCount, isVoted: voted,
            votesCount: count, media: media, user: user
        )
    }
}
