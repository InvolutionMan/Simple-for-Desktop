// 关注 / 广场 / 发现：动态流、搜索、发布弹窗、更多操作。

import { api } from "../api.js?v=20261101bf";
import {
  esc,
  avatarHTML,
  icon,
  stateHTML,
  toast,
  openImage,
  openVideo,
  openModal,
  bindMusicParallax,
} from "../ui.js?v=20261101bf";
import { postTime } from "../format.js?v=20261101bf";
import { openComments } from "./comments.js?v=20261101bf";

const TABS = [
  {
    id: "following",
    label: "关注",
    emptyTitle: "还没有关注动态",
    emptyCopy: "关注的人发布内容后，会出现在这里。",
  },
  {
    id: "plaza",
    label: "广场",
    emptyTitle: "广场还没有内容",
    emptyCopy: "这里会显示广场里的新动态。",
  },
  {
    id: "discover",
    label: "发现",
    emptyTitle: "发现还没有内容",
    emptyCopy: "这里会显示发现里的内容。",
  },
];

function createBucket() {
  return {
    posts: [],
    cursor: null,
    canMore: true,
    loaded: false,
    loading: false,
    error: "",
  };
}

const buckets = {
  following: createBucket(),
  plaza: createBucket(),
  discover: { ...createBucket(), loaded: true, canMore: false },
};

let activeTab = "following";

const collapsedPosts = new Set();
const hiddenPosts = new Set();
const hiddenUsers = new Set();

function postUserKey(user) {
  return user?.id || user?.nickname || "";
}

function isPostHidden(post) {
  if (!post) return false;
  if (hiddenPosts.has(post.id)) return true;
  const key = postUserKey(post.user);
  return Boolean(key && hiddenUsers.has(key));
}

function visiblePosts(posts) {
  return posts.filter((post) => !isPostHidden(post));
}

function openNotice(title, copy) {
  openModal(
    `<h2>${esc(title)}</h2>
     <p>${esc(copy)}</p>
     <div class="notice-actions">
       <button class="primary-button" type="button" data-close>知道了</button>
     </div>`,
    { panelClass: "notice-modal" },
  );
}

