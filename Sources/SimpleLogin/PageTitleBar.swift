import SwiftUI

struct PageTitleBar: View {
    let title: String

    var body: some View {
        VStack(spacing: 0) {
            Text(title)
                .font(AppFont.songti(19))
                .foregroundStyle(Theme.ink)
                .frame(maxWidth: .infinity)
                .frame(height: 56)

            Rectangle()
                .fill(Theme.line)
                .frame(height: 1)
        }
    }
}
