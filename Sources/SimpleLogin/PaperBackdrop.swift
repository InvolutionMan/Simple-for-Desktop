import SwiftUI

struct PaperBackdrop: View {
    var showsNightDots = false

    var body: some View {
        ZStack {
            Theme.paper

            LinearGradient(
                colors: [
                    Color(hex: 0xFCF9F3),
                    Theme.paper,
                    Color(hex: 0xF7F3EB)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            Rectangle()
                .fill(
                    RadialGradient(
                        colors: [
                            Theme.tealSoft.opacity(0.55),
                            Color.clear
                        ],
                        center: UnitPoint(x: 0.82, y: 0.12),
                        startRadius: 0,
                        endRadius: 380
                    )
                )

            Rectangle()
                .fill(
                    RadialGradient(
                        colors: [
                            Color(hex: 0xF1E7D8).opacity(0.4),
                            Color.clear
                        ],
                        center: UnitPoint(x: 0.16, y: 0.88),
                        startRadius: 0,
                        endRadius: 330
                    )
                )

            if showsNightDots {
                LightNightDots()
            }
        }
        .ignoresSafeArea()
    }
}

private struct LightNightDots: View {
    var body: some View {
        Canvas { context, size in
            for index in 0..<36 {
                let x = CGFloat((index * 97 + 23) % 997) / 997.0 * size.width
                let y = CGFloat((index * 193 + 37) % 991) / 991.0 * size.height
                let isBright = index % 8 == 0
                let radius: CGFloat = isBright ? 1.2 : 0.65
                let rect = CGRect(
                    x: x,
                    y: y,
                    width: radius * 2,
                    height: radius * 2
                )

                context.fill(
                    Path(ellipseIn: rect),
                    with: .color(
                        isBright
                            ? Theme.tealDeep.opacity(0.2)
                            : Theme.lineStrong.opacity(0.55)
                    )
                )
            }
        }
        .allowsHitTesting(false)
    }
}
