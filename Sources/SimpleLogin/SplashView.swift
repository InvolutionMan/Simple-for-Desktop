import SwiftUI

struct SplashView: View {
    let onDismiss: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var revealed = false

    var body: some View {
        ZStack {
            Theme.splashInk
                .ignoresSafeArea()

            lockup
                .offset(y: -52)

            VStack(spacing: 0) {
                Spacer(minLength: 0)

                brandLockup
                    .opacity(revealed ? 1 : 0)
                    .offset(y: revealed ? 0 : 8)
                    .animation(revealAnimation(delay: 0.62), value: revealed)
            }
            .padding(.bottom, 56)
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: onDismiss)
        .onAppear { revealed = true }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Simple。单纯交个朋友。")
        .accessibilityAddTraits(.isStaticText)
        .accessibilityAction(named: Text("跳过")) {
            onDismiss()
        }
    }

    // MARK: - Statement

    private var lockup: some View {
        VStack(spacing: 18) {
            HStack(spacing: 26) {
                ForEach(["单", "纯", "交", "个"], id: \.self) { character in
                    Text(character)
                }
            }
            .font(AppFont.songtiLight(21))
            .foregroundStyle(Color(hex: 0xC8C4BD))
            .overlay(alignment: .topLeading) {
                BracketShape(anchor: .topLeading)
                    .stroke(Color.white.opacity(0.32), lineWidth: 1)
                    .frame(width: 34, height: 34)
                    .offset(x: -24, y: -20)
            }
            .opacity(revealed ? 1 : 0)
            .offset(y: revealed ? 0 : 8)
            .animation(revealAnimation(delay: 0.10), value: revealed)

            Text("朋友")
                .font(AppFont.songtiBold(150))
                .tracking(10)
                .padding(.leading, 10)
                .foregroundStyle(Color(hex: 0xF7F5F0))
                .fixedSize()
                .overlay(alignment: .bottomTrailing) {
                    BracketShape(anchor: .bottomTrailing)
                        .stroke(Color.white.opacity(0.32), lineWidth: 1)
                        .frame(width: 40, height: 40)
                        .offset(x: 26, y: 22)
                }
                .opacity(revealed ? 1 : 0)
                .offset(y: revealed ? 0 : 14)
                .animation(revealAnimation(delay: 0.30), value: revealed)
        }
        .accessibilityHidden(true)
    }

    private var brandLockup: some View {
        HStack(spacing: 12) {
            SimpleMark(circle: Color(hex: 0xF7F5F0), bars: Theme.splashInk)
                .frame(width: 38, height: 38)

            Text("Simple")
                .font(AppFont.brand(27))
                .tracking(0.4)
                .foregroundStyle(Color(hex: 0xF7F5F0))
        }
        .accessibilityHidden(true)
    }

    private func revealAnimation(delay: Double) -> Animation? {
        reduceMotion ? nil : .easeOut(duration: 0.9).delay(delay)
    }
}
