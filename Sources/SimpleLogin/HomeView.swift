import AppKit
import SwiftUI

struct HomeView: View {
    let session: Session
    let onSignOut: () -> Void

    @StateObject private var store = FollowingStore()

    var body: some View {
        HStack(spacing: 0) {
            SidebarRail(session: session, onSignOut: onSignOut)
                .frame(width: 76)

            FollowingView(leadingChromeWidth: 76, store: store)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.surface)
        .overlay(alignment: .topLeading) {
            Rectangle()
                .fill(Theme.line)
                .frame(width: 1)
                .frame(maxHeight: .infinity)
                .offset(x: 76)
                .ignoresSafeArea(edges: .top)
        }
    }
}

private struct SidebarRail: View {
    let session: Session
    let onSignOut: () -> Void

    @State private var showingChannels = false
    @State private var hoveringChannel = false

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 26) {
                railIcon("bubble.left")
                channelButton
            }
            .padding(.top, 12)

            Spacer(minLength: 24)

            accountMenu
                .padding(.bottom, 24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.paper)
    }

    private func railIcon(_ name: String) -> some View {
        Image(systemName: name)
            .font(.system(size: 19, weight: .regular))
            .foregroundStyle(Theme.muted)
            .frame(width: 32, height: 32)
            .accessibilityHidden(true)
    }

    private var channelButton: some View {
        Button {
            showingChannels = true
        } label: {
            Image(systemName: "number")
                .font(.system(size: 19, weight: .regular))
                .foregroundStyle(Theme.inkSoft)
                .frame(width: 32, height: 32)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(hoveringChannel ? Theme.hover : Color.clear)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hoveringChannel = $0 }
        .help("频道")
        .accessibilityLabel("频道")
        .popover(isPresented: $showingChannels, arrowEdge: .trailing) {
            ChannelPopover()
        }
    }

    private var accountMenu: some View {
        Menu {
            Button(session.maskedPhone) { }
                .disabled(true)
            Divider()
            Button("退出登录", role: .destructive) {
                onSignOut()
            }
        } label: {
            ZStack {
                Circle()
                    .fill(Theme.tealSoft)
                    .frame(width: 34, height: 34)

                Text(accountMark)
                    .font(.system(size: 10.5, weight: .semibold))
                    .foregroundStyle(Theme.tealDeep)
            }
            .contentShape(Circle())
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        .help(session.maskedPhone)
        .accessibilityLabel("账号菜单")
    }

    private var accountMark: String {
        let suffix = session.phone.suffix(2)
        return suffix.isEmpty ? "·" : String(suffix)
    }
}

private struct ChannelPopover: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center) {
                Text("频道")
                    .font(AppFont.songti(22))
                    .foregroundStyle(Theme.ink)

                Spacer(minLength: 12)

                Button("关闭") {
                    dismiss()
                }
                .buttonStyle(.plain)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.muted)
            }

            ZStack {
                Circle()
                    .fill(Theme.tealSoft)
                    .frame(width: 46, height: 46)

                Image(systemName: "number")
                    .font(.system(size: 17, weight: .regular))
                    .foregroundStyle(Theme.tealDeep)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 24)

            Text("还没有加入任何频道")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Theme.inkSoft)
                .frame(maxWidth: .infinity)
                .padding(.top, 14)

            Text("加入频道后，频道里的内容会出现在这里。")
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.top, 6)
        }
        .padding(20)
        .frame(width: 280)
        .background(Theme.surface)
    }
}
