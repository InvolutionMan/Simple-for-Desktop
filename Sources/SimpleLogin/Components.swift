import SwiftUI

// MARK: - Brand mark

struct SimpleMark: View {
    var circle: Color
    var bars: Color

    var body: some View {
        Canvas { context, size in
            let diameter = min(size.width, size.height)
            let origin = CGPoint(x: (size.width - diameter) / 2, y: (size.height - diameter) / 2)
            let circleRect = CGRect(origin: origin, size: CGSize(width: diameter, height: diameter))
            context.fill(Path(ellipseIn: circleRect), with: .color(circle))

            let heights: [CGFloat] = [0.30, 0.54, 0.80, 0.52, 0.28]
            let barWidth = diameter * 0.072
            let gap = diameter * 0.056
            let totalWidth = barWidth * CGFloat(heights.count) + gap * CGFloat(heights.count - 1)
            var x = origin.x + (diameter - totalWidth) / 2

            for height in heights {
                let barHeight = diameter * height
                let rect = CGRect(
                    x: x,
                    y: origin.y + (diameter - barHeight) / 2,
                    width: barWidth,
                    height: barHeight
                )
                context.fill(Path(roundedRect: rect, cornerRadius: barWidth / 2), with: .color(bars))
                x += barWidth + gap
            }
        }
        .rotationEffect(.degrees(8))
        .accessibilityHidden(true)
    }
}

// MARK: - Decorative corner bracket

struct BracketShape: Shape {
    enum Anchor {
        case topLeading
        case bottomTrailing
    }

    let anchor: Anchor

    func path(in rect: CGRect) -> Path {
        var path = Path()
        switch anchor {
        case .topLeading:
            path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
            path.addLine(to: CGPoint(x: rect.minX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        case .bottomTrailing:
            path.move(to: CGPoint(x: rect.maxX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
            path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        }
        return path
    }
}

// MARK: - Buttons

struct PressFeedbackStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.86 : 1)
            .scaleEffect(configuration.isPressed ? 0.995 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

struct PrimaryButton: View {
    let title: String
    var loadingTitle: String = "请稍候…"
    var isLoading: Bool = false
    var isEnabled: Bool = true
    let action: () -> Void

    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 9) {
                if isLoading {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .controlSize(.small)
                        .tint(Theme.tealInk)
                }
                Text(isLoading ? loadingTitle : title)
                    .font(.system(size: 15, weight: .semibold))
                    .lineLimit(1)
            }
            .foregroundStyle(Theme.tealInk)
            .frame(maxWidth: .infinity)
            .frame(height: 48)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(fill)
            )
            .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(PressFeedbackStyle())
        .onHover { hovering = $0 }
        .disabled(!isEnabled || isLoading)
        .keyboardShortcut(.defaultAction)
    }

    private var fill: Color {
        if isLoading { return Theme.teal.opacity(0.72) }
        return hovering && isEnabled ? Color(hex: 0x00C9C2) : Theme.teal
    }
}

struct TextLink: View {
    let title: String
    var color: Color = Theme.tealDeep
    var size: CGFloat = 13
    var weight: Font.Weight = .medium
    let action: () -> Void

    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: size, weight: weight))
                .underline(hovering)
                .foregroundStyle(color)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
    }
}

// MARK: - Form surfaces

struct FieldSurface<Content: View>: View {
    var isFocused: Bool
    var isInvalid: Bool
    let content: Content

    init(isFocused: Bool, isInvalid: Bool, @ViewBuilder content: () -> Content) {
        self.isFocused = isFocused
        self.isInvalid = isInvalid
        self.content = content()
    }

    var body: some View {
        content
            .padding(.horizontal, 14)
            .frame(height: 46)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(Theme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(borderColor, lineWidth: 1)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(Theme.teal.opacity(0.20), lineWidth: 3)
                    .padding(-2)
                    .opacity(isFocused && !isInvalid ? 1 : 0)
            )
            .animation(.easeOut(duration: 0.16), value: isFocused)
            .animation(.easeOut(duration: 0.16), value: isInvalid)
    }

    private var borderColor: Color {
        if isInvalid { return Theme.danger }
        return isFocused ? Theme.tealDeep : Theme.line
    }
}

struct FieldBlock<Content: View>: View {
    let label: String
    let error: String?
    let content: Content

    init(label: String, error: String?, @ViewBuilder content: () -> Content) {
        self.label = label
        self.error = error
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(label)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Theme.inkSoft)

            content

            if let error {
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .font(.system(size: 10.5))
                    Text(error)
                        .font(.system(size: 12))
                        .fixedSize(horizontal: false, vertical: true)
                }
                .foregroundStyle(Theme.danger)
                .accessibilityElement(children: .combine)
                .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.16), value: error)
    }
}

struct PlaceholderText: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 15))
            .foregroundStyle(Theme.placeholder)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

// MARK: - Error summary

struct ErrorSummary: View {
    let issues: [FieldIssue]
    let onSelect: (AuthField) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "exclamationmark.circle.fill")
                    .font(.system(size: 11))
                Text("请检查以下 \(issues.count) 项")
                    .font(.system(size: 12.5, weight: .semibold))
            }

            ForEach(issues) { issue in
                Button {
                    onSelect(issue.field)
                } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 3) {
                        Text(issue.field.label + "：")
                            .fontWeight(.semibold)
                        Text(issue.message)
                    }
                    .font(.system(size: 12))
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(Theme.danger)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .foregroundStyle(Theme.danger)
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(Theme.dangerSoft)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .strokeBorder(Theme.danger.opacity(0.16), lineWidth: 1)
        )
    }
}