export function mountFeed(root, { tab = "following", user = null } = {}) {
  activeTab = TABS.some((entry) => entry.id === tab) ? tab : "following";

  root.innerHTML = `
    <div class="feed">
      <header class="topbar">
        <div class="topbar-inner">
          <nav class="tabs" aria-label="动态分类">
            ${TABS.map(
              (entry) =>
                `<button class="tab" type="button" role="tab" data-tab="${entry.id}" aria-selected="false">${entry.label}</button>`,
            ).join("")}
          </nav>

          <div class="search" data-search>
            ${icon("search")}
            <input class="search-input" type="text" placeholder="搜索用户、动态或话题" aria-label="搜索用户、动态或话题" autocomplete="off">
            <button class="search-clear" type="button" data-search-clear aria-label="清除搜索" hidden>${icon("close")}</button>
            <div class="search-panel" data-search-panel hidden></div>
          </div>

          <button class="refresh" type="button" data-refresh aria-label="刷新动态" title="刷新动态">
            ${icon("refresh")}
          </button>

          <button class="publish" type="button" data-publish aria-label="发布动态">
            ${icon("plus")}<span>发布动态</span>
          </button>
        </div>
      </header>

      <div class="feed-scroll" role="tabpanel"></div>
      <button class="back-to-top" type="button" data-back-to-top aria-label="回到顶部" aria-hidden="true">${icon("arrowUp")}</button>
    </div>`;

  const scroll = root.querySelector(".feed-scroll");
  const topbar = root.querySelector(".topbar");
  const backToTop = root.querySelector("[data-back-to-top]");
  const searchWrap = root.querySelector("[data-search]");
  const searchInput = root.querySelector(".search-input");
  const searchClear = root.querySelector("[data-search-clear]");
  const searchPanel = root.querySelector("[data-search-panel]");
  const refreshButton = root.querySelector("[data-refresh]");

  let searchTimer = null;
  let lastScrollTop = 0;
  let topbarHidden = false;

  const syncTopbarHeight = () => {
    root.style.setProperty("--feed-topbar-height", `${topbar.offsetHeight}px`);
  };
  syncTopbarHeight();
  window.addEventListener("resize", syncTopbarHeight);

  const postTimeTimer = setInterval(refreshPostTimes, 60_000);

  root.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  root.querySelector("[data-publish]").addEventListener("click", () => openPublish(user));
  refreshButton.addEventListener("click", refreshFeed);
  searchInput.addEventListener("input", onSearchInput);
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideSearch();
      searchInput.blur();
    }
  });
  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    searchClear.hidden = true;
    hideSearch();
    searchInput.focus();
  });

  searchPanel.addEventListener("click", onSearchResultClick);
  backToTop.addEventListener("click", () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroll.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  });
  scroll.addEventListener("scroll", onScroll, { passive: true });
  scroll.addEventListener("click", onClick);
  const unbindMusic = bindMusicParallax(scroll);

  const onDocumentPointerDown = (event) => {
    if (!searchWrap.contains(event.target)) hideSearch();
    if (!event.target.closest(".post-more-wrap")) closeMoreMenus();
  };
  document.addEventListener("pointerdown", onDocumentPointerDown);

  paintTabs();
  if (buckets[activeTab].loaded) {
    paint();
  } else {
    load(false);
  }

  return () => {
    clearTimeout(searchTimer);
    clearInterval(postTimeTimer);
    scroll.removeEventListener("scroll", onScroll);
    scroll.removeEventListener("click", onClick);
    window.removeEventListener("resize", syncTopbarHeight);
    unbindMusic();
    document.removeEventListener("pointerdown", onDocumentPointerDown);
  };

  // ---- 渲染 ----

  function refreshPostTimes() {
    scroll.querySelectorAll("[data-post-time]").forEach((node) => {
      node.textContent = postTime(node.dataset.postTime);
    });
  }

  function paintTabs() {
    root.querySelectorAll("[data-tab]").forEach((button) => {
      const isActive = button.dataset.tab === activeTab;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });
  }

  function paint() {
    const bucket = buckets[activeTab];

    if (bucket.loading && bucket.posts.length === 0) {
      scroll.innerHTML = `<div class="state">
        <span class="spinner"></span>
        <p class="state-copy" style="margin-top:14px">正在加载动态…</p>
      </div>`;
      return;
    }

    if (bucket.error && bucket.posts.length === 0) {
      scroll.innerHTML = stateHTML({
        title: "没能加载出来",
        copy: bucket.error,
        actionLabel: "重试",
        action: "retry",
        badge: "icon",
        badgeIcon: "refresh",
      });
      scroll.querySelector('[data-action="retry"]')?.addEventListener("click", () => load(false));
      return;
    }

    if (bucket.posts.length === 0) {
      const entry = TABS.find((candidate) => candidate.id === activeTab);
      scroll.innerHTML = stateHTML({
        title: entry.emptyTitle,
        copy: entry.emptyCopy,
        badge: "mark",
      });
      return;
    }

    const posts = visiblePosts(bucket.posts);
    if (posts.length === 0) {
      scroll.innerHTML = stateHTML({
        title: "已按你的选择隐藏",
        copy: "临时折叠不会删除内容；不感兴趣和不看Ta只在本机生效。",
        actionLabel: "恢复隐藏内容",
        action: "restore",
        badge: "icon",
        badgeIcon: "eyeOff",
      });
      scroll.querySelector('[data-action="restore"]')?.addEventListener("click", () => {
        hiddenPosts.clear();
        hiddenUsers.clear();
        paint();
      });
      return;
    }

    scroll.innerHTML = `
      <div class="feed-list">${posts.map(postHTML).join("")}</div>
      <div class="feed-footer"></div>`;
    updateFooter();
  }

  function updateFooter() {
    const footer = scroll.querySelector(".feed-footer");
    if (!footer) return;
    const bucket = buckets[activeTab];
    if (bucket.loading) {
      footer.innerHTML = `<span class="spinner"></span>`;
    } else if (!bucket.canMore) {
      footer.textContent = "没有更多了";
    } else {
      footer.textContent = "";
    }
  }

  function appendCards(posts) {
    const list = scroll.querySelector(".feed-list");
    if (!list) {
      paint();
      return;
    }
    const column = document.createElement("div");
    column.innerHTML = visiblePosts(posts).map(postHTML).join("");
    const fragment = document.createDocumentFragment();
    while (column.firstElementChild) fragment.appendChild(column.firstElementChild);
    list.appendChild(fragment);
  }

  function refreshCard(post) {
    const cards = scroll.querySelectorAll(".post-card");
    for (const card of cards) {
      if (card.dataset.post === post.id) {
        card.outerHTML = postHTML(post);
        return;
      }
    }
  }

  // ---- 数据 ----

  async function load(more) {
    const bucket = buckets[activeTab];
    if (bucket.loading) return;
    if (activeTab === "discover") {
      bucket.loaded = true;
      paint();
      return;
    }

    bucket.loading = true;
    if (more) {
      updateFooter();
    } else {
      paint();
    }

    try {
      const data = await api.feed(activeTab, more ? bucket.cursor : null);
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
      bucket.error = "";
      bucket.loaded = true;
      bucket.loading = false;

      if (more) {
        appendCards(fresh);
        updateFooter();
      } else {
        paint();
      }
    } catch (error) {
      bucket.loading = false;
      bucket.loaded = true;
      bucket.error = error.message || "加载失败，请检查网络后重试。";
      if (more) {
        bucket.canMore = false;
        updateFooter();
        toast(bucket.error);
      } else {
        paint();
      }
    }
  }

  function onScroll() {
    updateFloatingScroll();
    const bucket = buckets[activeTab];
    if (!bucket.posts.length || bucket.loading || !bucket.canMore) return;
    if (scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 320) {
      load(true);
    }
  }

  function updateFloatingScroll() {
    const y = scroll.scrollTop;
    if (y < 48) topbarHidden = false;
    else if (y > lastScrollTop + 6) topbarHidden = true;
    else if (y < lastScrollTop - 6) topbarHidden = false;

    topbar.classList.toggle("is-hidden", topbarHidden);
    const showTop = y > 520;
    backToTop.classList.toggle("visible", showTop);
    backToTop.setAttribute("aria-hidden", String(!showTop));
    lastScrollTop = y;
  }

  function switchTab(tab) {
    if (tab === activeTab) return;
    activeTab = tab;
    history.replaceState(null, "", `#/feed?tab=${tab}`);
    paintTabs();
    hideSearch();
    closeMoreMenus();
    scroll.scrollTop = 0;
    lastScrollTop = 0;
    topbarHidden = false;
    topbar.classList.remove("is-hidden");
    backToTop.classList.remove("visible");
    backToTop.setAttribute("aria-hidden", "true");

    const bucket = buckets[activeTab];
    if (bucket.loaded) {
      paint();
    } else {
      load(false);
    }
  }

  function setRefreshLoading(loading) {
    if (!refreshButton) return;
    refreshButton.classList.toggle("is-loading", loading);
    refreshButton.disabled = loading;
    refreshButton.setAttribute("aria-busy", String(loading));
  }

  async function refreshFeed() {
    if (activeTab === "discover") {
      toast("发现页暂时没有可刷新的内容。");
      return;
    }

    const bucket = buckets[activeTab];
    if (bucket.loading) return;

    searchInput.value = "";
    searchClear.hidden = true;
    hideSearch();
    closeMoreMenus();

    bucket.posts = [];
    bucket.cursor = null;
    bucket.canMore = true;
    bucket.error = "";
    bucket.loaded = false;
    scroll.scrollTop = 0;
    lastScrollTop = 0;
    topbarHidden = false;
    topbar.classList.remove("is-hidden");
    backToTop.classList.remove("visible");
    backToTop.setAttribute("aria-hidden", "true");

    setRefreshLoading(true);
    await load(false);
    setRefreshLoading(false);
  }

  // ---- 搜索 ----

  function onSearchInput() {
    const value = searchInput.value;
    searchClear.hidden = value.length === 0;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderSearch(value), 120);
  }

  function renderSearch(raw) {
    const query = raw.trim().toLowerCase();
    if (!query) {
      hideSearch();
      return;
    }

    const posts = visiblePosts(buckets[activeTab].posts);
    const matchedPosts = posts.filter((post) => {
      const content = (post.content || "").toLowerCase();
      const name = (post.user?.nickname || "").toLowerCase();
      return content.includes(query) || name.includes(query);
    });

    const users = new Map();
    for (const post of posts) {
      const name = post.user?.nickname;
      if (!name || !name.toLowerCase().includes(query)) continue;
      const key = post.user?.id || name;
      const entry = users.get(key) || { user: post.user, count: 0 };
      entry.count += 1;
      users.set(key, entry);
    }

    const topics = new Map();
    for (const post of posts) {
      for (const match of (post.content || "").matchAll(/#[^\s#，。！？、（）()]+/g)) {
        const tag = match[0];
        topics.set(tag, (topics.get(tag) || 0) + 1);
      }
    }
    const matchedTopics = [...topics.entries()]
      .filter(([tag]) => tag.toLowerCase().includes(query))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    let html = "";
    if (matchedPosts.length) {
      html += `<div class="search-section">动态</div>`;
      html += matchedPosts
        .slice(0, 4)
        .map(
          (post) => `<button class="search-result post" type="button" data-search-post="${esc(post.id)}">
            <span class="search-result-title">${esc(post.user?.nickname || "匿名用户")}</span>
            <span class="search-result-meta">${esc(snippet(post.content, 46))}</span>
          </button>`,
        )
        .join("");
    }

    if (users.size) {
      html += `<div class="search-section">用户</div>`;
      html += [...users.values()]
        .slice(0, 4)
        .map(
          (entry) => `<button class="search-result user" type="button" data-search-user="${esc(entry.user?.nickname || "")}">
            ${avatarHTML({
              url: entry.user?.avatar_url,
              name: entry.user?.nickname,
              color: entry.user?.avatar_color,
              size: 28,
            })}
            <span class="search-result-title">${esc(entry.user?.nickname || "匿名用户")}</span>
            <span class="search-result-meta">${entry.count} 条动态</span>
          </button>`,
        )
        .join("");
    }

    if (matchedTopics.length) {
      html += `<div class="search-section">话题</div>`;
      html += matchedTopics
        .map(
          ([tag, count]) => `<button class="search-result topic" type="button" data-search-topic="${esc(tag)}">
            <span class="search-result-title">${esc(tag)}</span>
            <span class="search-result-meta">${count} 条动态</span>
          </button>`,
        )
        .join("");
    }

    searchPanel.innerHTML = html || `<div class="search-empty">没有找到相关内容</div>`;
    searchPanel.hidden = false;
  }

  function hideSearch() {
    searchPanel.hidden = true;
    searchPanel.innerHTML = "";
  }

  function onSearchResultClick(event) {
    const postButton = event.target.closest("[data-search-post]");
    if (postButton) {
      const id = postButton.dataset.searchPost;
      hideSearch();
      focusPost(id);
      return;
    }

    const userButton = event.target.closest("[data-search-user]");
    if (userButton) {
      searchInput.value = userButton.dataset.searchUser;
      searchClear.hidden = false;
      renderSearch(searchInput.value);
      return;
    }

    const topicButton = event.target.closest("[data-search-topic]");
    if (topicButton) {
      searchInput.value = topicButton.dataset.searchTopic;
      searchClear.hidden = false;
      renderSearch(searchInput.value);
    }
  }

  function focusPost(id) {
    const card = scroll.querySelector(`.post-card[data-post="${id}"]`);
    if (!card) {
      toast("这条动态不在当前列表里，先回到顶部刷新看看。");
      return;
    }
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("flash");
    setTimeout(() => card.classList.remove("flash"), 1500);
  }

  // ---- 交互 ----

  function onClick(event) {
    const image = event.target.closest("[data-image]");
    if (image) {
      openImage(image.dataset.image);
      return;
    }

    const video = event.target.closest("[data-video]");
    if (video) {
      const poster = video.querySelector("img")?.getAttribute("src") || null;
      openVideo(video.dataset.video, poster);
      return;
    }

    const like = event.target.closest("[data-like]");
    if (like) {
      toggleLike(like.dataset.like);
      return;
    }

    const comments = event.target.closest("[data-comments]");
    if (comments) {
      openCommentsFor(comments.dataset.comments);
      return;
    }

    const more = event.target.closest("[data-more]");
    if (more) {
      const wrap = more.closest(".post-more-wrap");
      const menu = wrap?.querySelector(".more-menu");
      if (menu) {
        const wasOpen = !menu.hidden;
        closeMoreMenus();
        menu.hidden = wasOpen;
      }
      return;
    }

    const report = event.target.closest("[data-more-report]");
    if (report) {
      closeMoreMenus();
      openNotice(
        "举报动态",
        "官方举报接口还没接入，网页版暂时不能提交举报。请到官方客户端举报这条动态。",
      );
      return;
    }

    const collapse = event.target.closest("[data-more-collapse]");
    if (collapse) {
      const post = findPost(collapse.closest(".post-card")?.dataset.post);
      closeMoreMenus();
      if (post) {
        collapsedPosts.add(post.id);
        refreshCard(post);
        toast("已临时折叠这条动态");
      }
      return;
    }

    const expandMenu = event.target.closest("[data-more-expand]");
    if (expandMenu) {
      const post = findPost(expandMenu.closest(".post-card")?.dataset.post);
      closeMoreMenus();
      if (post) {
        collapsedPosts.delete(post.id);
        refreshCard(post);
      }
      return;
    }

    const expandBar = event.target.closest("[data-expand-post]");
    if (expandBar) {
      const id = expandBar.dataset.expandPost;
      const post = findPost(id);
      if (post) {
        collapsedPosts.delete(id);
        refreshCard(post);
      }
      return;
    }

    const hide = event.target.closest("[data-more-hide]");
    if (hide) {
      const card = hide.closest(".post-card");
      const post = findPost(card?.dataset.post);
      closeMoreMenus();
      if (post) {
        hiddenPosts.add(post.id);
        card?.remove();
        if (!scroll.querySelector(".post-card")) paint();
        toast("已隐藏这条动态（仅本机）");
      }
      return;
    }

    const mute = event.target.closest("[data-more-mute]");
    if (mute) {
      const post = findPost(mute.closest(".post-card")?.dataset.post);
      closeMoreMenus();
      const key = postUserKey(post?.user);
      if (!post || !key) return;
      hiddenUsers.add(key);
      scroll.querySelectorAll(".post-card").forEach((card) => {
        const candidate = findPost(card.dataset.post);
        if (candidate && postUserKey(candidate.user) === key) card.remove();
      });
      if (!scroll.querySelector(".post-card")) paint();
      toast("以后不再显示Ta的动态（仅本机）");
      return;
    }

    const privacy = event.target.closest("[data-more-privacy]");
    if (privacy) {
      closeMoreMenus();
      openNotice(
        "不让Ta看我发布的动态",
        "这是官方隐私设置，网页版没有对应接口，不能替你修改。请到官方客户端设置。",
      );
    }
  }

  function findPost(id) {
    if (!id) return null;
    return buckets[activeTab].posts.find((post) => post.id === id) || null;
  }

  function closeMoreMenus() {
    scroll.querySelectorAll(".more-menu:not([hidden])").forEach((menu) => {
      menu.hidden = true;
    });
  }

  async function toggleLike(postId) {
    const post = findPost(postId);
    if (!post) return;

    const before = {
      voted: Boolean(post.is_voted),
      votes: Number(post.votes_count || 0),
    };
    post.is_voted = !before.voted;
    post.votes_count = Math.max(0, before.votes + (post.is_voted ? 1 : -1));
    refreshCard(post);

    const card = scroll.querySelector(`.post-card[data-post="${post.id}"]`);
    const button = card?.querySelector("[data-like]");
    if (button) {
      button.classList.add("bump");
      setTimeout(() => button.classList.remove("bump"), 320);
    }

    try {
      await api.votePost(post.id, Boolean(post.is_voted));
    } catch (error) {
      post.is_voted = before.voted;
      post.votes_count = before.votes;
      refreshCard(post);
      toast(error.message);
    }
  }

  function openCommentsFor(postId) {
    const post = findPost(postId);
    if (!post) return;
    openComments(post, {
      onCommentAdded: () => {
        post.comments_count = Number(post.comments_count || 0) + 1;
        refreshCard(post);
      },
    });
  }


}

