// 设置：账号卡 + 退出登录。

import { api } from "../api.js?v=20261101bf";
import { esc, avatarHTML, icon, openModal } from "../ui.js?v=20261101bf";
import { maskPhone } from "../format.js?v=20261101bf";

export function openSettings({ user, onSignOut }) {
  const modal = openModal(
    `
    <div class="panel-head">
      <h2 class="panel-title">设置</h2>
      <button class="panel-close" type="button" data-close>关闭</button>
    </div>
    <p class="settings-label">账号</p>
    <div class="account-card">
      ${avatarHTML({
        url: user.avatar_url,
        name: user.nickname || user.phone,
        color: "beede7",
        size: 38,
      })}
      <div>
        <div class="account-name">${esc(user.nickname || "Simple 用户")}</div>
        <div class="account-meta">${esc([maskPhone(user.phone), "Simple 账号"].filter(Boolean).join(" · "))}</div>
      </div>
    </div>
    <button class="signout-button" type="button" data-signout>
      ${icon("logout")}退出登录
    </button>
    <p class="modal-note">网页版 0.1.0 · 构建 20261101bf。退出会清掉服务端会话，并尝试退出当前所在的房间。</p>`,
    { panelClass: "settings-panel" },
  );

  const button = modal.panel.querySelector("[data-signout]");
  button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = "正在退出…";
    try {
      await api.logout();
    } catch {
      // 本地已经清干净，网络失败也放行。
    }
    modal.close();
    onSignOut?.();
  });
}
