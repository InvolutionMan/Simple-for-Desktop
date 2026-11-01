// 评论弹层：分页、楼中楼、发表、回复、点赞。交互对齐桌面版 CommentsSheet。

import { api } from "../api.js?v=20261101bf";
import { esc, avatarHTML, icon, openModal, spinnerHTML } from "../ui.js?v=20261101bf";
import { relativeTime } from "../format.js?v=20261101bf";

export function openComments(post, { onCommentAdded } = {}) {
  const state = {
    comments: [],
    cursor: null,
    canMore: true,
    loading: true,
    loadingMore: false,
    error: "",
    replies: new Map(),
    loadingReplies: new Set(),
    expanded: new Set(),
    replyTarget: null,
    sending: false,
  };

  const modal = openModal(
    `
    <div class="panel-head">
      <h2 class="panel-title">评论<span class="comments-head-count" data-count>0</span></h2>
      <button class="panel-close" type="button" data-close>关闭</button>
    </div>
    <div class="rule"></div>
    <div class="comments-scroll">
      <div class="comments-list"></div>
    </div>
    <div class="comments-composer">
      <div class="composer-error" role="alert"></div>
      <div class="reply-chip" hidden>回复 <span data-reply-name></span><button type="button" data-cancel-reply aria-label="取消回复">×</button></div>
      <div class="composer-row">
        <input class="composer-input" type="text" maxlength="500" placeholder="写下你的评论…" aria-label="评论内容">
        <button class="send-button" type="button" disabled>发送</button>
      </div>
    </div>`,
    { panelClass: "comments-panel" },
  );

  const panel = modal.panel;
  const scroll = panel.querySelector(".comments-scroll");
  const list = panel.querySelector(".comments-list");
  const countLabel = panel.querySelector("[data-count]");
  const composerError = panel.querySelector(".composer-error");
  const input = panel.querySelector(".composer-input");
  const sendButton = panel.querySelector(".send-button");
  const chip = panel.querySelector(".reply-chip");
  const chipName = panel.querySelector("[data-reply-name]");

  paint();
  loadPage({ more: false });

  scroll.addEventListener(
    "scroll",
    () => {
      if (scroll.scrollTop + scroll.clientHeight < scroll.scrollHeight - 160) return;
      loadPage({ more: true });
    },
    { passive: true },
  );

  list.addEventListener("click", (event) => {
    const like = event.target.closest("[data-like-comment]");
    if (like) {
      likeComment(like.dataset.likeComment);
      return;
    }

    const reply = event.target.closest("[data-reply]");
    if (reply) {
      const target = state.comments.find((comment) => comment.id === reply.dataset.reply);
      if (!target) return;
      state.replyTarget = target;
      updateComposer();
      input.focus();
      return;
    }

    const expand = event.target.closest("[data-expand]");
    if (expand) {
      toggleReplies(expand.dataset.expand);
    }
  });

  input.addEventListener("input", updateComposer);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      submit();
    }
  });
  sendButton.addEventListener("click", submit);
  chip.querySelector("[data-cancel-reply]").addEventListener("click", () => {
    state.replyTarget = null;
    updateComposer();
    input.focus();
  });

  // ---- 数据 ----

  async function loadPage({ more }) {
    if (more && (state.loadingMore || !state.canMore || state.loading)) return;
    if (more) {
      state.loadingMore = true;
      paint();
    }

    try {
      const data = await api.comments(post.id, more ? state.cursor : null);
      const incoming = Array.isArray(data.comments)
        ? data.comments.filter((comment) => comment && comment.id)
        : [];
      const fresh = incoming.filter(
        (comment) => !state.comments.some((existing) => existing.id === comment.id),
      );

      state.comments = more ? state.comments.concat(fresh) : fresh;
      state.cursor = state.comments.length
        ? state.comments[state.comments.length - 1].id
        : null;
      state.canMore = incoming.length >= 10 && fresh.length > 0;
      state.error = "";
    } catch (error) {
      state.error = error.message || "评论加载失败。";
      if (more) state.canMore = false;
    }

    state.loading = false;
    state.loadingMore = false;
    paint();
  }

  async function loadReplies(commentId) {
    if (state.loadingReplies.has(commentId)) return;
    state.loadingReplies.add(commentId);
    paint();

    try {
      const data = await api.replies(commentId);
      state.replies.set(
        commentId,
        Array.isArray(data.replies) ? data.replies.filter((reply) => reply && reply.id) : [],
      );
    } catch {
      state.replies.set(commentId, []);
    }

    state.loadingReplies.delete(commentId);
    paint();
  }

  function toggleReplies(commentId) {
    if (state.expanded.has(commentId)) {
      state.expanded.delete(commentId);
      paint();
      return;
    }
    state.expanded.add(commentId);
    paint();
    if (!state.replies.has(commentId)) {
      loadReplies(commentId);
    }
  }

  async function likeComment(commentId) {
    const comment = state.comments.find((candidate) => candidate.id === commentId);
    if (!comment) return;
    const before = Boolean(comment.is_voted);
    comment.is_voted = !before;
    paint();

    try {
      await api.voteComment(commentId, comment.is_voted);
    } catch (error) {
      comment.is_voted = before;
      paint();
      showError(error.message);
    }
  }

  async function submit() {
    const content = input.value.trim();
    if (!content || state.sending) return;

    state.sending = true;
    showError("");
    updateComposer();

    try {
      if (state.replyTarget) {
        const target = state.replyTarget;
        const data = await api.addReply(target.id, content);
        if (data.reply) {
          const replies = state.replies.get(target.id) || [];
          replies.push(data.reply);
          state.replies.set(target.id, replies);
        } else {
          await loadReplies(target.id);
        }
        state.expanded.add(target.id);
        target.replies_count = Number(target.replies_count || 0) + 1;
        state.replyTarget = null;
      } else {
        const data = await api.addComment(post.id, content);
        if (data.comment) {
          state.comments.unshift(data.comment);
        } else {
          await loadPage({ more: false });
        }
        onCommentAdded?.();
      }

      input.value = "";
      state.sending = false;
      updateComposer();
      paint();
      input.focus();
    } catch (error) {
      state.sending = false;
      updateComposer();
      showError(error.message || "发送失败，请稍后再试。");
    }
  }

  // ---- 渲染 ----

  function paint() {
    countLabel.textContent = String(state.comments.length);

    if (state.loading) {
      list.innerHTML = spinnerHTML();
      updateComposer();
      return;
    }

    if (!state.comments.length) {
      list.innerHTML = `<p class="comments-empty">${esc(state.error || "还没有评论")}</p>`;
      updateComposer();
      return;
    }

    const items = state.comments.map(commentHTML);
    if (state.loadingMore) items.push(spinnerHTML());
    list.innerHTML = items.join("");
    updateComposer();
  }

  function commentHTML(comment) {
    const liked = Boolean(comment.is_voted);
    const repliesCount = Number(comment.replies_count || 0);
    const expanded = state.expanded.has(comment.id);
    const replies = state.replies.get(comment.id) || [];
    const loadingReplies = state.loadingReplies.has(comment.id);

    let repliesHTML = "";
    if (repliesCount > 0) {
      const rows = expanded
        ? loadingReplies
          ? spinnerHTML()
          : replies.map(replyHTML).join("")
        : "";
      repliesHTML = `<div class="replies">
        <button class="reply-toggle" type="button" data-expand="${esc(comment.id)}">
          ${expanded ? "收起回复" : `查看 ${repliesCount} 条回复`}
        </button>
        ${rows}
      </div>`;
    }

    return `<div class="comment" data-comment="${esc(comment.id)}">
      <div class="comment-main">
        ${avatarHTML({
          url: comment.user?.avatar_url,
          name: comment.user?.nickname,
          color: comment.user?.avatar_color,
          size: 30,
          className: "comment-avatar",
        })}
        <div class="comment-id">
          <div class="comment-head">
            <span class="comment-name">${esc(comment.user?.nickname || "匿名用户")}</span>
            ${comment.is_author ? '<span class="author-tag">作者</span>' : ""}
            <span class="comment-time">${esc(relativeTime(comment.created_at))}</span>
          </div>
          <p class="comment-body">${esc(comment.content || "")}</p>
        </div>
        <div class="comment-tools">
          <button class="tool" type="button" data-reply="${esc(comment.id)}">回复</button>
          <button class="tool${liked ? " liked" : ""}" type="button" data-like-comment="${esc(comment.id)}"
            aria-label="${liked ? "取消赞评论" : "赞评论"}" aria-pressed="${liked}">
            ${icon(liked ? "heartFilled" : "heart")}
          </button>
        </div>
      </div>
      ${repliesHTML}
    </div>`;
  }

  function replyHTML(reply) {
    return `<div class="reply">
      ${avatarHTML({
        url: reply.user?.avatar_url,
        name: reply.user?.nickname,
        color: reply.user?.avatar_color,
        size: 24,
      })}
      <div>
        <div class="reply-head">
          <span class="reply-name">${esc(reply.user?.nickname || "匿名用户")}</span>
          ${reply.is_author ? '<span class="author-tag">作者</span>' : ""}
          <span class="reply-time">${esc(relativeTime(reply.created_at))}</span>
        </div>
        <p class="reply-body">${esc(reply.content || "")}</p>
      </div>
    </div>`;
  }

  function updateComposer() {
    const canSend = input.value.trim().length > 0 && !state.sending;
    sendButton.disabled = !canSend;
    sendButton.textContent = state.sending ? "发送中…" : "发送";

    if (state.replyTarget) {
      chip.hidden = false;
      chipName.textContent = state.replyTarget.user?.nickname || "这条评论";
      input.placeholder = `回复 ${state.replyTarget.user?.nickname || "这条评论"}…`;
    } else {
      chip.hidden = true;
      input.placeholder = "写下你的评论…";
    }
  }

  function showError(message) {
    composerError.textContent = message;
    state.error = message;
  }
}