// ---- 卡片 ----

function postHTML(post) {
  const user = post.user || {};
  const name = user.nickname || "匿名用户";
  const media = Array.isArray(post.media)
    ? post.media.filter((item) => item && (item.url || item.music))
    : [];
  const attachments = media.filter(isAttachment);
  const visuals = media.filter((item) => !isAttachment(item));
  const liked = Boolean(post.is_voted);
  const votes = Number(post.votes_count || 0);
  const comments = Number(post.comments_count || 0);
  const showVotes = !liked && votes > 0;
  const verified = Boolean(user.is_verified || user.verified);
  const collapsed = collapsedPosts.has(post.id);
  const collapseItem = collapsed
    ? `<button class="more-item" type="button" data-more-expand>${icon("chevronDown")}展开此动态</button>`
    : `<button class="more-item" type="button" data-more-collapse>${icon("fold")}对我临时折叠此动态</button>`;

  return `<article class="post-card${collapsed ? " is-collapsed" : ""}" data-post="${esc(post.id)}">
    <header class="post-head">
      ${avatarHTML({
        url: user.avatar_url,
        name,
        color: user.avatar_color,
        size: 44,
        className: "post-avatar",
        label: `${name}的头像`,
      })}
      <div class="post-main">
        <div class="post-name-row">
          <span class="post-name">${esc(name)}</span>
          ${verified ? `<span class="verified" title="已认证">${icon("check")}</span>` : ""}
        </div>
        <div class="post-time" data-post-time="${esc(post.created_at ?? "")}">${esc(postTime(post.created_at))}</div>
      </div>
      <div class="post-more-wrap">
        <button class="post-more" type="button" data-more aria-label="更多操作">${icon("ellipsis")}</button>
        <div class="more-menu" hidden>
          <button class="more-item danger" type="button" data-more-report>${icon("flag")}举报动态</button>
          <div class="more-sep"></div>
          ${collapseItem}
          <button class="more-item" type="button" data-more-hide>${icon("eyeOff")}不感兴趣</button>
          <button class="more-item" type="button" data-more-mute>${icon("userX")}不看Ta发布的动态</button>
          <button class="more-item" type="button" data-more-privacy>${icon("lock")}不让Ta看我发布的动态</button>
        </div>
      </div>
    </header>
    ${
      collapsed
        ? `<div class="post-collapsed">
            <span>已临时折叠这条动态</span>
            <button type="button" data-expand-post="${esc(post.id)}">展开</button>
          </div>`
        : `${post.content ? `<p class="post-body">${bodyHTML(post.content)}</p>` : ""}
          ${visuals.length ? mediaGridHTML(visuals) : ""}
          ${
            attachments.length
              ? `<div class="attachments">${attachments.map(attachmentHTML).join("")}</div>`
              : ""
          }
          <footer class="post-actions">
            <button class="action" type="button" data-comments="${esc(post.id)}" aria-label="查看评论">
              ${icon("comment")}<span class="count">${comments}</span>
            </button>
            <button class="action${liked ? " liked" : ""}" type="button" data-like="${esc(post.id)}"
              aria-pressed="${liked}" aria-label="${liked ? "取消点赞" : "点赞"}">
              ${icon(liked ? "heartFilled" : "heart")}<span class="count">${showVotes ? votes : ""}</span>
            </button>
          </footer>`
    }
  </article>`;
}

