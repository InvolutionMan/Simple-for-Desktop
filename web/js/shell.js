// 外壳：200px 左侧导航 + 主内容 + 哈希路由。

import { api } from "./api.js?v=20261101bf";
import { esc, avatarHTML, icon, mark, toast } from "./ui.js?v=20261101bf";
import { mountFeed, openPublish } from "./views/feed.js?v=20261101bf";
import { mountNight } from "./views/night.js?v=20261101bf";
import { mountRoom } from "./views/room.js?v=20261101bf";
import { mountProfile } from "./views/profile.js?v=20261101bf";
import { mountSlowLetter } from "./views/slowletter.js?v=20261101bf";
import { openSettings } from "./views/settings.js?v=20261101bf";
import { mountChannels } from "./views/channels.js?v=20261101bf";
import { mountMessages } from "./views/messages.js?v=20261101bf";
import { currentTheme, toggleTheme } from "./theme.js?v=20261101bf";

const ROOM_KEY = "simple.room.";

export function mountShell(root, { user, onSignOut, mock = false }) {
  const displayName = user.nickname || user.phone || "Simple 用户";

  root.innerHTML = `
    <div class="shell">
      <aside class="rail" aria-label="主导航">
        <div class="rail-brand">
          <button class="rail-brand-link" type="button" data-section="feed" aria-label="Simple 首页">
            ${mark(30, "var(--brand-ink)", "var(--brand-paper)")}
            <span class="rail-brand-copy">
              <strong>Simple</strong>
              <small>单纯交个朋友</small>
            </span>
          </button>
          <button class="rail-back" type="button" data-back aria-label="返回" disabled>
            ${icon("chevronLeft")}
          </button>
        </div>

        <nav class="rail-nav">
          <button class="rail-item" type="button" data-section="feed">
            ${icon("home")}<span>首页</span>
          </button>
          <button class="rail-item" type="button" data-section="messages">
            ${icon("message")}<span>消息</span>
          </button>
          <button class="rail-item" type="button" data-section="channels">
            ${icon("channel")}<span>频道</span>
          </button>
          <button class="rail-item" type="button" data-section="night">
            ${icon("moonStars")}<span>夜市</span>
          </button>
          <button class="rail-item" type="button" data-section="slow-letter">
            ${icon("envelope")}<span>信箱</span>
          </button>
        </nav>

        <div class="rail-foot">
          <button class="rail-theme" type="button" data-theme-toggle aria-pressed="false" title="切换深色模式">
            ${icon("moon")}<span class="rail-theme-label">深色模式</span>
            <span class="theme-switch" aria-hidden="true"><i></i></span>
          </button>
          <button class="rail-item rail-settings" type="button" data-action="settings">
            ${icon("settings")}<span>设置</span>
          </button>
          <button class="rail-account" type="button" data-section="profile" title="个人主页">
            ${avatarHTML({
              url: user.avatar_url,
              name: displayName,
              color: "beede7",
              size: 34,
            })}
            <span class="rail-account-copy">
              <strong>${esc(displayName)}</strong>
              <small>${esc(user.phone || "")}</small>
            </span>
            <span class="rail-account-label">我的</span>
          </button>
          ${mock ? '<span class="rail-mode">离线预览</span>' : ""}
        </div>
      </aside>

      <main class="main">
        <div class="view" data-view></div>
      </main>
    </div>`;

  const view = root.querySelector("[data-view]");
  const backButton = root.querySelector("[data-back]");
  const themeButton = root.querySelector("[data-theme-toggle]");

  const syncThemeButton = () => {
    const dark = currentTheme() === "dark";
    themeButton.setAttribute("aria-pressed", String(dark));
    themeButton.title = dark ? "切换到浅色模式" : "切换到深色模式";
  };

  themeButton.addEventListener("click", (event) => {
    const hasPoint =
      event.detail > 0 &&
      Number.isFinite(event.clientX) &&
      Number.isFinite(event.clientY) &&
      (event.clientX !== 0 || event.clientY !== 0);
    toggleTheme(hasPoint ? { x: event.clientX, y: event.clientY } : null);
    syncThemeButton();
  });
  window.addEventListener("simple:theme", syncThemeButton);
  syncThemeButton();

  let cleanup = null;
  let token = 0;

  const openSettingsPanel = () => openSettings({ user, onSignOut });

  root.querySelectorAll("[data-section]").forEach((element) => {
    element.addEventListener("click", () => {
      const section = element.dataset.section;
      if (section === "feed") location.hash = "#/feed";
      else if (section === "night") location.hash = "#/night";
      else if (section === "slow-letter") location.hash = "#/slow-letter";
      else if (section === "messages") location.hash = "#/messages";
      else if (section === "channels") location.hash = "#/channels";
      else if (section === "profile") location.hash = "#/profile";
    });
  });

  root.querySelector('[data-action="settings"]').addEventListener("click", openSettingsPanel);

  backButton.addEventListener("click", () => {
    const route = currentRoute();
    location.hash = route.section === "room" ? "#/night" : "#/feed";
  });

  if (!location.hash || location.hash === "#/dev") {
    history.replaceState(null, "", "#/feed");
  }

  const onHashChange = () => renderRoute();
  window.addEventListener("hashchange", onHashChange);

  renderRoute();

  return () => {
    window.removeEventListener("hashchange", onHashChange);
    window.removeEventListener("simple:theme", syncThemeButton);
    token += 1;
    cleanup?.();
    cleanup = null;
  };

  // ---- 路由 ----

  function currentRoute() {
    const raw = location.hash.replace(/^#\/?/, "");
    if (raw.startsWith("room/")) {
      const id = decodeURIComponent(raw.slice(5).split("?")[0]);
      return { section: "room", id };
    }

    const [path, search] = raw.split("?");
    if (path === "night") return { section: "night" };
    if (path === "slow-letter") return { section: "slow-letter" };
    if (path === "messages") return { section: "messages" };
    if (path === "channels") return { section: "channels" };
    if (path === "profile") return { section: "profile" };

    return {
      section: "feed",
      tab: new URLSearchParams(search || "").get("tab") || "following",
    };
  }

  async function renderRoute() {
    const current = ++token;
    cleanup?.();
    cleanup = null;

    const route = currentRoute();
    paintActive(route.section);
    backButton.disabled = route.section === "feed";

    if (route.section === "room") {
      view.innerHTML = "";
      let channel = readRoom(route.id);

      if (!channel) {
        view.innerHTML = `<div class="state"><span class="spinner"></span></div>`;
        try {
          const data = await api.nightMarkets();
          channel = (data.channels || []).find((entry) => entry.id === route.id) || null;
        } catch {
          channel = null;
        }
        if (current !== token) return;
        view.innerHTML = "";
      }

      if (!channel) channel = { id: route.id, name: "聊天室", count: 0 };

      cleanup = mountRoom(view, {
        channel,
        user,
        onExit: () => {
          location.hash = "#/night";
        },
      });
      return;
    }

    view.innerHTML = "";

    if (route.section === "night") {
      cleanup = mountNight(view, { onOpenRoom: openRoom });
    } else if (route.section === "slow-letter") {
      mountSlowLetter(view);
    } else if (route.section === "messages") {
      cleanup = mountMessages(view, { user });
    } else if (route.section === "channels") {
      cleanup = mountChannels(view, { user });
    } else if (route.section === "profile") {
      mountProfile(view, {
        user,
        onSettings: openSettingsPanel,
        onPublish: () => openPublish(user),
      });
    } else {
      cleanup = mountFeed(view, { tab: route.tab, user });
    }
  }

  function paintActive(section) {
    const active = section === "room" ? "night" : section;
    root.querySelectorAll("[data-section]").forEach((element) => {
      element.classList.toggle("active", element.dataset.section === active);
    });
  }

  function openRoom(channel) {
    try {
      sessionStorage.setItem(`${ROOM_KEY}${channel.id}`, JSON.stringify(channel));
    } catch {
      // 无痕模式下可能不可用。
    }
    location.hash = `#/room/${encodeURIComponent(channel.id)}`;
  }

  function readRoom(id) {
    try {
      const raw = sessionStorage.getItem(`${ROOM_KEY}${id}`);
      if (!raw) return null;
      const value = JSON.parse(raw);
      return value && value.id === id ? value : null;
    } catch {
      return null;
    }
  }

  document.title = `Simple · ${displayName}`;
}
