// 个人主页：真实账号信息 + 我的真实动态。

import { api } from "../api.js?v=20261101bf";
import {
  esc,
  avatarHTML,
  icon,
  openImage,
  openVideo,
  toast,
  bindMusicParallax,
} from "../ui.js?v=20261101bf";
import { maskPhone } from "../format.js?v=20261101bf";
import { renderPostCard } from "./feed.js?v=20261101bf";

export function mountProfile(root, { user, onSettings, onPublish } = {}) {
  const phone = maskPhone(user.phone);
  const name = user.nickname || phone || "Simple 账号";
  let posts = [];
  let cursor = null;
  let canMore = true;
  let loading = false;

  root.innerHTML = `
    <div class="profile">
      <div class="profile-inner">
        <div class="eyebrow">PROFILE</div>
        <h1 class="profile-title">个人主页</h1>
        <button class="profile-settings" type="button" data-settings aria-label="设置">
          ${icon("settings")}
        </button>

        <div class="profile-head">
          ${avatarHTML({
            url: user.avatar_url,
            name,
            color: "beede7",
            size: 72,
            className: "profile-avatar",
            label: "我的头像",
          })}
          <div class="profile-copy">
            <div class="profile-name">${esc(name)}</div>
          </div>
          <button class="profile-publish" type="button" data-publish>
            ${icon("plus")}发布动态
          </button>
        </div>

        <div class="profile-tabs">
          <button class="profile-tab active" type="button">动态</button>
        </div>

        <div class="profile-posts" data-posts>
          <div class="profile-loading"><span class="spinner"></span></div>
        </div>

        <button class="profile-more" type="button" data-more hidden>加载更多</button>
      </div>
    </div>`;

  const postsHost = root.querySelector("[data-posts]");
  const moreButton = root.querySelector("[data-more]");

  root.querySelector("[data-settings]")?.addEventListener("click", () => onSettings?.());
  moreButton.addEventListener("click", () => loadPosts(true));
  postsHost.addEventListener("click", onClick);
  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-publish]")) onPublish?.();
    if (event.target.closest("[data-retry]")) loadPosts(false);
    if (event.target.closest("[data-empty-publish]")) onPublish?.();
  });

  bindMusicParallax(root);
  loadPosts(false);

  async function loadPosts(more) {
    if (loading) return;
    loading = true;
    moreButton.disabled = true;

    if (!more) {
      postsHost.innerHTML = `<div class="profile-loading"><span class="spinner"></span></div>`;
    }

    try {
      const data = await api.profilePosts(more ? cursor : null);
      if (!root.isConnected) return;

      const incoming = Array.isArray(data.posts)
        ? data.posts.filter((post) => post && post.id)
        : [];
      const fresh = incoming.filter(
        (post) => !posts.some((existing) => existing.id === post.id),
      );

      posts = more ? posts.concat(fresh) : fresh;
      cursor = posts.length ? posts[posts.length - 1].id : null;
      canMore = incoming.length >= 10 && fresh.length > 0;
      renderPosts();
    } catch (error) {
      if (!root.isConnected) return;
      if (more) {
        toast(error.message || "加载更多动态失败。");
      } else {
        postsHost.innerHTML = `<div class="profile-empty">
          <div class="state-badge">${icon("refresh")}</div>
          <h3>动态加载失败</h3>
          <p>${esc(error.message || "请检查网络后重试。")}</p>
          <button class="profile-retry" type="button" data-retry>重新加载</button>
        </div>`;
        moreButton.hidden = true;
      }
    } finally {
      loading = false;
      moreButton.disabled = false;
    }
  }

  function renderPosts() {
    if (!posts.length) {
      postsHost.innerHTML = `<div class="profile-empty">
        <div class="state-badge">${icon("edit")}</div>
        <h3>还没有发布动态</h3>
        <p>你发布的动态会出现在这里。</p>
        <button class="profile-publish muted" type="button" data-empty-publish>
          ${icon("plus")}发布第一条动态
        </button>
      </div>`;
      moreButton.hidden = true;
      return;
    }

    postsHost.innerHTML = posts
      .map(
        (post) =>
          `<div class="profile-post">${renderPostCard(post)}</div>`,
      )
      .join("");
    moreButton.hidden = !canMore;
  }

  function onClick(event) {
    const image = event.target.closest("[data-image]");
    if (image) {
      openImage(image.dataset.image);
      return;
    }
    const video = event.target.closest("[data-video]");
    if (video) {
      openVideo(video.dataset.video, video.querySelector("img")?.src || "");
      return;
    }
  }
}