export function renderPostCard(post) {
  return postHTML(post);
}

function bodyHTML(text) {
  return esc(text).replace(
    /(^|[\s，。！？、（）()])(#[^\s#，。！？、（）()]+)/g,
    (match, lead, tag) => `${lead}<span class="topic">${tag}</span>`,
  );
}

function snippet(text, limit) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return "（只有图片）";
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

function isAttachment(item) {
  if (!item) return false;
  const type = String(item.type || "").toLowerCase();
  if (type === "music" || type === "audio") return true;
  return Boolean(item.music && (item.music.music_title || item.music.music_url));
}

function mediaGridHTML(items) {
  const total = items.length;
  const shown = items.slice(0, 9);
  const count = shown.length;
  const columns = count === 1 ? 1 : count === 2 ? 2 : count === 3 ? 3 : count === 4 ? 2 : 3;
  const single = count === 1 ? " single" : "";

  const tiles = shown
    .map((item, index) => {
      const extra = index === shown.length - 1 && total > shown.length ? total - shown.length : 0;
      return mediaHTML(item, extra);
    })
    .join("");

  return `<div class="media-grid cols-${columns}${single}">${tiles}</div>`;
}

function mediaHTML(item, extra) {
  const type = String(item.type || "").toLowerCase();
  const extraBadge = extra > 0 ? `<span class="media-more">+${extra}</span>` : "";

  if (type === "video" || type === "live_photo") {
    const poster = item.thumbnail_url || "";
    return `<button class="media is-video" type="button" data-video="${esc(item.url)}" aria-label="播放视频">
      ${poster ? `<img src="${esc(poster)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}
      <span class="play-badge">${icon("play")}</span>
      ${extraBadge}
    </button>`;
  }

  return `<button class="media" type="button" data-image="${esc(item.url)}" aria-label="查看大图">
    <img src="${esc(item.url)}" alt="" loading="lazy" referrerpolicy="no-referrer"
      onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'media-placeholder',textContent:'图片加载失败'}))">
    ${extraBadge}
  </button>`;
}

function attachmentHTML(item) {
  const music = item.music || {};
  const isMusic = isAttachment(item);
  const title = music.music_title || music.url_title || (isMusic ? "分享了一首歌" : "分享内容");
  const desc = music.music_author || (isMusic ? "音乐分享" : "链接分享");
  const cover = music.music_img || "";
  const href = safeLink(music.music_share_url || music.music_url || item.url);
  const playable = Boolean(music.music_id || music.music_author);
  const frosted = isMusic && Boolean(cover);

  const inner = `
    ${frosted ? `<img class="attachment-bg" src="${esc(cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" aria-hidden="true" onerror="this.remove()">` : ""}
    ${frosted ? `<span class="attachment-veil" aria-hidden="true"></span>` : ""}
    <span class="attachment-icon">
      ${icon(isMusic ? "music" : "link")}
      ${cover ? `<img src="${esc(cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}
    </span>
    <span class="attachment-copy">
      <strong>${esc(title)}</strong>
      <small>${esc(desc)}</small>
    </span>
    <span class="attachment-open">${icon("external")}</span>
    ${playable ? `<span class="attachment-play">${icon("play")}</span>` : ""}`;

  return href
    ? `<a class="attachment-card${isMusic ? " music" : ""}" href="${esc(href)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(title)}">${inner}</a>`
    : `<div class="attachment-card${isMusic ? " music" : ""}">${inner}</div>`;
}

