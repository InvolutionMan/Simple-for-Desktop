import SwiftUI

struct ProfilePage: View {
    let session: Session

    @State private var selectedTab: ProfileTab = .posts

    var body: some View {
        ZStack {
            PaperBackdrop()

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("PROFILE")
                        .font(.system(size: 9.5, weight: .semibold))
                        .tracking(2)
                        .foregroundStyle(Theme.tealDeep)

                    Text("个人主页")
                        .font(AppFont.songti(38))
                        .foregroundStyle(Theme.ink)
                        .padding(.top, 6)

                    profileHeader
                        .padding(.top, 26)

                    tabBar
                        .padding(.top, 26)

                    emptyState
                        .padding(.top, 28)
                }
                .frame(maxWidth: 760)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 40)
                .padding(.top, 30)
                .padding(.bottom, 36)
            }
            .scrollIndicators(.never)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var profileHeader: some View {
        HStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(Theme.tealSoft)
                    .frame(width: 72, height: 72)

                Text(session.avatarMark)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(Theme.tealDeep)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(session.maskedPhone)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(Theme.ink)

                Text("Simple 账号")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.muted)
            }

            Spacer(minLength: 0)
        }
    }

    private var tabBar: some View {
        VStack(spacing: 0) {
            HStack(spacing: 26) {
                ForEach(ProfileTab.allCases) { tab in
                    Button {
                        selectedTab = tab
                    } label: {
                        Text(tab.rawValue)
                            .font(.system(size: 14, weight: selectedTab == tab ? .semibold : .regular))
                            .foregroundStyle(selectedTab == tab ? Theme.ink : Theme.muted)
                            .frame(minWidth: 40, minHeight: 36)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selectedTab == tab ? [.isSelected] : [])
                }

                Spacer(minLength: 0)
            }

            Rectangle()
                .fill(Theme.line)
                .frame(height: 1)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 0) {
            ZStack {
                Circle()
                    .fill(Theme.tealSoft)
                    .frame(width: 64, height: 64)

                Image(systemName: selectedTab.icon)
                    .font(.system(size: 21, weight: .regular))
                    .foregroundStyle(Theme.tealDeep)
            }

            Text(selectedTab.emptyTitle)
                .font(AppFont.songti(24))
                .foregroundStyle(Theme.ink)
                .padding(.top, 18)

            Text(selectedTab.emptyCopy)
                .font(.system(size: 13))
                .foregroundStyle(Theme.muted)
                .padding(.top, 8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 36)
    }
}

private enum ProfileTab: String, CaseIterable, Identifiable {
    case posts = "动态"

    var id: String { rawValue }

    var icon: String {
        "square.and.pencil"
    }

    var emptyTitle: String {
        "还没有发布动态"
    }

    var emptyCopy: String {
        "你发布的动态会出现在这里。"
    }
}
