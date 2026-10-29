import SwiftUI

struct SettingsSheet: View {
    let session: Session
    let onSignOut: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center) {
                Text("设置")
                    .font(AppFont.songti(24))
                    .foregroundStyle(Theme.ink)

                Spacer(minLength: 12)

                Button("关闭") {
                    dismiss()
                }
                .buttonStyle(.plain)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.muted)
            }

            Text("账号")
                .font(.system(size: 11.5, weight: .medium))
                .foregroundStyle(Theme.muted)
                .padding(.top, 22)

            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(Theme.tealSoft)
                        .frame(width: 38, height: 38)

                    Text(session.avatarMark)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.tealDeep)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(session.maskedPhone)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Theme.ink)

                    Text("Simple 账号")
                        .font(.system(size: 11.5))
                        .foregroundStyle(Theme.muted)
                }

                Spacer(minLength: 0)
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Theme.paper)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(Theme.line, lineWidth: 1)
            )
            .padding(.top, 8)

            Button {
                signOut()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                        .font(.system(size: 12, weight: .medium))

                    Text("退出登录")
                        .font(.system(size: 12.5, weight: .medium))

                    Spacer(minLength: 0)
                }
                .foregroundStyle(Theme.danger)
                .padding(.horizontal, 14)
                .frame(height: 42)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Theme.dangerSoft)
                )
            }
            .buttonStyle(.plain)
            .padding(.top, 20)

            Text("这是单页预览，退出后会关闭窗口。")
                .font(.system(size: 11))
                .foregroundStyle(Theme.faint)
                .padding(.top, 10)
        }
        .padding(24)
        .frame(width: 380)
        .background(Theme.surface)
    }

    private func signOut() {
        dismiss()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            onSignOut()
        }
    }
}
