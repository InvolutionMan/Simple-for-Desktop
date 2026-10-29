import Foundation
import SwiftUI

enum AuthField: String, CaseIterable, Identifiable {
    case phone
    case code

    var id: String { rawValue }

    var label: String {
        switch self {
        case .phone: return "手机号"
        case .code: return "验证码"
        }
    }
}

struct Session: Equatable {
    let phone: String
    var userID: String?
    var nickname: String?
    var avatarURL: URL?
    var token: String?

    var maskedPhone: String {
        guard phone.count == 11 else { return phone }
        return "\(phone.prefix(3)) **** \(phone.suffix(4))"
    }

    var displayName: String {
        if let nickname, !nickname.isEmpty { return nickname }
        return maskedPhone
    }

    var avatarMark: String {
        if let nickname, !nickname.isEmpty { return String(nickname.prefix(1)) }
        let suffix = phone.suffix(2)
        return suffix.isEmpty ? "·" : String(suffix)
    }

    var initial: String {
        let source = (nickname?.isEmpty == false ? nickname! : phone)
        return String(source.prefix(1))
    }
}

struct FieldIssue: Identifiable, Equatable {
    let field: AuthField
    let message: String
    var id: AuthField { field }
}

enum Validation {
    static func isMainlandPhone(_ value: String) -> Bool {
        guard value.count == 11 else { return false }
        guard value.allSatisfy({ $0.isASCII && $0.isNumber }) else { return false }
        return value.hasPrefix("1")
    }
}

final class AuthModel: ObservableObject {
    @Published var phone = ""
    @Published var code = ""
    @Published private(set) var countdown = 0
    @Published var codeSent = false
    @Published var isSubmitting = false
    @Published var errors: [AuthField: String] = [:]
    @Published var showSummary = false
    @Published var session: Session?

    private var timer: Timer?
    private var didAttemptSubmit = false

    private let api = SimpleAPI()
    private var authToken: String?
    private var pendingMessageID: String?
    private var requestInFlight = false

    var isBusy: Bool { isSubmitting }

    var maskedPhone: String { session?.maskedPhone ?? phone }

    var orderedErrors: [FieldIssue] {
        AuthField.allCases.compactMap { field in
            guard let message = errors[field] else { return nil }
            return FieldIssue(field: field, message: message)
        }
    }

    var firstInvalidField: AuthField? {
        AuthField.allCases.first { errors[$0] != nil }
    }

    // MARK: - 输入

    func setPhone(_ raw: String) {
        let digits = String(raw.filter { $0.isASCII && $0.isNumber }.prefix(11))
        guard raw != phone else { return }

        let changed = digits != phone
        phone = digits

        if changed {
            clearError(.phone)
            resetVerification()
        }
    }

    func setCode(_ raw: String) {
        let digits = String(raw.filter { $0.isASCII && $0.isNumber }.prefix(4))
        guard raw != code else { return }
        code = digits
        clearError(.code)
    }

    func clearError(_ field: AuthField) {
        guard errors[field] != nil else { return }
        errors[field] = nil
        if errors.isEmpty {
            showSummary = false
        }
    }

    func validate(_ field: AuthField) {
        if !didAttemptSubmit && isEmpty(field) {
            errors[field] = nil
            if errors.isEmpty {
                showSummary = false
            }
            return
        }

        let message: String?
        switch field {
        case .phone: message = phoneMessage()
        case .code: message = codeMessage()
        }
        errors[field] = message
        if errors.isEmpty {
            showSummary = false
        }
    }

    // MARK: - 恢复上次登录

    /// 启动时若本地有可用令牌，直接进入已登录状态。
    func restoreSession() async {
        guard session == nil else { return }
        guard let saved = SessionVault.load() else { return }
        guard let token = saved["token"] as? String, !token.isEmpty else { return }

        // 只有服务端明确说令牌无效（401）才清空凭据；
        // 网络错误保留，下次启动再试，否则断网一次就丢登录态。
        do {
            let valid = try await api.validate(token: token)
            guard valid else {
                SessionVault.clear()
                return
            }
        } catch {
            return
        }
        let number = (saved["phone"] as? String) ?? ""
        await MainActor.run {
            self.session = Session(
                phone: number,
                userID: saved["user_id"] as? String,
                nickname: (saved["nickname"] as? String).flatMap { $0.isEmpty ? nil : $0 },
                avatarURL: nil,
                token: token
            )
        }
    }

    // MARK: - 真实接口

