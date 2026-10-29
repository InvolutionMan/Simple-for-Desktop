import SwiftUI

struct FloatingRoomCard: View {
    @ObservedObject var store: RoomStore

    let onOpen: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Button(action: onOpen) {
                HStack(spacing: 10) {
                    ZStack {
                        Circle()
                            .fill(Theme.tealSoft)
                            .frame(width: 34, height: 34)

                        Image(systemName: "bubble.left.and.bubble.right")
                            .font(.system(size: 13, weight: .regular))
                            .foregroundStyle(Theme.tealDeep)
                    }

                    VStack(alignment: .leading, spacing: 3) {
                        Text(store.activeChannel?.title ?? "聊天室")
                            .font(.system(size: 12.5, weight: .semibold))
                            .foregroundStyle(Theme.ink)
                            .lineLimit(1)

                        HStack(spacing: 4) {
                            Text("房间悬浮中")

                            if store.isOnMic {
                                Text("·")
                                    .foregroundStyle(Theme.lineStrong)

                                Text(store.isMuted ? "已闭麦" : "麦克风已开启")
                            }
                        }
                        .font(.system(size: 10))
                        .foregroundStyle(Theme.muted)
                    }

                    Spacer(minLength: 6)

                    Text("返回")
                        .font(.system(size: 10.5, weight: .medium))
                        .foregroundStyle(Theme.tealDeep)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("返回房间")

            Button {
                store.exit()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(Theme.muted)
                    .frame(width: 24, height: 24)
                    .background(
                        Circle()
                            .fill(Theme.paper)
                    )
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .help("退出房间")
            .accessibilityLabel("退出房间")
        }
        .padding(12)
        .frame(width: 300)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Theme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Theme.line, lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.12), radius: 14, x: 0, y: 6)
    }
}