function safeLink(value) {
  const match = String(value || "").match(/https?:\/\/[^\s"'<>]+/);
  if (!match) return "";
  try {
    const url = new URL(match[0]);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

// ---- 发布 ----

export function openPublish(user) {
  const name = user?.nickname || user?.phone || "我";
  const emojis = ["😀", "😄", "🥰", "😭", "😴", "🌙", "✨", "🍃", "☕️", "🎧", "🐱", "🫶"];
  const images = [];

  const modal = openModal(
    `
    <div class="publish-head">
      <h2>发布动态</h2>
      <button class="icon-button" type="button" data-close aria-label="关闭">${icon("close")}</button>
    </div>
    <div class="publish-user">
      ${avatarHTML({ url: user?.avatar_url, name, color: "beede7", size: 40 })}
      <div>
        <strong>${esc(name)}</strong>
        <small>公开 · 所有人可见</small>
      </div>
    </div>
    <textarea class="publish-input" maxlength="500" placeholder="分享此刻的想法…"></textarea>
    <div class="publish-previews" data-previews hidden></div>
    <div class="publish-tools">
      <button class="tool-chip" type="button" data-pick>${icon("photo")}图片</button>
      <button class="tool-chip" type="button" data-emoji>${icon("emoji")}表情</button>
      <button class="tool-chip" type="button" data-topic>${icon("channel")}话题</button>
      <span class="publish-count" data-count>0/500</span>
    </div>
    <div class="emoji-pop" data-emoji-pop hidden>
      ${emojis.map((emoji) => `<button type="button" data-emoji-char="${emoji}">${emoji}</button>`).join("")}
    </div>
    <div class="publish-actions">
      <button class="ghost-button" type="button" data-close>取消</button>
      <button class="publish-submit" type="button" data-submit disabled>发布</button>
    </div>
    <p class="publish-note">官方发布接口还没接入；发布会先保存成浏览器本地草稿。</p>
    <input type="file" accept="image/*" multiple hidden data-file>`,
    {
      panelClass: "publish-modal",
      onClose: () => images.forEach((image) => URL.revokeObjectURL(image.url)),
    },
  );

  const panel = modal.panel;
  const textarea = panel.querySelector(".publish-input");
  const previews = panel.querySelector("[data-previews]");
  const count = panel.querySelector("[data-count]");
  const submit = panel.querySelector("[data-submit]");
  const fileInput = panel.querySelector("[data-file]");
  const emojiPop = panel.querySelector("[data-emoji-pop]");

  function updateSubmit() {
    const hasContent = textarea.value.trim().length > 0 || images.length > 0;
    submit.disabled = !hasContent;
    count.textContent = `${textarea.value.length}/500`;
  }

  function insertAtCursor(text) {
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.focus();
    updateSubmit();
  }

  function renderPreviews() {
    previews.hidden = images.length === 0;
    previews.innerHTML = images
      .map(
        (image, index) => `<div class="publish-preview">
          <img src="${esc(image.url)}" alt="">
          <button type="button" data-remove-image="${index}" aria-label="移除图片">${icon("close")}</button>
        </div>`,
      )
      .join("");
  }

  textarea.addEventListener("input", updateSubmit);
  textarea.focus();

  panel.querySelector("[data-pick]").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const files = [...(fileInput.files || [])];
    if (!files.length) return;
    for (const file of files) {
      if (images.length >= 4) {
        toast("最多添加 4 张图片。");
        break;
      }
      images.push({ name: file.name, url: URL.createObjectURL(file) });
    }
    fileInput.value = "";
    renderPreviews();
    updateSubmit();
  });

  previews.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-image]");
    if (!button) return;
    const index = Number(button.dataset.removeImage);
    const [removed] = images.splice(index, 1);
    if (removed) URL.revokeObjectURL(removed.url);
    renderPreviews();
    updateSubmit();
  });

  panel.querySelector("[data-emoji]").addEventListener("click", () => {
    emojiPop.hidden = !emojiPop.hidden;
  });
  emojiPop.addEventListener("click", (event) => {
    const button = event.target.closest("[data-emoji-char]");
    if (!button) return;
    insertAtCursor(button.dataset.emojiChar);
    emojiPop.hidden = true;
  });

  panel.querySelector("[data-topic]").addEventListener("click", () => {
    insertAtCursor("#");
  });

  submit.addEventListener("click", () => {
    const content = textarea.value.trim();
    if (!content && !images.length) return;
    const drafts = JSON.parse(localStorage.getItem("simple.drafts") || "[]");
    drafts.unshift({ content, images: images.map((image) => image.name), at: Date.now() });
    localStorage.setItem("simple.drafts", JSON.stringify(drafts.slice(0, 20)));
    modal.close();
    toast("已保存为本地草稿（发布接口还没接入）");
  });
}
