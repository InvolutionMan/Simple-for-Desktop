import AppKit
import AVKit
import SwiftUI
import UniformTypeIdentifiers

struct NightRoomView: View {
    let channel: NightChannel
    let session: Session
    @ObservedObject var store: RoomStore

    /// 服务端暂时不返回麦位状态，上麦列表仍只反映自己；在线列表用真实成员。
    private var onlineMembers: [RoomMember] {
        if !store.members.isEmpty { return store.members }
        return [RoomMember(id: session.maskedPhone, name: session.displayName,
                           avatarMark: session.avatarMark, role: "creator_role")]
    }

    private var micMembers: [RoomMember] {
        guard store.isOnMic else { return [] }
        return [RoomMember(id: session.maskedPhone, name: session.displayName,
                           avatarMark: session.avatarMark, role: "")]
    }

    private var trimmedDraft: String {
        store.draft.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canSend: Bool {
        !trimmedDraft.isEmpty || store.pendingAttachment != nil
    }

    var body: some View {
        ZStack {
            PaperBackdrop()

            HStack(spacing: 0) {
                VStack(spacing: 0) {
                    header

                    Rectangle()
                        .fill(Theme.line)
                        .frame(height: 1)

                    if store.messages.isEmpty {
                        emptyState
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        messageList
                    }

                    composer
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.trailing, store.showingMicMembers ? 24 : 0)

                HStack(spacing: 0) {
                    Rectangle()
                        .fill(Theme.line)
                        .frame(width: 1)

                    micMembersPanel
                }
                .frame(width: store.showingMicMembers ? 221 : 0, alignment: .leading)
                .frame(maxHeight: .infinity)
                .clipped()
                .opacity(store.showingMicMembers ? 1 : 0)
                .allowsHitTesting(store.showingMicMembers)
                .accessibilityHidden(!store.showingMicMembers)
            }
            .frame(maxWidth: 980)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .animation(.easeInOut(duration: 0.22), value: store.showingMicMembers)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var micMembersPanel: some View {
        VStack(alignment: .leading, spacing: 0) {
            if micMembers.isEmpty {
                VStack(spacing: 0) {
                    Spacer(minLength: 0)

                    VStack(spacing: 8) {
                        Image(systemName: "mic.slash")
                            .font(.system(size: 16, weight: .regular))
                            .foregroundStyle(Theme.faint)

                        Text("还没有人上麦")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(Theme.inkSoft)

                        Text("点击聊天区的「上麦」")
                            .font(.system(size: 10.5))
                            .foregroundStyle(Theme.muted)
                    }

                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(spacing: 8) {
                        ForEach(micMembers) { member in
                            HStack(spacing: 9) {
                                ZStack {
                                    Circle()
                                        .fill(Theme.tealSoft)
                                        .frame(width: 30, height: 30)

                                    Text(member.avatarMark)
                                        .font(.system(size: 9.5, weight: .semibold))
                                        .foregroundStyle(Theme.tealDeep)
                                }

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(member.name)
                                        .font(.system(size: 11.5, weight: .medium))
                                        .foregroundStyle(Theme.ink)
                                        .lineLimit(1)

                                    Text(store.isMuted ? "已闭麦" : "正在上麦")
                                        .font(.system(size: 10))
                                        .foregroundStyle(Theme.muted)
                                }

                                Spacer(minLength: 4)

                                Image(systemName: store.isMuted ? "mic.slash.fill" : "mic.fill")
                                    .font(.system(size: 9, weight: .regular))
                                    .foregroundStyle(store.isMuted ? Theme.faint : Theme.tealDeep)
                            }
                            .padding(.horizontal, 10)
                            .frame(height: 48)
                            .background(
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .fill(Theme.surface.opacity(0.72))
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .strokeBorder(Theme.line, lineWidth: 1)
                            )
                        }
                    }
                    .padding(12)
                }
                .scrollIndicators(.never)
            }
        }
        .frame(width: 220)
        .frame(maxHeight: .infinity)
    }

    private var exitRoomButton: some View {
        Button {
            store.exit()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "rectangle.portrait.and.arrow.right")
                Text("退出房间")
            }
            .font(.system(size: 10.5, weight: .medium))
            .foregroundStyle(Theme.muted)
            .padding(.horizontal, 8)
            .frame(height: 26)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Theme.surface.opacity(0.72))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(Theme.line, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .help("退出房间")
        .accessibilityLabel("退出房间")
    }

    private var micMembersToggle: some View {
        Button {
            withAnimation(.easeInOut(duration: 0.22)) {
                store.showingMicMembers.toggle()
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "person.2")
                Text("上麦成员")
            }
            .font(.system(size: 10.5, weight: .medium))
            .foregroundStyle(store.showingMicMembers ? Theme.tealDeep : Theme.muted)
            .padding(.horizontal, 8)
            .frame(height: 26)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(store.showingMicMembers ? Theme.tealSoft : Theme.surface.opacity(0.72))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(store.showingMicMembers ? Color.clear : Theme.line, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .help(store.showingMicMembers ? "收起上麦成员" : "展开上麦成员")
        .accessibilityLabel(store.showingMicMembers ? "收起上麦成员" : "展开上麦成员")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                Text(channel.title)
                    .font(AppFont.songti(30))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)

                Spacer(minLength: 8)

                micMembersToggle

                exitRoomButton
            }

            HStack(spacing: 6) {
                Image(systemName: "person")
                    .font(.system(size: 10, weight: .regular))

                Text("\(onlineMembers.count) 人在线")

                Button {
                    withAnimation(.easeOut(duration: 0.18)) {
                        store.showingMembers.toggle()
                    }
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(Theme.muted)
                        .rotationEffect(.degrees(store.showingMembers ? 90 : 0))
                        .frame(width: 16, height: 16)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help(store.showingMembers ? "收起在线成员" : "展开在线成员")
                .accessibilityLabel(store.showingMembers ? "收起在线成员" : "展开在线成员")
            }
            .font(.system(size: 12))
            .foregroundStyle(Theme.muted)
            .padding(.top, 8)

            if store.showingMembers {
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        ForEach(onlineMembers) { member in
                            HStack(spacing: 6) {
                                ZStack {
                                    Circle()
                                        .fill(Theme.tealSoft)
                                        .frame(width: 24, height: 24)

                                    Text(member.avatarMark)
                                        .font(.system(size: 8.5, weight: .semibold))
                                        .foregroundStyle(Theme.tealDeep)
                                }

                                Text(member.name)
                                    .font(.system(size: 11))
                                    .foregroundStyle(Theme.inkSoft)
                                    .lineLimit(1)
                            }
                            .padding(.horizontal, 8)
                            .frame(height: 30)
                            .background(
                                Capsule()
                                    .fill(Theme.surface)
                            )
                            .overlay(
                                Capsule()
                                    .strokeBorder(Theme.line, lineWidth: 1)
                            )
                        }
                    }
                }
                .scrollIndicators(.never)
                .padding(.top, 10)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 22)
        .padding(.bottom, 18)
    }

    private var emptyState: some View {
        VStack(spacing: 0) {
            ZStack {
                Circle()
                    .fill(Theme.tealSoft)
                    .frame(width: 64, height: 64)

                Image(systemName: "bubble.left.and.bubble.right")
                    .font(.system(size: 21, weight: .regular))
                    .foregroundStyle(Theme.tealDeep)
            }

            Text("还没有人说话")
                .font(AppFont.songti(24))
                .foregroundStyle(Theme.ink)
                .padding(.top, 18)

            Text("说点什么，让今晚的聊天室热闹起来。")
                .font(.system(size: 13))
                .foregroundStyle(Theme.muted)
                .padding(.top, 8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    ForEach(store.messages) { message in
                        messageRow(message)
                    }

                    Color.clear
                        .frame(height: 1)
                        .id("bottom")
                }
                .padding(.vertical, 24)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollIndicators(.never)
            .onChange(of: store.messages.count) { _ in
                withAnimation(.easeOut(duration: 0.18)) {
                    proxy.scrollTo("bottom", anchor: .bottom)
                }
            }
        }
    }

    private func messageRow(_ message: RoomMessage) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Spacer(minLength: 40)

            VStack(alignment: .trailing, spacing: 6) {
                Text(session.maskedPhone)
                    .font(.system(size: 10.5, weight: .medium))
                    .foregroundStyle(Theme.inkSoft)

                if let attachment = message.attachment {
                    attachmentView(attachment)
                }

                if !message.text.isEmpty {
                    Text(message.text)
                        .font(.system(size: 13.5))
                        .foregroundStyle(Theme.ink)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(Theme.tealSoft)
                        )
                }

                Text(message.time)
                    .font(.system(size: 9.5))
                    .foregroundStyle(Theme.faint)
            }

            ZStack {
                Circle()
                    .fill(Theme.tealSoft)
                    .frame(width: 30, height: 30)

                Text(session.avatarMark)
                    .font(.system(size: 9.5, weight: .semibold))
                    .foregroundStyle(Theme.tealDeep)
            }
            .overlay(
                Circle()
                    .strokeBorder(Theme.line, lineWidth: 1)
            )
        }
    }

    @ViewBuilder
    private func attachmentView(_ attachment: RoomAttachment) -> some View {
        switch attachment {
        case .image(let url):
            RoomImageAttachment(url: url)
        case .video(let url):
            RoomVideoAttachment(url: url)
        }
    }

    private var voiceControls: some View {
        HStack(spacing: 8) {
            Button(action: toggleMic) {
                HStack(spacing: 5) {
                    Image(systemName: store.isOnMic ? "mic.fill" : "mic")
                    Text(store.isOnMic ? "下麦" : "上麦")
                }
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(store.isOnMic ? Theme.ink : Theme.tealInk)
                .padding(.horizontal, 12)
                .frame(height: 30)
                .background(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .fill(store.isOnMic ? Theme.surface : Theme.teal)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .strokeBorder(store.isOnMic ? Theme.line : Color.clear, lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
            .help(store.isOnMic ? "下麦" : "上麦")
            .accessibilityLabel(store.isOnMic ? "下麦" : "上麦")

            if store.isOnMic {
                Button(action: toggleMute) {
                    HStack(spacing: 5) {
                        Image(systemName: store.isMuted ? "mic.slash" : "mic")
                        Text(store.isMuted ? "开麦" : "闭麦")
                    }
                    .font(.system(size: 11.5, weight: .medium))
                    .foregroundStyle(store.isMuted ? Theme.danger : Theme.inkSoft)
                    .padding(.horizontal, 10)
                    .frame(height: 30)
                    .background(
                        RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .fill(store.isMuted ? Theme.dangerSoft : Theme.surface)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .strokeBorder(store.isMuted ? Color.clear : Theme.line, lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
                .help(store.isMuted ? "开麦" : "闭麦")
                .accessibilityLabel(store.isMuted ? "开麦" : "闭麦")
            }

            Spacer(minLength: 8)

            if store.isOnMic {
                HStack(spacing: 5) {
                    Circle()
                        .fill(store.isMuted ? Theme.faint : Theme.teal)
                        .frame(width: 4, height: 4)

                    Text(store.isMuted ? "已闭麦" : "麦克风已开启")
                        .font(.system(size: 10.5))
                        .foregroundStyle(Theme.muted)
                }
            }
        }
    }

    private var composer: some View {
        VStack(spacing: 0) {
            Rectangle()
                .fill(Theme.line)
                .frame(height: 1)

            voiceControls
                .padding(.top, 10)

            if let attachment = store.pendingAttachment {
                pendingAttachmentPreview(attachment)
            }

            HStack(spacing: 8) {
                Button {
                    pickAttachment()
                } label: {
                    Image(systemName: "photo.on.rectangle")
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(Theme.muted)
                        .frame(width: 38, height: 38)
                        .background(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .fill(Theme.surface)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .strokeBorder(Theme.line, lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
                .help("添加照片或视频")
                .accessibilityLabel("添加照片或视频")

                TextField(
                    "",
                    text: $store.draft,
                    prompt: Text("说点什么…")
                        .foregroundColor(Theme.placeholder)
                )
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .foregroundStyle(Theme.ink)
                .padding(.horizontal, 12)
                .frame(height: 38)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Theme.surface)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .strokeBorder(Theme.line, lineWidth: 1)
                )
                .onSubmit {
                    send()
                }

                Button(action: send) {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(canSend ? Theme.tealInk : Theme.faint)
                        .frame(width: 38, height: 38)
                        .background(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .fill(canSend ? Theme.teal : Theme.hover)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .strokeBorder(canSend ? Color.clear : Theme.line, lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
                .disabled(!canSend)
                .help("发送")
                .accessibilityLabel("发送")
            }
            .padding(.top, 12)
            .padding(.bottom, 22)
        }
    }

    private func pendingAttachmentPreview(_ attachment: RoomAttachment) -> some View {
        HStack(spacing: 10) {
            previewThumbnail(attachment)

            VStack(alignment: .leading, spacing: 2) {
                Text(attachment.kindLabel)
                    .font(.system(size: 11.5, weight: .medium))
                    .foregroundStyle(Theme.ink)

                Text(attachment.url.lastPathComponent)
                    .font(.system(size: 10.5))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            Button {
                store.pendingAttachment = nil
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(Theme.muted)
                    .frame(width: 24, height: 24)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("移除附件")
            .accessibilityLabel("移除附件")
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Theme.paper)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(Theme.line, lineWidth: 1)
        )
        .padding(.top, 10)
    }

    @ViewBuilder
    private func previewThumbnail(_ attachment: RoomAttachment) -> some View {
        Group {
            switch attachment {
            case .image(let url):
                if let image = NSImage(contentsOf: url) {
                    Image(nsImage: image)
                        .resizable()
                        .scaledToFill()
                } else {
                    Image(systemName: "photo")
                        .font(.system(size: 15, weight: .regular))
                        .foregroundStyle(Theme.muted)
                }
            case .video:
                Image(systemName: "film")
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(Theme.tealDeep)
            }
        }
        .frame(width: 56, height: 40)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .clipped()
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .strokeBorder(Theme.line, lineWidth: 1)
        )
    }

    private func pickAttachment() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.image, .movie]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.title = "添加照片或视频"
        panel.prompt = "添加"

        panel.begin { response in
            guard response == .OK, let url = panel.url else { return }

            let type = UTType(filenameExtension: url.pathExtension)
            store.pendingAttachment = type?.conforms(to: .movie) == true
                ? .video(url)
                : .image(url)
        }
    }

    private func toggleMic() {
        withAnimation(.easeInOut(duration: 0.18)) {
            store.isOnMic.toggle()
            store.isMuted = false
        }
    }

    private func toggleMute() {
        guard store.isOnMic else { return }
        withAnimation(.easeInOut(duration: 0.14)) {
            store.isMuted.toggle()
        }
    }

    private func send() {
        guard canSend else { return }

        store.messages.append(
            RoomMessage(
                text: trimmedDraft,
                time: "刚刚",
                attachment: store.pendingAttachment
            )
        )
        store.draft = ""
        store.pendingAttachment = nil
    }
}

private struct RoomImageAttachment: View {
    let url: URL

    var body: some View {
        Group {
            if let image = NSImage(contentsOf: url) {
                Image(nsImage: image)
                    .resizable()
                    .scaledToFit()
            } else {
                HStack(spacing: 6) {
                    Image(systemName: "photo")
                    Text(url.lastPathComponent)
                        .lineLimit(1)
                }
                .font(.system(size: 12))
                .foregroundStyle(Theme.muted)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.paper)
            }
        }
        .frame(maxWidth: 320, maxHeight: 240)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(Theme.line, lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.06), radius: 8, x: 0, y: 3)
    }
}

private struct RoomVideoAttachment: View {
    let url: URL

    @State private var player: AVPlayer

    init(url: URL) {
        self.url = url
        _player = State(initialValue: AVPlayer(url: url))
    }

    var body: some View {
        VideoPlayer(player: player)
            .frame(width: 320, height: 200)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(Theme.line, lineWidth: 1)
            )
    }
}

