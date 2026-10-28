import Foundation
import SwiftUI

struct RootView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @StateObject private var model = AuthModel()
    @State private var showSplash = true
    @State private var stage: Stage = .login

    private enum Stage { case login, home }

    var body: some View {
        ZStack {
            if stage == .home, let session = model.session {
                HomeView(session: session) {
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.25)) {
                        model.signOut()
                        stage = .login
                    }
                }
                .transition(.opacity)
                .allowsHitTesting(!showSplash)
            } else {
                LoginView(model: model)
                    .allowsHitTesting(!showSplash)
                    .accessibilityHidden(showSplash)
            }

            if showSplash {
                SplashView(onDismiss: dismissSplash)
                    .transition(.opacity)
                    .zIndex(1)
            }
        }
        .background(Theme.paper)
        .onAppear(perform: scheduleSplashDismissal)
        .onExitCommand(perform: dismissSplash)
        .onChange(of: model.session) { session in
            guard !showSplash else { return }
            withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.3)) {
                stage = session == nil ? .login : .home
            }
        }
        .task {
            await model.restoreSession()
        }
    }

    private func scheduleSplashDismissal() {
        let delay: TimeInterval = reduceMotion ? 1.8 : 2.8
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            dismissSplash()
        }
    }

    private func dismissSplash() {
        guard showSplash else { return }
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.55)) {
            showSplash = false
        }
        if model.session != nil {
            stage = .home
        }
    }
}
