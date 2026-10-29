import SwiftUI

struct NightMarketPage: View {
    let session: Session
    @ObservedObject var roomStore: RoomStore
    @ObservedObject var nightStore: NightMarketStore

    @State private var createdChannels: [NightChannel] = []
    @State private var showingCreateRoom = false
    @State private var hoveringCreate = false

    var body: some View {
        Group {
            if let channel = roomStore.activeChannel {
                NightRoomView(channel: channel, session: session, store: roomStore)
            } else {
                lobby
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .sheet(isPresented: $showingCreateRoom) {
            CreateRoomSheet { title in
                // 创建聊天室暂时只做本地占位，服务端接口未确认。
                createdChannels.insert(NightChannel(title: title, count: 0), at: 0)
            }
        }
    }

    private var lobby: some View {
        ZStack {
            PaperBackdrop(showsNightDots: true)

            VStack(spacing: 0) {
                header

                Rectangle()
                    .fill(Theme.line)
                    .frame(height: 1)

                channelList
            }
            .frame(maxWidth: 820)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .task { await nightStore.load() }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 20) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 7) {
                    Image(systemName: "moon.stars")
                        .font(.system(size: 11, weight: .regular))
                        .foregroundStyle(Theme.tealDeep)

                    Text("NIGHT MARKET")
                        .font(.system(size: 9.5, weight: .semibold))
                        .tracking(2)
                        .foregroundStyle(Theme.tealDeep)
                }

                Text("夜市")
                    .font(AppFont.songti(42))
                    .foregroundStyle(Theme.ink)
                    .padding(.top, 8)

                HStack(spacing: 7) {
                    Text("限时聊天室")

                    Text("·")
                        .foregroundStyle(Theme.lineStrong)

                    Text("20:00-02:00")
                }
                .font(.system(size: 12))
                .foregroundStyle(Theme.muted)
                .padding(.top, 6)
            }

            Spacer(minLength: 20)

            createButton
                .padding(.top, 2)
        }
        .padding(.top, 24)
        .padding(.bottom, 18)
    }

    private var createButton: some View {
        Button {
            showingCreateRoom = true
        } label: {
            HStack(spacing: 5) {
                Image(systemName: "plus")
                    .font(.system(size: 10, weight: .semibold))

                Text("创建聊天室")
                    .font(.system(size: 12, weight: .medium))
            }
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 13)
            .frame(height: 32)
            .background(
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(hoveringCreate ? Theme.hover : Theme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .strokeBorder(hoveringCreate ? Theme.lineStrong : Theme.line, lineWidth: 1)
            )
            .contentShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            withAnimation(.easeOut(duration: 0.14)) {
                hoveringCreate = hovering
            }
        }
        .help("创建一个限时聊天室")
        .accessibilityLabel("创建聊天室")
    }

    private var channels: [NightChannel] { createdChannels + nightStore.channels }

    private var channelList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 6) {
                    ForEach(Array(channels.enumerated()), id: \.element.id) { item in
                        ChannelRow(
                            channel: item.element,
                            phase: Double(item.offset) * 0.85,
                            onSelect: {
                                roomStore.enter(item.element)
                            }
                        )
                        .id(item.element.id)
                    }
                }
                .padding(.top, 16)
                .padding(.bottom, 24)
            }
            .scrollIndicators(.never)
            .onChange(of: channels.count) { _ in
                guard let first = channels.first else { return }
                withAnimation(.easeOut(duration: 0.24)) {
                    proxy.scrollTo(first.id, anchor: .top)
                }
            }
        }
    }
}

struct NightChannel: Identifiable {
    let id: UUID
    let title: String
    let count: Int
    /// 服务端的语音房 id，用来取成员和 RTC 令牌。
    let roomID: String
    /// 环信群组 id，接文字消息时用。
    let imID: String?

    init(id: UUID = UUID(), title: String, count: Int, roomID: String = "", imID: String? = nil) {
        self.id = id
        self.title = title
        self.count = count
        self.roomID = roomID
        self.imID = imID
    }

    static let demo: [NightChannel] = [
        NightChannel(title: "空房回响", count: 1),
        NightChannel(title: "🌲 霸道总裁爱上自律", count: 1),
        NightChannel(title: "📣 搜索「梗教」，探索哲学与精神分析社区", count: 0),
        NightChannel(title: "乌托邦", count: 1),
        NightChannel(title: "倾诉吐槽日常", count: 0),
        NightChannel(title: "豆某人ddl( ̄▽ ̄ )", count: 1),
        NightChannel(title: "遇事不决 别问春风", count: 1),
        NightChannel(title: "小树屋//出差版", count: 1),
        NightChannel(title: "花开富贵的聊天室", count: 1),
        NightChannel(title: "让我完整睡觉吧", count: 1),
    ]
}