    @discardableResult
    func requestCode() -> AuthField? {
        guard !isSubmitting, countdown == 0, !requestInFlight else { return nil }

        if let message = phoneMessage() {
            errors[.phone] = message
            return .phone
        }

        clearError(.phone)
        errors[.code] = nil
        showSummary = false
        code = ""
        requestInFlight = true

        let number = phone
        Task { [weak self] in
            guard let self else { return }
            do {
                let auth = try await self.api.authToken()
                let messageID = try await self.api.requestCode(phone: number, authToken: auth)
                await MainActor.run {
                    self.requestInFlight = false
                    self.authToken = auth
                    self.pendingMessageID = messageID
                    self.codeSent = true
                    self.startCountdown(seconds: 60)
                }
            } catch {
                await MainActor.run {
                    self.requestInFlight = false
                    let apiError = error as? APIError
                    self.errors[.phone] = apiError?.userMessage ?? "验证码发送失败，请稍后再试。"
                    if apiError?.isRateLimited == true {
                        self.startCountdown(seconds: 300)
                    }
                }
            }
        }
        return nil
    }

    @discardableResult
    func submit() -> Bool {
        guard !isSubmitting else { return true }
        didAttemptSubmit = true
        let messages = allMessages()
        errors = messages
        showSummary = messages.count > 1
        guard messages.isEmpty else { return false }

        guard let messageID = pendingMessageID else {
            errors[.code] = "请先获取验证码。"
            return false
        }

        isSubmitting = true
        let number = phone
        let codeValue = code

        Task { [weak self] in
            guard let self else { return }
            do {
                let verified = try await self.api.verify(messageID: messageID, code: codeValue)
                let valid = try await self.api.validate(token: verified.token)
                await MainActor.run {
                    self.isSubmitting = false
                    guard valid else {
                        self.errors[.code] = "登录校验未通过，请重新获取验证码。"
                        self.pendingMessageID = nil
                        return
                    }
                    SessionVault.save(
                        token: verified.token,
                        phone: number,
                        userID: verified.userID,
                        nickname: verified.nickname
                    )
                    self.session = Session(
                        phone: number,
                        userID: verified.userID,
                        nickname: verified.nickname,
                        avatarURL: nil,
                        token: verified.token
                    )
                }
            } catch {
                await MainActor.run {
                    self.isSubmitting = false
                    self.errors[.code] = (error as? APIError)?.userMessage ?? "登录失败，请稍后再试。"
                }
            }
        }
        return true
    }

    func signOut() {
        session = nil
        code = ""
        codeSent = false
        stopCountdown()
        errors = [:]
        showSummary = false
        didAttemptSubmit = false
        authToken = nil
        pendingMessageID = nil
        SessionVault.clear()
    }

    // MARK: - 内部

    private func resetVerification() {
        guard codeSent || !code.isEmpty || countdown > 0 else { return }
        stopCountdown()
        codeSent = false
        code = ""
        errors[.code] = nil
        pendingMessageID = nil
        authToken = nil
    }

    private func startCountdown(seconds: Int = 60) {
        stopCountdown()
        countdown = seconds

        let timer = Timer(timeInterval: 1, repeats: true) { [weak self] timer in
            guard let self else {
                timer.invalidate()
                return
            }

            if self.countdown <= 1 {
                self.countdown = 0
                timer.invalidate()
                self.timer = nil
            } else {
                self.countdown -= 1
            }
        }

        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
    }

    private func stopCountdown() {
        timer?.invalidate()
        timer = nil
        countdown = 0
    }

    private func isEmpty(_ field: AuthField) -> Bool {
        switch field {
        case .phone: return phone.isEmpty
        case .code: return code.isEmpty
        }
    }

    private func allMessages() -> [AuthField: String] {
        var messages: [AuthField: String] = [:]
        if let message = phoneMessage() { messages[.phone] = message }
        if let message = codeMessage() { messages[.code] = message }
        return messages
    }

    private func phoneMessage() -> String? {
        if phone.isEmpty {
            return "请输入手机号。"
        }
        if phone.count != 11 {
            return "手机号应为 11 位数字。"
        }
        if !Validation.isMainlandPhone(phone) {
            return "手机号应以 1 开头。"
        }
        return nil
    }

    private func codeMessage() -> String? {
        if !codeSent {
            return "请先获取验证码。"
        }
        if code.isEmpty {
            return "请输入验证码。"
        }
        if code.count != 4 {
            return "验证码应为 4 位数字。"
        }
        return nil
    }

    deinit {
        timer?.invalidate()
    }
}
