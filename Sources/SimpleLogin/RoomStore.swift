import SwiftUI

struct RoomMember: Identifiable, Hashable {
    let id: String
    let name: String
    let avatarMark: String
    let role: String

    var isHost: Bool { role == "creator_role" || role == "admin_role" }
}

@MainActor
final class RoomStore: ObservableObject {

    /// 环信桥：进房时连上该房间的群。
    let im = IMBridge()
    @Published var activeChannel: NightChannel?
    @Published var messages: [RoomMessage] = []
    @Published var draft = ""
    @Published var pendingAttachment: RoomAttachment?
    @Published var isOnMic = false
    @Published var isMuted = false
    @Published var showingMembers = false
    @Published var showingMicMembers = false
    @Published private(set) var members: [RoomMember] = []

    private var pollTask: Task<Void, Never>?
    private let baseURL = URL(string: "https://simple.imsummer.cn")!

    func enter(_ channel: NightChannel) {
        activeChannel = channel
        members = []
        Task { await join(roomID: channel.roomID) }
        if let group = channel.imID { im.connect(groupID: group) }
        startMembersPolling(roomID: channel.roomID)
        messages = []
        draft = ""
        pendingAttachment = nil
        isOnMic = false
        isMuted = false
        showingMembers = false
        showingMicMembers = false
    }

    func exit() {
        if let room = activeChannel?.roomID, !room.isEmpty {
            Task { await leave(roomID: room) }
        }
        pollTask?.cancel()
        pollTask = nil
        members = []
        activeChannel = nil
        messages = []
        draft = ""
        pendingAttachment = nil
        isOnMic = false
        isMuted = false
        showingMembers = false
        showingMicMembers = false
    }
}

extension RoomStore {
    /// 进入房间后拉一次成员，之后每 15 秒刷新；退出时取消。
    private func startMembersPolling(roomID: String) {
        guard !roomID.isEmpty else { return }
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refreshMembers(roomID: roomID)
                try? await Task.sleep(nanoseconds: 15 * 1_000_000_000)
            }
        }
    }

    /// 进房：POST /api/v3/voice_members { channel_id }，实测返回 201。
    private func join(roomID: String) async {
        guard let token = SessionVault.token(), !token.isEmpty, !roomID.isEmpty else { return }
        var request = URLRequest(url: URL(string: "api/v3/voice_members", relativeTo: baseURL) ?? baseURL)
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        for (k, v) in ["end": "ios", "os": "2", "appVersionCode": "779"] {
            request.setValue(v, forHTTPHeaderField: k)
        }
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["channel_id": roomID])
        _ = try? await URLSession.shared.data(for: request)
    }

    /// 退房：DELETE /api/v3/voice_members?channel_id=，失败也不影响界面。
    private func leave(roomID: String) async {
        guard let token = SessionVault.token(), !token.isEmpty else { return }
        var request = URLRequest(url: URL(string: "api/v3/voice_members?channel_id=\(roomID)", relativeTo: baseURL) ?? baseURL)
        request.httpMethod = "DELETE"
        request.timeoutInterval = 15
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        for (k, v) in ["end": "ios", "os": "2", "appVersionCode": "779"] {
            request.setValue(v, forHTTPHeaderField: k)
        }
        _ = try? await URLSession.shared.data(for: request)
    }

    func refreshMembers(roomID: String) async {
        guard let token = SessionVault.token(), !token.isEmpty else { return }
        var request = URLRequest(url: URL(string: "api/v3/voice_members?channel_id=\(roomID)", relativeTo: baseURL) ?? baseURL)
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        for (k, v) in ["end": "ios", "os": "2", "appVersionCode": "779"] {
            request.setValue(v, forHTTPHeaderField: k)
        }

        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse).map({ (200..<300).contains($0.statusCode) }) == true,
              let list = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else { return }

        let parsed: [RoomMember] = list.compactMap { item in
            guard let id = item["id"] as? String else { return nil }
            let nickname = item["nickname"] as? String ?? "匿名用户"
            return RoomMember(
                id: id,
                name: nickname,
                avatarMark: String(nickname.prefix(1)),
                role: item["role"] as? String ?? ""
            )
        }
        await MainActor.run { self.members = parsed }
    }
}

enum RoomAttachment {
    case image(URL)
    case video(URL)

    var url: URL {
        switch self {
        case .image(let url), .video(let url):
            return url
        }
    }

    var kindLabel: String {
        switch self {
        case .image: return "照片"
        case .video: return "视频"
        }
    }
}

struct RoomMessage: Identifiable {
    let id = UUID()
    let text: String
    let time: String
    let attachment: RoomAttachment?
}
