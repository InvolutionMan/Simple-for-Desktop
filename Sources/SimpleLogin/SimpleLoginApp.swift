import AppKit
import SwiftUI

@main
struct SimpleLoginApp: App {
    var body: some Scene {
        WindowGroup("Simple") {
            RootView()
                .frame(minWidth: 1060, minHeight: 700)
                .preferredColorScheme(.light)
                .tint(Theme.tealDeep)
                .background(WindowConfigurator())
        }
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentMinSize)
        .defaultSize(width: 1180, height: 730)
    }
}

private final class ConfiguredWindowView: NSView {
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        guard let window else { return }

        window.titlebarAppearsTransparent = true
        window.isMovableByWindowBackground = true
        window.backgroundColor = NSColor(calibratedRed: 0.984, green: 0.980, blue: 0.973, alpha: 1)

        _ = NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
    }
}

private struct WindowConfigurator: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        ConfiguredWindowView()
    }

    func updateNSView(_ nsView: NSView, context: Context) { }
}
