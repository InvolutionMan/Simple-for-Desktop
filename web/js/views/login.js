// 登录：手机号 + 4 位短信验证码。
// 真实模式走官方短信接口；离线预览的码由服务端随机生成、打印在终端、5 分钟一次性有效。

import { api } from "../api.js?v=20261101bf";
import { esc, icon, mark } from "../ui.js?v=20261101bf";
import { maskPhone } from "../format.js?v=20261101bf";

export function mountLogin(root, { onLogin, mock = false, onPreview } = {}) {
  root.innerHTML = `
    <div class="login-page">
      <div class="login-card">
      <section class="login-brand">
        <div class="brand-row">${mark(22, "var(--brand-ink)", "var(--brand-paper)")}<span>Simple</span></div>
        <div class="brand-statement">
          <div class="brand-eyebrow">
            ${["单", "纯", "交", "个"].map((character) => `<span>${character}</span>`).join("")}
            <span class="bracket tl"></span>
          </div>
          <h1 class="brand-word">朋友<span class="bracket br"></span></h1>
        </div>
      </section>

      <section class="login-panel">
        <form class="login-form" novalidate>
          <h2 class="auth-title">登录</h2>
          <p class="auth-sub">输入手机号，获取短信验证码即可登录。</p>

          <div class="error-summary" hidden data-summary></div>

          <div class="field">
            <label class="field-label" for="login-phone">手机号</label>
            <div class="field-box" data-phone-box>
              <span class="phone-prefix">+86</span>
              <span class="field-divider"></span>
              <input class="field-input" id="login-phone" data-phone type="tel" inputmode="numeric"
                autocomplete="tel" maxlength="11" placeholder="请输入手机号">
            </div>
            <span class="field-error" data-phone-error></span>
          </div>

          <div class="field">
            <span class="field-label" id="login-code-label">验证码</span>
            <div class="field-box otp-box" data-code-box>
              <div class="otp-cells" data-otp role="group" aria-labelledby="login-code-label">
                <input class="otp-cell" data-otp-cell inputmode="numeric" autocomplete="one-time-code"
                  aria-label="验证码第 1 位">
                <input class="otp-cell" data-otp-cell inputmode="numeric" aria-label="验证码第 2 位">
                <input class="otp-cell" data-otp-cell inputmode="numeric" aria-label="验证码第 3 位">
                <input class="otp-cell" data-otp-cell inputmode="numeric" aria-label="验证码第 4 位">
              </div>
              <span class="field-divider"></span>
              <button class="field-action" type="button" data-send>获取验证码</button>
            </div>
            <span class="field-error" data-code-error></span>
          </div>

          <p class="sent-hint" data-sent hidden>
            ${icon("check")}<span data-sent-text></span>
          </p>

          <button class="primary-button" type="submit" data-submit>登录</button>

          ${
            mock
              ? `<p class="dev-link">这是离线预览，<button type="button" data-preview>用假数据进入</button></p>`
              : ""
          }
        </form>
      </section>
      </div>
    </div>`;

  const form = root.querySelector(".login-form");
  const phone = root.querySelector("[data-phone]");
  const cells = Array.from(root.querySelectorAll("[data-otp-cell]"));
  const phoneBox = root.querySelector("[data-phone-box]");
  const codeBox = root.querySelector("[data-code-box]");
  const phoneError = root.querySelector("[data-phone-error]");
  const codeError = root.querySelector("[data-code-error]");
  const summary = root.querySelector("[data-summary]");
  const sentHint = root.querySelector("[data-sent]");
  const sentText = root.querySelector("[data-sent-text]");
  const sendButton = root.querySelector("[data-send]");
  const submitButton = root.querySelector("[data-submit]");

  let sent = false;
  let countdown = 0;
  let timer = null;
  let sendingCode = false;
  let submitting = false;
  let errors = { phone: "", code: "" };

  phone.addEventListener("input", () => {
    phone.value = phone.value.replace(/\D/g, "").slice(0, 11);
    if (errors.phone) {
      errors.phone = "";
      paintErrors();
    }
  });

  cells.forEach((cell, index) => {
    cell.addEventListener("input", () => {
      const digits = cell.value.replace(/\D/g, "");

      // 系统「短信验证码自动填充」会一次性塞进 4 位，这里分发到四个格子。
      if (digits.length > 1) {
        fillCode(digits);
        focusCell(Math.min(digits.length, cells.length - 1));
      } else {
        cell.value = digits.slice(-1);
        if (cell.value && index < cells.length - 1) {
          focusCell(index + 1);
        }
      }

      if (errors.code) {
        errors.code = "";
        paintErrors();
      }
    });

    cell.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !cell.value) {
        event.preventDefault();
        if (index > 0) {
          cells[index - 1].value = "";
          focusCell(index - 1);
        }
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        focusCell(index - 1);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        focusCell(index + 1);
        return;
      }
      if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        form.requestSubmit();
      }
    });

    cell.addEventListener("paste", (event) => {
      event.preventDefault();
      const text = (event.clipboardData?.getData("text") || "")
        .replace(/\D/g, "")
        .slice(0, cells.length);
      if (!text) return;
      fillCode(text);
      focusCell(text.length >= cells.length ? cells.length - 1 : text.length);
      if (errors.code) {
        errors.code = "";
        paintErrors();
      }
    });

    cell.addEventListener("focus", () => {
      cell.select();
    });
  });

  sendButton.addEventListener("click", requestCode);
  form.addEventListener("submit", submit);
  root.querySelector("[data-preview]")?.addEventListener("click", () => {
    onPreview?.();
  });

  updateSendLabel();
  phone.focus();

  // ---- 验证码输入 ----

  function codeValue() {
    return cells.map((cell) => cell.value).join("");
  }

  function fillCode(value) {
    const digits = String(value).replace(/\D/g, "").slice(0, cells.length);
    cells.forEach((cell, index) => {
      cell.value = digits[index] || "";
    });
  }

  function focusCell(index) {
    const target = cells[Math.max(0, Math.min(cells.length - 1, index))];
    target?.focus();
  }

  function firstEmptyCell() {
    const index = cells.findIndex((cell) => !cell.value);
    return index === -1 ? cells.length - 1 : index;
  }

  // ---- 校验 ----

  function validatePhone() {
    const value = phone.value.trim();
    if (!value) return "请输入手机号。";
    if (value.length !== 11) return "手机号应为 11 位数字。";
    if (!value.startsWith("1")) return "手机号应以 1 开头。";
    return "";
  }

  function validateCode() {
    if (!sent) return "请先获取验证码。";
    const value = codeValue();
    if (!value) return "请输入验证码。";
    if (value.length !== 4) return "验证码应为 4 位数字。";
    return "";
  }

  function setError(field, message) {
    errors[field] = message;
    paintErrors();
    if (field === "phone") {
      phone.focus();
    } else {
      focusCell(firstEmptyCell());
    }
  }

  function paintErrors() {
    phoneError.textContent = errors.phone;
    codeError.textContent = errors.code;
    phoneBox.classList.toggle("invalid", Boolean(errors.phone));
    codeBox.classList.toggle("invalid", Boolean(errors.code));
    phone.setAttribute("aria-invalid", String(Boolean(errors.phone)));
    cells.forEach((cell) => cell.setAttribute("aria-invalid", String(Boolean(errors.code))));

    const entries = Object.entries(errors).filter(([, message]) => message);
    if (entries.length <= 1) {
      summary.hidden = true;
      summary.innerHTML = "";
      return;
    }

    summary.hidden = false;
    summary.innerHTML =
      `<div class="error-summary-title"><span aria-hidden="true">!</span>请检查以下 ${entries.length} 项</div>` +
      entries
        .map(
          ([field, message]) =>
            `<button type="button" data-focus="${field}">${field === "phone" ? "手机号" : "验证码"}：${esc(message)}</button>`,
        )
        .join("");

    summary.querySelectorAll("[data-focus]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.focus === "phone") {
          phone.focus();
        } else {
          focusCell(firstEmptyCell());
        }
      });
    });
  }

  // ---- 发码 ----

  async function requestCode() {
    if (sendingCode || submitting || countdown > 0) return;

    const message = validatePhone();
    if (message) {
      setError("phone", message);
      return;
    }

    sendingCode = true;
    errors = { phone: "", code: "" };
    paintErrors();
    updateSendLabel();

    try {
      const data = await api.sendCode(phone.value);
      sent = true;
      countdown = Number(data.cooldown || 60);
      fillCode("");
      sentHint.hidden = false;
      sentText.textContent = mock
        ? "验证码已发送（离线预览：请看启动服务的终端）"
        : `验证码已发送至 ${maskPhone(phone.value)}`;
      startCountdown();
      focusCell(0);
    } catch (error) {
      errors.phone = error.message;
      paintErrors();
      if (error.rateLimited) {
        countdown = Number(error.retryAfter || 300);
        startCountdown();
      }
    } finally {
      sendingCode = false;
      updateSendLabel();
    }
  }

  function startCountdown() {
    clearInterval(timer);
    updateSendLabel();
    timer = setInterval(() => {
      countdown = Math.max(0, countdown - 1);
      if (countdown === 0) clearInterval(timer);
      updateSendLabel();
    }, 1000);
  }

  function updateSendLabel() {
    sendButton.disabled = sendingCode || submitting || countdown > 0;
    sendButton.textContent =
      countdown > 0
        ? `${countdown} 秒后重发`
        : sendingCode
          ? "发送中…"
          : sent
            ? "重新获取"
            : "获取验证码";
  }

  // ---- 登录 ----

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;

    const value = codeValue();
    errors = { phone: validatePhone(), code: validateCode() };
    paintErrors();

    if (errors.phone || errors.code) {
      const first = errors.phone ? phone : cells[firstEmptyCell()];
      first.focus();
      return;
    }

    submitting = true;
    submitButton.disabled = true;
    submitButton.textContent = "正在登录…";
    updateSendLabel();

    try {
      const data = await api.login(phone.value.trim(), value);
      clearInterval(timer);
      onLogin?.(data.user);
    } catch (error) {
      errors.code = error.message;
      paintErrors();
      focusCell(firstEmptyCell());
    } finally {
      submitting = false;
      submitButton.disabled = false;
      submitButton.textContent = "登录";
      updateSendLabel();
    }
  }
}
