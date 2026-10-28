import Foundation
import SwiftUI

struct LoginView: View {
    @ObservedObject var model: AuthModel

    var body: some View {
        HStack(spacing: 0) {
            BrandPanel()

            AuthPanel(model: model)
                .frame(width: 556)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.paper)
    }
}

// MARK: - Brand column

private struct BrandPanel: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 9) {
                SimpleMark(circle: Theme.ink, bars: Theme.paper)
                    .frame(width: 22, height: 22)

                Text("Simple")
                    .font(AppFont.brand(17))
                    .tracking(0.3)
                    .foregroundStyle(Theme.ink)
            }

            Spacer(minLength: 36)

            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 13) {
                    ForEach(["单", "纯", "交", "个"], id: \.self) { character in
                        Text(character)
                    }
                }
                .font(AppFont.songtiLight(15))
                .foregroundStyle(Theme.muted)
                .overlay(alignment: .topLeading) {
                    BracketShape(anchor: .topLeading)
                        .stroke(Theme.teal.opacity(0.6), lineWidth: 1)
                        .frame(width: 30, height: 30)
                        .offset(x: -20, y: -16)
                }

                Text("朋友")
                    .font(AppFont.songtiLight(118))
                    .tracking(8)
                    .padding(.top, 10)
                    .padding(.leading, 4)
                    .foregroundStyle(Theme.ink)
                    .fixedSize()
                    .overlay(alignment: .bottomTrailing) {
                        BracketShape(anchor: .bottomTrailing)
                            .stroke(Theme.teal.opacity(0.6), lineWidth: 1)
                            .frame(width: 34, height: 34)
                            .offset(x: 22, y: 18)
                    }
            }

            Spacer(minLength: 36)
        }
        .padding(.leading, 64)
        .padding(.trailing, 44)
        .padding(.top, 58)
        .padding(.bottom, 44)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(Theme.paper)
    }
}

// MARK: - Auth column

private struct AuthPanel: View {
    @ObservedObject var model: AuthModel

    @State private var previouslyFocused: AuthField?
    @FocusState private var focusedField: AuthField?

    var body: some View {
        GeometryReader { proxy in
            ScrollView {
                formContent
                    .frame(width: 380)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 48)
                    .frame(minHeight: proxy.size.height, alignment: .center)
            }
            .scrollIndicators(.hidden)
            .padding(.horizontal, 56)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.surface)
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(Theme.line)
                .frame(width: 1)
        }
        .onChange(of: focusedField) { newValue in
            guard newValue != previouslyFocused else { return }
            if let previous = previouslyFocused {
                model.validate(previous)
            }
            previouslyFocused = newValue
        }
    }

    // MARK: Form

    private var formContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("登录")
                .font(AppFont.songti(34))
                .tracking(1)
                .foregroundStyle(Theme.ink)
                .accessibilityAddTraits(.isHeader)

            Text("输入手机号，获取短信验证码即可登录。")
                .font(.system(size: 14))
                .foregroundStyle(Theme.muted)
                .padding(.top, 8)

            if model.showSummary && !model.orderedErrors.isEmpty {
                ErrorSummary(issues: model.orderedErrors) { field in
                    focusedField = field
                }
                .padding(.top, 20)
                .transition(.opacity)
            }

            phoneField
                .padding(.top, model.showSummary ? 18 : 30)

            codeField
                .padding(.top, 15)

            if model.codeSent {
                HStack(spacing: 5) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 11))
                    Text("验证码已发送至 \(model.maskedPhone)")
                        .font(.system(size: 12))
                        .fixedSize(horizontal: false, vertical: true)
                }
                .foregroundStyle(Theme.tealDeep)
                .padding(.top, 8)
                .transition(.opacity)
            }

            PrimaryButton(
                title: "登录",
                loadingTitle: "正在登录…",
                isLoading: model.isSubmitting,
                isEnabled: !model.isBusy
            ) {
                submit()
            }
            .padding(.top, 26)
        }
        .animation(.easeInOut(duration: 0.22), value: model.showSummary)
        .animation(.easeOut(duration: 0.18), value: model.codeSent)
    }

    private var phoneField: some View {
        FieldBlock(label: "手机号", error: model.errors[.phone]) {
            FieldSurface(
                isFocused: focusedField == .phone,
                isInvalid: model.errors[.phone] != nil
            ) {
                HStack(spacing: 0) {
                    Text("+86")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Theme.inkSoft)

                    Rectangle()
                        .fill(Theme.lineStrong)
                        .frame(width: 1, height: 18)
                        .padding(.horizontal, 12)

                    ZStack(alignment: .leading) {
                        if model.phone.isEmpty {
                            PlaceholderText(text: "请输入手机号")
                        }

                        TextField("", text: phoneBinding)
                            .textFieldStyle(.plain)
                            .font(.system(size: 15))
                            .foregroundStyle(Theme.ink)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .focused($focusedField, equals: .phone)
                            .accessibilityLabel("手机号")
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    private var codeField: some View {
        FieldBlock(label: "验证码", error: model.errors[.code]) {
            FieldSurface(
                isFocused: focusedField == .code,
                isInvalid: model.errors[.code] != nil
            ) {
                HStack(spacing: 10) {
                    ZStack(alignment: .leading) {
                        if model.code.isEmpty {
                            PlaceholderText(text: "4 位验证码")
                        }

                        TextField("", text: codeBinding)
                            .textFieldStyle(.plain)
                            .font(.system(size: 15))
                            .foregroundStyle(Theme.ink)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .focused($focusedField, equals: .code)
                            .accessibilityLabel("验证码")
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    Rectangle()
                        .fill(Theme.lineStrong)
                        .frame(width: 1, height: 18)

                    TextLink(
                        title: codeButtonTitle,
                        color: model.countdown > 0 ? Theme.faint : Theme.tealDeep,
                        size: 12.5
                    ) {
                        requestCode()
                    }
                    .disabled(model.countdown > 0 || model.isSubmitting)
                    .frame(width: 94, alignment: .trailing)
                }
            }
        }
    }

    private var codeButtonTitle: String {
        if model.countdown > 0 {
            return "\(model.countdown) 秒后重发"
        }
        return model.codeSent ? "重新获取" : "获取验证码"
    }

    private var phoneBinding: Binding<String> {
        Binding(
            get: { model.phone },
            set: { model.setPhone($0) }
        )
    }

    private var codeBinding: Binding<String> {
        Binding(
            get: { model.code },
            set: { model.setCode($0) }
        )
    }

    // MARK: Actions

    private func requestCode() {
        if let invalidField = model.requestCode() {
            focusedField = invalidField
        } else {
            focusedField = .code
        }
    }

    private func submit() {
        let valid = model.submit()
        if !valid, let field = model.firstInvalidField {
            focusedField = field
        }
    }
}
