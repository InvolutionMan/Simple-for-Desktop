import SwiftUI

struct SlowLetterPage: View {
    @State private var showingComposer = false

    var body: some View {
        VStack(spacing: 0) {
            PageTitleBar(title: "一封慢信")

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    letterCard
                    receivedEmpty
                        .padding(.top, 24)
                }
                .frame(maxWidth: 720)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 40)
                .padding(.top, 28)
                .padding(.bottom, 36)
            }
            .scrollIndicators(.never)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(PaperBackdrop())
        .sheet(isPresented: $showingComposer) {
            LetterComposer()
        }
    }

    private var letterCard: some View {
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Theme.surface)

            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top) {
                    Text("SLOW LETTER")
                        .font(.system(size: 9.5, weight: .semibold))
                        .tracking(2)
                        .foregroundStyle(Theme.tealDeep)

                    Spacer(minLength: 12)

                    stamp
                }

                Text("一封慢信")
                    .font(AppFont.songti(42))
                    .foregroundStyle(Theme.ink)
                    .padding(.top, 26)

                Text("写一封不着急被读到的信。把此刻的心情折好，交给时间。")
                    .font(.system(size: 14))
                    .lineSpacing(6)
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: 380, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)

                Button {
                    showingComposer = true
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "square.and.pencil")
                            .font(.system(size: 12, weight: .medium))

                        Text("写一封慢信")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundStyle(Theme.tealInk)
                    .padding(.horizontal, 16)
                    .frame(height: 40)
                    .background(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Theme.teal)
                    )
                }
                .buttonStyle(.plain)
                .help("写一封慢信")
                .padding(.top, 24)
            }
            .padding(28)
        }
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(Theme.line, lineWidth: 1)
        )
    }

    private var stamp: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(Theme.surface)

            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .strokeBorder(Theme.lineStrong, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))

            SimpleMark(circle: Theme.ink, bars: Theme.surface)
                .frame(width: 22, height: 22)
        }
        .frame(width: 48, height: 58)
    }

    private var receivedEmpty: some View {
        VStack(spacing: 0) {
            ZStack {
                Circle()
                    .fill(Theme.tealSoft)
                    .frame(width: 64, height: 64)

                Image(systemName: "envelope")
                    .font(.system(size: 21, weight: .regular))
                    .foregroundStyle(Theme.tealDeep)
            }

            Text("还没有收到信")
                .font(AppFont.songti(24))
                .foregroundStyle(Theme.ink)
                .padding(.top, 18)

            Text("收到的信会在这里，慢慢出现。")
                .font(.system(size: 13))
                .foregroundStyle(Theme.muted)
                .padding(.top, 8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 36)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Theme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Theme.line, lineWidth: 1)
        )
    }
}

private struct LetterComposer: View {
    @Environment(\.dismiss) private var dismiss

    @State private var recipient = ""
    @State private var bodyText = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center) {
                Text("写一封慢信")
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

            fieldLabel("写给")
                .padding(.top, 22)

            TextField("收信人的名字", text: $recipient)
                .textFieldStyle(.plain)
                .font(.system(size: 14))
                .padding(.horizontal, 12)
                .frame(height: 42)
                .background(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .fill(Theme.paper)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .strokeBorder(Theme.line, lineWidth: 1)
                )
                .padding(.top, 7)

            fieldLabel("信的内容")
                .padding(.top, 16)

            TextEditor(text: $bodyText)
                .font(.system(size: 14))
                .scrollContentBackground(.hidden)
                .scrollIndicators(.never)
                .padding(10)
                .frame(height: 180)
                .background(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .fill(Theme.paper)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .strokeBorder(Theme.line, lineWidth: 1)
                )
                .padding(.top, 7)

            HStack(spacing: 12) {
                Text("寄出接口会在接入后端后开放。")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.faint)

                Spacer(minLength: 8)

                Button("寄出") { }
                    .buttonStyle(.plain)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.faint)
                    .padding(.horizontal, 16)
                    .frame(height: 38)
                    .background(
                        RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .fill(Theme.paper)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .strokeBorder(Theme.line, lineWidth: 1)
                    )
                    .disabled(true)
            }
            .padding(.top, 16)
        }
        .padding(24)
        .frame(width: 480)
        .background(Theme.surface)
    }

    private func fieldLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 12.5, weight: .medium))
            .foregroundStyle(Theme.inkSoft)
    }
}
