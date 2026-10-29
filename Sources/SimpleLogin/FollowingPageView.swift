import AppKit
import SwiftUI

enum AppSection: Equatable {
    case feed
    case nightMarket
    case slowLetter
    case profile
}

struct HomeView: View {
    let session: Session
    let onSignOut: () -> Void

    @State private var section: AppSection = .feed
    @StateObject private var roomStore = RoomStore()
    @StateObject private var feedStore = FollowingStore()
    @StateObject private var nightStore = NightMarketStore()

    var body: some View {
        HStack(spacing: 0) {
            SidebarRail(
                session: session,
                section: $section,
                onBack: {
                    guard section != .feed else { return }
                    withAnimation(.easeOut(duration: 0.18)) {
                        section = .feed
                    }
                }
            ) {
                onSignOut()
            }
            .frame(width: 76)

            Group {
                ZStack {
                    FollowingView(leadingChromeWidth: 76, store: feedStore)
                        .opacity(section == .feed ? 1 : 0)
                        .allowsHitTesting(section == .feed)
                        .disabled(section != .feed)
                        .accessibilityHidden(section != .feed)

                    switch section {
                    case .feed:
                        EmptyView()
                    case .nightMarket:
                        NightMarketPage(
                            session: session,
                            roomStore: roomStore,
                            nightStore: nightStore
                        )
                    case .slowLetter:
                        SlowLetterPage()
                    case .profile:
                        ProfilePage(session: session)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
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
        .overlay(alignment: .bottomTrailing) {
            if roomStore.activeChannel != nil, section != .nightMarket {
                FloatingRoomCard(store: roomStore) {
                    withAnimation(.easeOut(duration: 0.2)) {
                        section = .nightMarket
                    }
                }
                .padding(.trailing, 28)
                .padding(.bottom, 24)
            }
        }

    }
}

private struct SidebarRail: View {
    let session: Session
    @Binding var section: AppSection
    let onBack: () -> Void
    let onSignOut: () -> Void

    @State private var showingChannels = false
    @State private var showingSettings = false
    @State private var hoveringBack = false
    @State private var hoveringChannel = false
    @State private var hoveringSettings = false

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 10) {
                backButton
                railItem(icon: "house", label: "主页", selected: section == .feed) {
                    section = .feed
                }
                railItem(icon: "bubble.left", label: "消息", selected: false)
                channelItem
                railItem(icon: "moon.stars", label: "夜市", selected: section == .nightMarket) {
                    section = .nightMarket
                }
                railItem(icon: "envelope", label: "慢信", selected: section == .slowLetter) {
                    section = .slowLetter
                }
            }
            .padding(.top, 12)

            Spacer(minLength: 20)

            accountArea
                .padding(.bottom, 20)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.paper)
        .sheet(isPresented: $showingSettings) {
            SettingsSheet(session: session, onSignOut: onSignOut)
        }
    }

    private var canGoBack: Bool {
        section != .feed
    }

    private var backButton: some View {
        Button {
            onBack()
        } label: {
            Image(systemName: "chevron.left")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(canGoBack ? Theme.inkSoft : Theme.faint.opacity(0.45))
                .frame(width: 32, height: 32)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(canGoBack && hoveringBack ? Theme.hover : Color.clear)
                )
                .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!canGoBack)
        .onHover { hovering in
            withAnimation(.easeOut(duration: 0.14)) {
                hoveringBack = hovering
            }
        }
        .help(canGoBack ? "返回" : "没有可返回的页面")
        .accessibilityLabel("返回")
    }

    @ViewBuilder
    private func railItem(
        icon: String,
        label: String,
        selected: Bool,
        action: (() -> Void)? = nil
    ) -> some View {
        if let action {
            Button(action: action) {
                railItemLabel(icon: icon, label: label, selected: selected)
            }
            .buttonStyle(.plain)
            .help(label)
            .accessibilityLabel(label)
            .accessibilityAddTraits(selected ? [.isSelected] : [])
        } else {
            railItemLabel(icon: icon, label: label, selected: selected)
        }
    }

    private func railItemLabel(icon: String, label: String, selected: Bool) -> some View {
        VStack(spacing: 3) {
            Image(systemName: icon)
                .font(.system(size: 19, weight: .regular))

            Text(label)
                .font(.system(size: 9.5, weight: selected ? .medium : .regular))
                .tracking(0.2)
        }
        .foregroundStyle(selected ? Theme.tealDeep : Theme.muted)
        .frame(width: 56, height: 46)
        .background(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(selected ? Theme.tealSoft : Color.clear)
        )
        .contentShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
    }

    private var channelItem: some View {
        Button {
            showingChannels = true
        } label: {
            railItemLabel(icon: "number", label: "频道", selected: false)
                .background(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .fill(hoveringChannel ? Theme.hover : Color.clear)
                )
        }
        .buttonStyle(.plain)
        .onHover { hoveringChannel = $0 }
        .help("频道")
        .accessibilityLabel("频道")
        .popover(isPresented: $showingChannels, arrowEdge: .trailing) {
            ChannelPopover()
        }
    }

    private var accountArea: some View {
        VStack(spacing: 6) {
            settingsButton
            avatarButton
        }
    }

    private var settingsButton: some View {
        Button {
            showingSettings = true
        } label: {
            Image(systemName: "gearshape")
                .font(.system(size: 16, weight: .regular))
                .foregroundStyle(Theme.muted)
                .frame(width: 30, height: 30)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(hoveringSettings ? Theme.hover : Color.clear)
                )
                .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            withAnimation(.easeOut(duration: 0.14)) {
                hoveringSettings = hovering
            }
        }
        .help("设置")
        .accessibilityLabel("设置")
    }

    private var avatarButton: some View {
        Button {
            section = .profile
        } label: {
            ZStack {
                Circle()
                    .fill(Theme.tealSoft)
                    .frame(width: 34, height: 34)

                Text(session.avatarMark)
                    .font(.system(size: 10.5, weight: .semibold))
                    .foregroundStyle(Theme.tealDeep)

                if section == .profile {
                    Circle()
                        .strokeBorder(Theme.teal, lineWidth: 1.5)
                        .frame(width: 38, height: 38)
                }
            }
            .frame(width: 40, height: 40)
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .help("个人主页")
        .accessibilityLabel("个人主页")
        .accessibilityAddTraits(section == .profile ? [.isSelected] : [])
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