private struct ChannelRow: View {
    let channel: NightChannel
    let phase: Double
    let onSelect: () -> Void

    @State private var isHovering = false

    var body: some View {
        Button(action: onSelect) {
            rowContent
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            withAnimation(.easeOut(duration: 0.16)) {
                isHovering = hovering
            }
        }
        .accessibilityLabel("进入聊天室 \(channel.title)，\(channel.count) 人在线")
        .accessibilityHint("打开聊天室")
    }

    private var rowContent: some View {
        HStack(spacing: 10) {
            RoomBars(phase: phase)

            Text(channel.title)
                .font(.system(size: 12.5, weight: .medium))
                .foregroundStyle(Theme.ink)
                .lineLimit(1)
                .truncationMode(.tail)

            Spacer(minLength: 12)

            HStack(spacing: 4) {
                Image(systemName: "person")
                    .font(.system(size: 9, weight: .regular))

                Text("\(channel.count)")
                    .font(.system(size: 10.5, weight: .regular))
            }
            .foregroundStyle(isHovering ? Theme.inkSoft : Theme.muted)

            Image(systemName: "chevron.right")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(Theme.faint.opacity(isHovering ? 0.8 : 0.25))
                .frame(width: 12)
        }
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(height: 52)
        .background(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(isHovering ? Theme.hover : Theme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .strokeBorder(isHovering ? Theme.lineStrong : Theme.line, lineWidth: 1)
        )
        .contentShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
    }
}

struct RoomBars: View {
    let phase: Double

    var body: some View {
        TimelineView(.animation) { context in
            let time = context.date.timeIntervalSinceReferenceDate

            Canvas { canvas, size in
                let barWidth: CGFloat = 1.5
                let gap: CGFloat = 1.75
                let bars: [(base: CGFloat, amplitude: CGFloat, offset: Double)] = [
                    (3.8, 2.5, 0),
                    (6, 3, 1.1),
                    (4.2, 2.6, 2.2)
                ]

                for (index, bar) in bars.enumerated() {
                    let wave = sin(time * 4.8 + phase + bar.offset)
                    let height = bar.base + bar.amplitude * CGFloat((wave + 1) / 2)
                    let x = CGFloat(index) * (barWidth + gap)
                    let rect = CGRect(
                        x: x,
                        y: (size.height - height) / 2,
                        width: barWidth,
                        height: height
                    )

                    canvas.fill(
                        Path(roundedRect: rect, cornerRadius: barWidth / 2),
                        with: .color(Theme.tealDeep.opacity(0.6))
                    )
                }
            }
        }
        .frame(width: 8, height: 10, alignment: .leading)
        .accessibilityHidden(true)
    }
}

private struct CreateRoomSheet: View {
    let onCreate: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center) {
                Text("创建聊天室")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.ink)

                Spacer(minLength: 12)

                Button("关闭") {
                    dismiss()
                }
                .buttonStyle(.plain)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.muted)
            }

            Text("聊天室名称")
                .font(.system(size: 11.5, weight: .medium))
                .foregroundStyle(Theme.inkSoft)
                .padding(.top, 24)

            TextField(
                "",
                text: $name,
                prompt: Text("今晚想聊点什么")
                    .foregroundColor(Theme.placeholder)
            )
            .textFieldStyle(.plain)
            .font(.system(size: 14))
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 12)
            .frame(height: 42)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(Theme.paper)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(Theme.line, lineWidth: 1)
            )
            .padding(.top, 8)
            .onSubmit {
                create()
            }

            HStack(spacing: 6) {
                Image(systemName: "clock")
                    .font(.system(size: 9, weight: .regular))

                Text("限时 20:00-02:00，创建后仅在本页预览。")
                    .font(.system(size: 10.5))
            }
            .foregroundStyle(Theme.faint)
            .padding(.top, 10)

            HStack(spacing: 10) {
                Spacer(minLength: 0)

                Button("取消") {
                    dismiss()
                }
                .buttonStyle(.plain)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.muted)
                .padding(.horizontal, 12)
                .frame(height: 34)

                Button {
                    create()
                } label: {
                    Text("创建")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(trimmedName.isEmpty ? Theme.faint : Theme.tealInk)
                        .padding(.horizontal, 17)
                        .frame(height: 34)
                        .background(
                            RoundedRectangle(cornerRadius: 9, style: .continuous)
                                .fill(trimmedName.isEmpty ? Theme.hover : Theme.teal)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 9, style: .continuous)
                                .strokeBorder(trimmedName.isEmpty ? Theme.line : Color.clear, lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
                .disabled(trimmedName.isEmpty)
            }
            .padding(.top, 24)
        }
        .padding(24)
        .frame(width: 420)
        .background(Theme.surface)
    }

    private func create() {
        guard !trimmedName.isEmpty else { return }
        onCreate(trimmedName)
        dismiss()
    }
}
