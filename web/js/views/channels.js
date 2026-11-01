// 频道中心：只显示当前账号已经加入的真实频道。
// 分区与帖子来自官方接口；频道聊天室接口未接入前保持空态，不伪造聊天。

import { api } from "../api.js?v=20261101bf";
import { avatarHTML, esc, icon } from "../ui.js?v=20261101bf";
import { renderPostCard } from "./feed.js?v=20261101bf";

const TABS = [
  { id: "sections", label: "分区" },
  { id: "posts", label: "帖子" },
  { id: "chat", label: "聊天" },
];

export function mountChannels(root, { user = null } = {}) {
  let channels = [];
  let selectedId = null;
  let tab = "sections";
  let sectionFilter = "";
  let mobileDetail = false;
  let loading = true;
  let error = "";
  const buckets = new Map();
  let disposed = false;

  renderLoading();
  load();

  return () => {
    disposed = true;
  };

  async function load() {
    loading = true;
    error = "";
    renderLoading();
    try {
      const data = await api.channels();
      if (disposed) return;
      channels = Array.isArray(data.channels) ? data.channels.filter((item) => item && item.id) : [];
      selectedId = channels[0]?.id || null;
      loading = false;
      render();
    } catch (cause) {
      if (disposed) return;
      loading = false;
      error = cause.message || "频道加载失败。";
      render();
    }
  }

  function currentChannel() {
    return channels.find((channel) => channel.id === selectedId) || null;
  }

  function renderLoading() {
    root.innerHTML = `<div class="channel-hub channel-hub-state">
      <div class="channel-state"><span class="spinner"></span><span>正在读取已加入的频道…</span></div>
    </div>`;
  }

  function render() {
    if (loading) {
      renderLoading();
      return;
    }

    if (error) {
      root.innerHTML = `<div class="channel-hub channel-hub-state">
        <div class="channel-state">
          ${icon("channel")}
          <strong>频道加载失败</strong>
          <span>${esc(error)}</span>
          <button type="button" data-channel-retry>重试</button>
        </div>
      </div>`;
      root.querySelector("[data-channel-retry]")?.addEventListener("click", load);
      return;
    }

    if (!channels.length) {
      root.innerHTML = `<div class="channel-hub channel-hub-state">
        <div class="channel-state">
          ${icon("channel")}
          <strong>账号还没有加入频道</strong>
          <span>加入频道后会显示在消息和这里；当前不做频道查找与加入。</span>
        </div>
      </div>`;
      return;
    }

    const channel = currentChannel();
    root.innerHTML = `
      <div class="channel-hub${mobileDetail ? " detail-open" : ""}" data-channel-hub>
        ${railHTML()}
        <main class="channel-hub-main">${mainHTML(channel)}</main>
      </div>`;
    bind();
  }

  function railHTML() {
    return `<aside class="channel-hub-rail">
      <header class="channel-rail-head">
        <div>
          <div class="eyebrow">CHANNELS</div>
          <h1>频道</h1>
        </div>
        <span class="channel-preview-badge">已加入 ${channels.length}</span>
      </header>
      <div class="channel-rail-scroll">
        <div class="channel-rail-group"><span>我的频道</span><b>${channels.length}</b></div>
        <div class="channel-nav-list">
          ${channels.map((channel) => `<button class="channel-nav-item${channel.id === selectedId ? " active" : ""}" type="button" data-channel-id="${esc(channel.id)}">
            ${channelAvatar(channel, 38)}
            <span><strong>${esc(channel.name)}</strong><small>${Number(channel.members || 0)} 位成员</small></span>
            ${channel.id === selectedId ? icon("chevronRight") : ""}
          </button>`).join("")}
        </div>
      </div>
      <p class="channel-rail-note">只显示账号已经加入的频道；查找和加入暂未开放。</p>
    </aside>`;
  }

  function channelAvatar(channel, size) {
    return avatarHTML({
      url: channel.icon || "",
      name: channel.name,
      color: "beede7",
      size,
      className: "channel-avatar",
      label: `${channel.name}的图标`,
    });
  }

  function mainHTML(channel) {
    if (!channel) return "";

    return `<button class="channel-mobile-back" type="button" data-channel-back>${icon("chevronLeft")}频道</button>
      <header class="channel-hero">
        ${channelAvatar(channel, 68)}
        <div class="channel-hero-copy">
          <div class="channel-hero-title"><h2>${esc(channel.name)}</h2><span>${Number(channel.members || 0)} 位成员</span></div>
          ${channel.description ? `<p>${esc(channel.description)}</p>` : ""}
          <div class="channel-hero-meta">${icon("channel")}已加入<span>·</span>分区 ${channel.sections?.length || 0}</div>
        </div>
      </header>

      <nav class="channel-tabs" role="tablist" aria-label="频道内容">
        ${TABS.map((item) => `<button class="channel-tab${tab === item.id ? " active" : ""}" type="button" role="tab" data-channel-tab="${item.id}" aria-selected="${tab === item.id}">
          ${item.label}${item.id === "sections" ? `<span>${channel.sections?.length || 0}</span>` : ""}
        </button>`).join("")}
      </nav>

      <div class="channel-content" data-channel-content>
        ${tab === "sections" ? sectionsHTML(channel) : tab === "posts" ? postsHTML(channel) : chatHTML()}
      </div>`;
  }

  function sectionsHTML(channel) {
    const sections = Array.isArray(channel.sections) ? channel.sections : [];
    if (!sections.length) {
      return `<div class="channel-empty-block">这个频道还没有分区。</div>`;
    }
    const bucket = buckets.get(channel.id);
    return `<div class="channel-section-grid">
      ${sections.map((section) => {
        const count = bucket?.loaded
          ? bucket.posts.filter((post) => post.channel?.id === section.id).length
          : null;
        return `<button class="channel-section-card" type="button" data-section-id="${esc(section.id)}">
          <span class="channel-section-icon">${icon("channel")}</span>
          <span class="channel-section-copy"><strong>${esc(section.name)}</strong><small>进入分区查看帖子</small></span>
          <span class="channel-section-count">${count === null ? "帖子" : `${count} 帖`}${icon("chevronRight")}</span>
        </button>`;
      }).join("")}
    </div>`;
  }

  function postsHTML(channel) {
    const bucket = buckets.get(channel.id);
    if (!bucket || bucket.loading) {
      return `<div class="channel-empty-block"><span class="spinner"></span></div>`;
    }
    if (bucket.error) {
      return `<div class="channel-empty-block">${esc(bucket.error)} <button class="channel-inline-retry" type="button" data-retry-posts>重试</button></div>`;
    }

    const posts = sectionFilter
      ? bucket.posts.filter((post) => post.channel?.id === sectionFilter)
      : bucket.posts;
    const section = channel.sections?.find((item) => item.id === sectionFilter);

    return `${sectionFilter ? `<div class="channel-filter-chip">分区：${esc(section?.name || "当前分区")}<button type="button" data-clear-section>${icon("close")}</button></div>` : ""}
      <div class="channel-real-posts">
        ${posts.length
          ? posts.map((post) => `<div class="channel-real-post">${renderPostCard(post)}</div>`).join("")
          : `<div class="channel-empty-block">${sectionFilter ? "这个分区还没有帖子。" : "频道里还没有帖子。"}</div>`}
      </div>
      ${bucket.canMore ? `<button class="profile-more channel-load-more" type="button" data-load-more-posts ${bucket.loadingMore ? "disabled" : ""}>${bucket.loadingMore ? "加载中…" : "加载更多"}</button>` : ""}`;
  }

  function chatHTML() {
    const channel = currentChannel();
    const rooms = Array.isArray(channel?.chat_rooms) ? channel.chat_rooms : [];
    const voiceRooms = Array.isArray(channel?.voice_rooms) ? channel.voice_rooms : [];

    if (!rooms.length && !voiceRooms.length) {
      return `<div class="channel-chat-empty">
        <span class="channel-chat-empty-icon">${icon("message")}</span>
        <h3>还没有聊天房</h3>
        <p>这个频道目前没有可用的文字聊天房或语音房。</p>
      </div>`;
    }

    return `<div class="channel-room-list">
      ${rooms.length ? `<div class="channel-room-list-head"><span>文字聊天房</span><b>${rooms.length}</b></div>
        ${rooms.map((room) => `<button class="channel-room-card" type="button" data-open-messages>
          <span class="channel-section-icon">${icon("message")}</span>
          <span class="channel-section-copy"><strong>${esc(room.name)}</strong><small>${esc(room.section || "讨论组")} · 在消息页继续聊天</small></span>
          <span class="channel-section-count">去消息页${icon("chevronRight")}</span>
        </button>`).join("")}` : ""}
      ${voiceRooms.length ? `<div class="channel-room-list-head channel-voice-head"><span>语音房</span><b>${voiceRooms.length}</b></div>
        ${voiceRooms.map((room) => `<div class="channel-room-card channel-voice-card">
          <span class="channel-section-icon channel-voice-icon">${icon("mic")}</span>
          <span class="channel-section-copy"><strong>${esc(room.name)}</strong><small>${Number(room.members || 0)} 人 · ${esc(room.section || "语音房")}</small></span>
          <span class="channel-section-count">${icon("mic")}语音房</span>
        </div>`).join("")}` : ""}
      <p class="channel-room-note">文字聊天房已加入消息页「频道」分类；语音房已读取真实房间信息，网页语音播放 / 上麦尚未接入。</p>
    </div>`;
  }

  function bind() {
    root.querySelectorAll("[data-channel-id]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedId = button.dataset.channelId;
        tab = "sections";
        sectionFilter = "";
        mobileDetail = true;
        render();
      });
    });

    root.querySelector("[data-channel-back]")?.addEventListener("click", () => {
      mobileDetail = false;
      render();
    });

    root.querySelectorAll("[data-open-messages]").forEach((button) => {
      button.addEventListener("click", () => {
        location.hash = "#/messages";
      });
    });

    root.querySelectorAll("[data-channel-tab]").forEach((button) => {
      button.addEventListener("click", () => switchTab(button.dataset.channelTab));
    });

    root.querySelectorAll("[data-section-id]").forEach((button) => {
      button.addEventListener("click", () => {
        sectionFilter = button.dataset.sectionId;
        tab = "posts";
        ensurePosts().finally(() => render());
        render();
      });
    });

    root.querySelector("[data-clear-section]")?.addEventListener("click", () => {
      sectionFilter = "";
      render();
    });

    root.querySelector("[data-retry-posts]")?.addEventListener("click", () => {
      loadPosts(false);
    });

    root.querySelector("[data-load-more-posts]")?.addEventListener("click", () => {
      loadPosts(true);
    });
  }

  function switchTab(next) {
    tab = next;
    render();
    if (next === "posts") {
      ensurePosts().then(() => {
        if (tab === "posts") render();
      });
    }
  }

  function ensurePosts() {
    const channel = currentChannel();
    if (!channel) return Promise.resolve();
    const bucket = buckets.get(channel.id);
    if (bucket?.loaded || bucket?.loading) return Promise.resolve();
    return loadPosts(false);
  }

  async function loadPosts(more) {
    const channel = currentChannel();
    if (!channel) return;
    const bucket = buckets.get(channel.id) || {
      posts: [],
      cursor: null,
      loaded: false,
      loading: false,
      loadingMore: false,
      canMore: true,
      error: "",
    };
    if (bucket.loading || bucket.loadingMore) return;
    if (more && !bucket.canMore) return;

    if (more) bucket.loadingMore = true;
    else {
      bucket.loading = true;
      bucket.error = "";
    }
    buckets.set(channel.id, bucket);
    if (tab === "posts") render();

    try {
      const data = await api.channelPosts(channel.id, more ? bucket.cursor : null);
      if (disposed) return;
      const incoming = Array.isArray(data.posts)
        ? data.posts.filter((post) => post && post.id)
        : [];
      const fresh = incoming.filter(
        (post) => !bucket.posts.some((existing) => existing.id === post.id),
      );
      bucket.posts = more ? bucket.posts.concat(fresh) : fresh;
      bucket.cursor = bucket.posts.length
        ? bucket.posts[bucket.posts.length - 1].id
        : null;
      bucket.canMore = incoming.length >= 10 && fresh.length > 0;
      bucket.loaded = true;
      bucket.error = "";
    } catch (cause) {
      if (disposed) return;
      bucket.error = cause.message || "频道帖子加载失败。";
    } finally {
      bucket.loading = false;
      bucket.loadingMore = false;
      buckets.set(channel.id, bucket);
      if (!disposed && tab === "posts") render();
      else if (!disposed) render();
    }
  }
}
