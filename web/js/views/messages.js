// 私信中心：只显示官方环信账号里的单聊会话与消息。
// 不生成系统通知、评论 / 赞通知，也不伪造发送成功。

import { api } from "../api.js?v=20261101bf";
import { avatarHTML, esc, icon, mark, openImage, toast } from "../ui.js?v=20261101bf";
import { fullDateTime, messageListTime } from "../format.js?v=20261101bf";
import {
  connectIm,
  conversationToItem,
  fetchImConversations,
  fetchImHistory,
  fetchImGroupConversations,
  fetchImGroupHistory,
  imSummary,
  peerProfileFromMessages,
} from "../im.js?v=20261101bf";
import { renderPostCard } from "./feed.js?v=20261101bf";

const READ_PREFIX = "simple.dm.read.";
const EMOJI_RE =
  /(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)/gu;

export function mountMessages(root, { user = null } = {}) {
  const accountId = user?.id || "local";
  const readKey = `${READ_PREFIX}${accountId}`;
  let readIds = loadReadIds();
  let conversations = [];
  const histories = new Map();
  const loading = new Set();
  let selectedId = null;
  let mobileDetail = false;
  let query = "";
  let unreadOnly = false;
  let imState = "connecting";
  let imClient = null;
  let imUserId = "";
  let disposed = false;
  let searchTimer = 0;
  let refreshing = false;
  let sending = false;
  const drafts = new Map();
  let mode = "dm";
  let channelUpdates = [];
  let channelRooms = [];
  let channelUpdatesState = "idle";
  let channelUpdatesError = "";
  let selectedChannelId = null;
  let selectedRoomId = null;
  const roomHistories = new Map();
  const roomLoading = new Set();
  const roomDrafts = new Map();
  let sendingRoom = false;
  let voiceAudio = null;
  let voiceButton = null;
  let liveSyncTimer = null;
  let syncingLive = false;
  let lastListSync = 0;

  root.innerHTML = `
    <div class="messages-page dm-only" data-messages-page>
      <header class="messages-topbar">
        <div class="messages-heading">
          <h1>消息</h1>
          <span class="messages-unread-sum" data-unread-sum></span>
          <span class="messages-sync" data-im-state="connecting" data-state="connecting" title="正在连接私信">连接中</span>
        </div>

        <div class="messages-search" role="search">
          ${icon("search")}
          <input class="messages-search-input" type="text" placeholder="搜索私信" aria-label="搜索私信" autocomplete="off">
          <button class="messages-search-clear" type="button" data-clear-search aria-label="清除搜索" hidden>${icon("close")}</button>
        </div>

        <div class="messages-actions">
          <button class="messages-action" type="button" data-read-all>
            ${icon("checkCheck")}<span>全部已读</span>
          </button>
        </div>
      </header>

      <div class="messages-body">
        <aside class="messages-list-pane">
          <div class="message-mode-tabs" data-mode-tabs role="tablist" aria-label="消息类型">
            <button class="message-mode-tab active" type="button" data-message-mode="dm" role="tab" aria-selected="true">私信</button>
            <button class="message-mode-tab" type="button" data-message-mode="channel" role="tab" aria-selected="false">频道</button>
          </div>

          <div class="message-list-tools">
            <span class="message-list-count" data-list-count></span>
            <button class="message-filter" type="button" data-unread-filter>
              ${icon("filter")}<span>只看未读</span>
            </button>
          </div>

          <div class="message-list" data-message-list role="list"></div>
        </aside>

        <section class="messages-detail-pane" data-detail-pane>
          <div class="message-detail" data-message-detail></div>
        </section>
      </div>
    </div>`;

  const page = root.querySelector("[data-messages-page]");
  const list = root.querySelector("[data-message-list]");
  const detail = root.querySelector("[data-message-detail]");
  const detailPane = root.querySelector("[data-detail-pane]");
  const search = root.querySelector(".messages-search-input");
  const searchClear = root.querySelector("[data-clear-search]");
  const unreadSum = root.querySelector("[data-unread-sum]");
  const imLabel = root.querySelector("[data-im-state]");
  const readAll = root.querySelector("[data-read-all]");
  const listCount = root.querySelector("[data-list-count]");
  const filterButton = root.querySelector("[data-unread-filter]");
  const modeTabs = root.querySelector("[data-mode-tabs]");

  const onStorage = (event) => {
    if (event.key !== readKey) return;
    readIds = loadReadIds();
    conversations = conversations.map((item) => ({
      ...item,
      read: readIds.has(item.id) || item.unreadCount === 0,
      unreadCount: readIds.has(item.id) ? 0 : item.unreadCount,
    }));
    renderAll();
  };

  const onFocus = () => {
    if (!imClient || imState !== "online") return;
    refreshConversations();
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      onFocus();
      syncLive();
    }
  };

  const onKeyDown = (event) => {
    if (event.target.matches?.("[data-room-input]")) {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        sendRoomReply();
        return;
      }
    }
    if (event.target.matches?.("[data-dm-input]")) {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        sendReply();
        return;
      }
    }
    if (event.key !== "Escape") return;
    if (document.activeElement === search && search.value) {
      clearSearch();
      return;
    }
    if (mobileDetail && (selectedChannelId || selectedRoomId)) {
      selectedChannelId = null;
      selectedRoomId = null;
      mobileDetail = false;
      renderAll();
      return;
    }
    if (mobileDetail && selectedId) {
      selectedId = null;
      mobileDetail = false;
      renderAll();
    }
  };

  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);
  root.addEventListener("submit", onSubmit);
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("storage", onStorage);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);

  renderAll();
  initIm();
  liveSyncTimer = setInterval(syncLive, 6000);

  return () => {
    disposed = true;
    if (voiceAudio) {
      voiceAudio.pause();
      voiceAudio = null;
      voiceButton = null;
    }
    clearTimeout(searchTimer);
    clearInterval(liveSyncTimer);
    try {
      imClient?.removeEventHandler("simple-dm");
      imClient?.close();
    } catch {
      // 连接可能已经断开。
    }
    root.removeEventListener("click", onClick);
    root.removeEventListener("input", onInput);
    root.removeEventListener("submit", onSubmit);
    document.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
  };

  // ---- 数据 ----

  function loadReadIds() {
    try {
      const parsed = JSON.parse(localStorage.getItem(readKey) || "[]");
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  }

  function saveReadIds() {
    try {
      localStorage.setItem(readKey, JSON.stringify([...readIds]));
    } catch {
      // 无痕模式只影响本次页面。
    }
  }

  function sortMessages(messages) {
    return [...messages].sort(
      (a, b) => (Number(a.time) || 0) - (Number(b.time) || 0),
    );
  }

  function sortConversations(items) {
    return [...items].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    );
  }

  function unreadCount() {
    return conversations.reduce(
      (sum, item) => sum + (item.read ? 0 : Math.max(1, item.unreadCount || 1)),
      0,
    );
  }

  function matchesQuery(item) {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [item.actor?.name, item.summary, item.lastMessage?.msg]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle);
  }

  function visibleItems() {
    return sortConversations(
      conversations
        .filter((item) => !unreadOnly || !item.read)
        .filter(matchesQuery),
    );
  }

  function markRead(item) {
    item.read = true;
    item.unreadCount = 0;
    readIds.add(item.id);
    saveReadIds();
  }

  // ---- 环信连接 ----

  function setImState(next) {
    imState = next;
    if (!imLabel) return;
    const copy = {
      connecting: "连接中",
      online: "已连接",
      offline: "已离线",
      error: "连接失败",
    };
    imLabel.textContent = copy[next] || "连接中";
    imLabel.dataset.state = next;
    imLabel.title =
      next === "online"
        ? "私信已连接官方环信"
        : next === "error"
          ? "没有读取到本机官方客户端的私信凭据"
          : next === "offline"
            ? "私信连接暂时断开"
            : "正在连接私信";
  }

  async function initIm() {
    setImState("connecting");
    renderAll();
    try {
      const { connection, userId } = await connectIm();
      if (disposed) {
        try { connection.close(); } catch {}
        return;
      }
      if (typeof connection.send !== "function") {
        throw new Error("环信 SDK 不支持发送消息。");
      }
      imClient = connection;
      imUserId = userId;
      connection.addEventHandler("simple-dm", {
        onMessage: onIncoming,
        onConnected: () => {
          if (disposed) return;
          setImState("online");
          if (mode === "channel" && channelUpdatesState !== "loading") {
            loadChannelUpdates(true);
          }
        },
        onDisconnected: () => {
          if (disposed) return;
          setImState("offline");
          renderAll();
        },
      });
      await refreshConversations();
      if (!disposed) {
        setImState("online");
        renderAll();
      }
    } catch {
      if (disposed) return;
      setImState("error");
      renderAll();
    }
  }

  async function refreshConversations() {
    if (!imClient || disposed || refreshing) return;
    refreshing = true;
    try {
      const raw = await fetchImConversations(imClient);
      const items = raw.map((conversation) =>
        conversationToItem(conversation, readIds),
      );

      // 预取会话历史：既让打开会话秒开，也用「对方发过的消息」校正昵称 / 头像。
      // 最后一条可能是自己发的，不能拿最后一条的 ext 当对方资料。
      await Promise.all(
        items.map(async (item) => {
          try {
            const messages = sortMessages(
              await fetchImHistory(imClient, item.peerId),
            );
            histories.set(item.id, messages);
            item.actor = peerProfileFromMessages(
              messages,
              item.peerId,
              item.actor,
            );
          } catch {
            // 资料回退到会话本身；历史等打开会话时再试。
          }
        }),
      );

      if (disposed) return;
      conversations = sortConversations(items);
      if (selectedId && !conversations.some((item) => item.id === selectedId)) {
        selectedId = null;
        mobileDetail = false;
      }
      renderAll();
    } catch {
      // 网络抖动时保留当前会话；下次聚焦或新消息会再拉。
    } finally {
      refreshing = false;
    }
  }

  async function syncLive() {
    if (
      disposed ||
      syncingLive ||
      !imClient ||
      imState !== "online" ||
      document.visibilityState !== "visible"
    ) {
      return;
    }
    syncingLive = true;
    try {
      if (mode === "dm") {
        if (selectedId) {
          await syncActiveDm();
        } else if (Date.now() - lastListSync >= 10000) {
          lastListSync = Date.now();
          await refreshConversations();
        }
      } else if (mode === "channel" && selectedRoomId) {
        await syncActiveRoom();
      }
    } catch {
      // 轮询失败不打断 WebSocket 实时消息。
    } finally {
      syncingLive = false;
    }
  }

  function mergeFetchedMessages(existing, incoming) {
    const byId = new Map();
    for (const message of existing) {
      const key = String(message.id || `${message.time}-${message.from}`);
      byId.set(key, message);
    }
    let added = 0;
    for (const message of incoming) {
      const key = String(message.id || `${message.time}-${message.from}`);
      if (!byId.has(key)) {
        byId.set(key, message);
        added += 1;
      }
    }
    return {
      messages: [...byId.values()].sort(
        (a, b) => (Number(a.time) || 0) - (Number(b.time) || 0),
      ),
      added,
    };
  }

  async function syncActiveDm() {
    const item = conversations.find((entry) => entry.id === selectedId);
    if (!item) return;
    const current = histories.get(item.id);
    if (!Array.isArray(current)) return;
    const latest = await fetchImHistory(imClient, item.peerId);
    const merged = mergeFetchedMessages(current, latest);
    if (!merged.added) return;
    histories.set(item.id, merged.messages);
    const last = merged.messages[merged.messages.length - 1];
    item.lastMessage = last;
    item.summary = imSummary(last);
    item.createdAt = new Date(Number(last.time) || Date.now()).toISOString();
    item.read = true;
    item.unreadCount = 0;
    markRead(item);
    renderAll();
  }

  async function syncActiveRoom() {
    const room = channelRooms.find((entry) => entry.id === selectedRoomId);
    if (!room) return;
    const current = roomHistories.get(room.id);
    if (!Array.isArray(current)) return;
    const latest = await fetchImGroupHistory(imClient, room.im_id);
    const merged = mergeFetchedMessages(current, latest);
    if (!merged.added) return;
    roomHistories.set(room.id, merged.messages);
    const last = merged.messages[merged.messages.length - 1];
    room.conversation = {
      ...(room.conversation || {}),
      lastMessage: last,
      unReadCount: 0,
    };
    readIds.add(roomReadKey(room));
    saveReadIds();
    renderAll();
  }

  function onIncoming(payload) {
    const list = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.messages)
        ? payload.messages
        : [payload?.message || payload].filter(Boolean);
    list.filter(Boolean).forEach(onIncomingOne);
  }

  function onIncomingOne(message) {
    if (!message) return;

    if (message.chatType === "groupChat") {
      const groupId = String(message.to || message.toId || "");
      const room = channelRooms.find(
        (entry) => String(entry.im_id) === groupId,
      );
      if (room) onRoomIncoming(room, message);
      return;
    }

    if (message.chatType && !["singleChat", "chat"].includes(message.chatType)) {
      return;
    }

    const peerId = message.from === imUserId ? message.to : message.from;
    if (!peerId || peerId === imUserId) return;

    const item = conversations.find((entry) => entry.peerId === peerId);
    if (!item) {
      refreshConversations();
      return;
    }

    const fromPeer = message.from !== imUserId;
    item.lastMessage = message;
    item.summary = imSummary(message);
    item.createdAt = new Date(Number(message.time) || Date.now()).toISOString();
    if (fromPeer) {
      item.actor = peerProfileFromMessages([message], peerId, item.actor);
    }

    if (selectedId === item.id) {
      markRead(item);
      const history = histories.get(item.id);
      if (Array.isArray(history)) {
        if (!history.some((entry) => entry.id === message.id)) {
          history.push(message);
          history.sort(
            (a, b) => (Number(a.time) || 0) - (Number(b.time) || 0),
          );
        }
      } else {
        loadHistory(item);
      }
    } else if (fromPeer) {
      item.read = false;
      item.unreadCount = (item.unreadCount || 0) + 1;
    }

    conversations = sortConversations(conversations);
    renderAll();
  }

  async function loadHistory(item) {
    if (!imClient || disposed) return;
    if (histories.has(item.id) || loading.has(item.id)) return;

    loading.add(item.id);
    renderDetail();
    try {
      const messages = sortMessages(
        await fetchImHistory(imClient, item.peerId),
      );
      histories.set(item.id, messages);
      item.actor = peerProfileFromMessages(messages, item.peerId, item.actor);
      if (selectedId === item.id) renderAll();
    } catch {
      histories.set(item.id, { error: true });
      if (selectedId === item.id) renderDetail();
    } finally {
      loading.delete(item.id);
      if (!disposed && selectedId === item.id) renderDetail();
    }
  }

  // ---- 渲染 ----

  function renderAll({ resetScroll = false } = {}) {
    if (disposed) return;
    renderModeTabs();
    if (mode === "channel") {
      renderChannelList(resetScroll);
      renderChannelDetail();
      renderChannelTopbar();
      return;
    }
    reconcileSelection();
    renderList(resetScroll);
    renderDetail();
    renderTopbar();
  }

  function renderModeTabs() {
    modeTabs.querySelectorAll("[data-message-mode]").forEach((button) => {
      const active = button.dataset.messageMode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
  }

  function reconcileSelection() {
    if (!selectedId) return;
    const visible = visibleItems();
    if (!visible.some((item) => item.id === selectedId)) {
      selectedId = null;
      mobileDetail = false;
    }
  }

  function renderList(resetScroll = false) {
    const previousScroll = list.scrollTop;
    const visible = visibleItems();
    listCount.textContent = query
      ? `找到 ${visible.length} 个会话`
      : `私信 · ${visible.length} 个会话`;
    filterButton.classList.toggle("active", unreadOnly);
    filterButton.querySelector("span").textContent = unreadOnly
      ? "查看全部"
      : "只看未读";
    filterButton.setAttribute("aria-pressed", String(unreadOnly));

    list.innerHTML = visible.length
      ? visible.map((item) => messageRow(item)).join("")
      : emptyStateHTML(emptyMeta(), "compact");
    list.scrollTop = resetScroll ? 0 : previousScroll;
  }

  function renderDetail() {
    const visible = visibleItems();
    const item = selectedId
      ? conversations.find((entry) => entry.id === selectedId)
      : null;

    if (!item || !visible.some((entry) => entry.id === item.id)) {
      selectedId = null;
      mobileDetail = false;
      detail.classList.remove("dm-mode");
      detail.innerHTML =
        visible.length === 0 ? emptyStateHTML(emptyMeta()) : overviewHTML();
      page.classList.remove("detail-open");
      return;
    }

    const oldInput = detail.querySelector("[data-dm-input]");
    const hadFocus = oldInput && document.activeElement === oldInput;
    const selectionStart = hadFocus ? oldInput.selectionStart : 0;
    const selectionEnd = hadFocus ? oldInput.selectionEnd : 0;

    detail.classList.add("dm-mode");
    detail.innerHTML = dmDetailHTML(item);
    page.classList.add("detail-open");

    const input = detail.querySelector("[data-dm-input]");
    if (input) {
      input.style.height = "auto";
      input.style.height = `${input.scrollHeight}px`;
    }
    if (hadFocus && input) {
      input.focus();
      input.setSelectionRange(selectionStart, selectionEnd);
    }

    requestAnimationFrame(() => {
      const thread = detail.querySelector("[data-dm-thread]");
      if (thread) thread.scrollTop = thread.scrollHeight;
    });
  }

  function renderTopbar() {
    const unread = unreadCount();
    unreadSum.textContent = unread ? `未读 ${unread}` : "全部已读";
    readAll.hidden = false;
    readAll.disabled = unread === 0;
    search.placeholder = "搜索私信";
    searchClear.hidden = !query;
    filterButton.hidden = false;
  }

  // ---- HTML ----

  function messageRow(item) {
    const actor = item.actor?.name || "私信用户";
    const avatar = item.actor?.avatar_url
      ? avatarHTML({
          url: item.actor.avatar_url,
          name: actor,
          color: item.actor.color,
          size: 44,
          className: "message-avatar",
        })
      : `<span class="message-avatar system">${icon("message")}</span>`;
    const unread = !item.read;
    const badge = Math.max(1, item.unreadCount || 1);
    const badgeText = badge > 99 ? "99+" : String(badge);

    return `<button class="message-item${unread ? " unread" : ""}${selectedId === item.id ? " selected" : ""}" type="button" data-message-id="${esc(item.id)}" aria-current="${selectedId === item.id}" role="listitem">
      ${avatar}
      <span class="message-item-main">
        <span class="message-item-top"><strong>${esc(actor)}</strong></span>
        <span class="message-item-summary"><span>${esc(item.summary || "还没有消息")}</span></span>
        <span class="message-item-meta">${icon("message")}私信 · 环信</span>
      </span>
      <span class="message-item-tail">
        <time>${esc(messageListTime(item.createdAt))}</time>
        ${unread ? `<span class="message-unread">${badgeText}</span>` : ""}
      </span>
    </button>`;
  }

  function dmDetailHTML(item) {
    const history = histories.get(item.id);
    const isLoading = loading.has(item.id);
    const failed = history && !Array.isArray(history);
    let body = "";

    if (isLoading) {
      body = `<div class="dm-thread-state"><span class="message-spinner"></span>正在读取私信…</div>`;
    } else if (failed) {
      body = `<div class="dm-thread-state"><strong>私信暂时无法读取</strong><span>检查官方客户端登录状态后刷新重试。</span></div>`;
    } else if (!history) {
      body = imState === "error" || imState === "offline"
        ? `<div class="dm-thread-state"><strong>私信连接失败</strong><span>没有读取到本机官方客户端的私信凭据。</span></div>`
        : `<div class="dm-thread-state"><span class="message-spinner"></span>正在连接私信…</div>`;
    } else if (history.length === 0) {
      body = `<div class="dm-thread-state"><strong>还没有消息</strong><span>对方发来的私信会显示在这里。</span></div>`;
    } else {
      body = history.map((message) => dmBubbleHTML(message, item)).join("");
    }

    return `<div class="message-detail-wrap dm-detail-wrap">
      <header class="message-detail-head">
        <button class="message-back" type="button" data-detail-back aria-label="返回私信列表">${icon("chevronLeft")}</button>
        ${item.actor?.avatar_url
          ? avatarHTML({
              url: item.actor.avatar_url,
              name: item.actor.name,
              color: item.actor.color,
              size: 44,
              className: "message-avatar",
            })
          : `<span class="message-avatar system">${icon("message")}</span>`}
        <div class="message-detail-who">
          <strong>${esc(item.actor?.name || "私信用户")}</strong>
          <span>私信 · ${item.read ? "已读" : "未读"}</span>
        </div>
        <time class="message-detail-time">${esc(fullDateTime(item.createdAt))}</time>
        <span class="message-detail-readonly">${icon("arrowUp")}可回复</span>
      </header>
      <div class="dm-thread" data-dm-thread>${body}</div>
      ${dmComposerHTML(item, Array.isArray(history))}
    </div>`;
  }

  function dmComposerHTML(item, historyReady) {
    const online = imState === "online";
    const canWrite = online && historyReady && !sending;
    const draft = drafts.get(item.id) || "";
    const placeholder = !online
      ? "私信未连接，暂时不能回复"
      : !historyReady
        ? "正在读取私信…"
        : `回复 ${item.actor?.name || "对方"}`;

    return `<form class="dm-composer" data-dm-form>
      <textarea class="dm-input" data-dm-input rows="1" maxlength="2000"
        placeholder="${esc(placeholder)}" aria-label="回复私信" ${canWrite ? "" : "disabled"}>${esc(draft)}</textarea>
      <button class="dm-send" type="submit" data-dm-send aria-label="发送回复" ${canWrite && draft.trim() ? "" : "disabled"}>
        ${icon("arrowUp")}
      </button>
    </form>`;
  }

  async function sendReply() {
    if (sending || !imClient || imState !== "online") return;
    const item = conversations.find((entry) => entry.id === selectedId);
    if (!item) return;
    const history = histories.get(item.id);
    const input = detail.querySelector("[data-dm-input]");
    const text = (drafts.get(item.id) ?? input?.value ?? "").trim();
    if (!text || !Array.isArray(history)) return;

    sending = true;
    const button = detail.querySelector("[data-dm-send]");
    if (button) {
      button.disabled = true;
      button.innerHTML = `<span class="message-spinner"></span>`;
    }
    if (input) input.disabled = true;

    try {
      const ext = outgoingExt();
      const result = await imClient.send({
        id: newMessageId(),
        type: "txt",
        msg: text,
        to: item.peerId,
        chatType: "singleChat",
        ext,
      });
      const sent = normalizeSent(result, text, item, ext);
      if (!history.some((message) => message.id === sent.id)) {
        history.push(sent);
        history.sort(
          (a, b) => (Number(a.time) || 0) - (Number(b.time) || 0),
        );
      }
      histories.set(item.id, history);
      item.lastMessage = sent;
      item.summary = imSummary(sent);
      item.createdAt = new Date(Number(sent.time) || Date.now()).toISOString();
      item.read = true;
      item.unreadCount = 0;
      drafts.delete(item.id);
      conversations = sortConversations(conversations);
      sending = false;
      renderAll();
      toast("已发送");
      focusComposer();
    } catch {
      sending = false;
      renderDetail();
      toast("消息发送失败，请稍后重试");
      focusComposer();
    }
  }

  function newMessageId() {
    // Easemob 的消息 id 必须是数字字符串；UUID 会被服务端静默丢弃。
    return `${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
  }

  function outgoingExt() {
    return {
      nickname: user?.nickname || "Simple 用户",
      avatarUrl: user?.avatar_url || "",
      avatarColor: "beede7",
      userId: user?.id || "",
    };
  }

  function normalizeSent(result, text, item, ext) {
    const data =
      result?.data?.message ||
      result?.data ||
      result?.message ||
      result ||
      {};
    const time = Number(data.time) || Date.now();
    return {
      id: String(data.id || data.msgId || data.serverMsgId || `sent-${time}`),
      type: "txt",
      msg: text,
      from: imUserId,
      to: item.peerId,
      time,
      ext: data.ext || ext,
      chatType: "singleChat",
    };
  }

  function focusComposer() {
    requestAnimationFrame(() => {
      const input = detail.querySelector("[data-dm-input]");
      if (!input || input.disabled) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  }

  function dmBubbleHTML(message, conversation) {
    const own = message.from === imUserId;
    const ext = message.ext || {};
    const peerName = ext.nickname || conversation.actor?.name || "对方";
    const peerAvatarUrl = ext.avatarUrl || conversation.actor?.avatar_url || "";
    const peerColor = /^[0-9a-f]{6}$/i.test(String(ext.avatarColor || ""))
      ? ext.avatarColor
      : conversation.actor?.color;
    const selfName = user?.nickname || "我";
    const avatar = own
      ? `<span class="dm-avatar">${avatarHTML({
          url: user?.avatar_url || "",
          name: selfName,
          color: "beede7",
          size: 30,
          className: "message-avatar",
          label: "我的头像",
        })}</span>`
      : `<span class="dm-avatar">${avatarHTML({
          url: peerAvatarUrl,
          name: peerName,
          color: peerColor,
          size: 30,
          className: "message-avatar",
        })}</span>`;
    const sender = own ? `我 · ${selfName}` : peerName;
    const time = messageListTime(
      new Date(Number(message.time) || Date.now()).toISOString(),
    );
    let content = "";

    if (message.type === "txt") {
      content = `<span class="dm-text">${renderTextHTML(message.msg || "")}</span>`;
    } else if (message.type === "img" || message.type === "image") {
      const url = messageMediaUrl(message, "image");
      content = url
        ? `<img class="dm-image" src="${esc(url)}" data-dm-image="${esc(url)}" alt="图片消息" loading="lazy" referrerpolicy="no-referrer">`
        : `<span class="dm-text dm-unsupported">[图片]</span>`;
    } else if (message.type === "audio" || message.type === "voice") {
      content = voiceBubbleHTML(message);
    } else if (message.type === "video") {
      content = `<span class="dm-text dm-unsupported">[视频]</span>`;
    } else if (message.type === "file") {
      content = `<span class="dm-text dm-unsupported">[文件]</span>`;
    } else if (message.type === "custom" && message.customEvent === "img") {
      content = customImageHTML(message);
    } else if (message.type === "custom") {
      content = message.msg
        ? `<span class="dm-text">${renderTextHTML(message.msg)}</span>`
        : `<span class="dm-text dm-unsupported">[${esc(message.customEvent || message.ext?.type || "自定义消息")}]</span>`;
    } else if (message.msg) {
      content = `<span class="dm-text">${renderTextHTML(message.msg)}</span>`;
    } else {
      content = `<span class="dm-text dm-unsupported">[暂不支持的消息]</span>`;
    }

    return `<div class="dm-message${own ? " own" : " peer"}">
      ${own ? "" : avatar}
      <div class="dm-message-main">
        <div class="dm-bubble">${content}</div>
        <div class="dm-meta">
          <span class="dm-sender">${esc(sender)}</span>
          <time class="dm-time">${esc(time)}</time>
        </div>
      </div>
      ${own ? avatar : ""}
    </div>`;
  }

  function customImageHTML(message) {
    const exts = message.customExts || {};
    const raw = String(exts.img || exts.url || message.url || "");
    const url = /^https?:\/\//i.test(raw) ? raw : "";
    if (!url) return `<span class="dm-text dm-unsupported">[图片]</span>`;
    const width = Number(exts.imgW || 0);
    const height = Number(exts.imgH || 0);
    const isEmoji = Boolean(message.ext?.emoji_id);
    const sizeAttrs = width > 0 && height > 0
      ? ` width="${Math.round(width)}" height="${Math.round(height)}"`
      : "";
    if (isEmoji) {
      return `<img class="dm-sticker" src="${esc(url)}" alt="表情" loading="lazy" referrerpolicy="no-referrer"${sizeAttrs}>`;
    }
    return `<img class="dm-image" src="${esc(url)}" data-dm-image="${esc(url)}" alt="图片消息" loading="lazy" referrerpolicy="no-referrer"${sizeAttrs}>`;
  }

  function renderTextHTML(text) {
    return esc(String(text || "")).replace(
      EMOJI_RE,
      '<span class="dm-emoji">$1</span>',
    );
  }

  function messageMediaUrl(message, kind) {
    const body = message.body || {};
    let raw = "";
    if (kind === "image") {
      raw =
        body.url ||
        message.url ||
        message.originalImageUrl ||
        message.bigImageUrl ||
        message.file?.url ||
        message.thumb ||
        body.thumb ||
        "";
    } else {
      raw = message.url || body.url || message.file?.url || "";
    }
    raw = String(raw || "");
    if (!raw) return "";
    if (raw.startsWith("/")) raw = `https://a1.easemob.com${raw}`;
    const secret = message.secret || body.secret;
    if (secret && !/[?&]share-secret=/.test(raw)) {
      raw += `${raw.includes("?") ? "&" : "?"}share-secret=${encodeURIComponent(secret)}`;
    }
    return /^https?:\/\//i.test(raw) ? raw : "";
  }

  function voiceSeconds(message) {
    const value = Number(
      message.length ??
        message.duration ??
        message.body?.length ??
        message.file_length ??
        0,
    );
    if (!Number.isFinite(value) || value <= 0) return 0;
    return value > 1000 ? Math.round(value / 1000) : Math.round(value);
  }

  function voiceLabel(message) {
    const seconds = voiceSeconds(message);
    if (!seconds) return "语音";
    const minutes = Math.floor(seconds / 60);
    const rest = String(seconds % 60).padStart(2, "0");
    return `${minutes}:${rest}`;
  }

  function voiceBubbleHTML(message) {
    const url = messageMediaUrl(message, "voice");
    const label = voiceLabel(message);
    if (!url) {
      return `<span class="dm-voice dm-voice-missing" title="官方消息未提供音频地址，无法播放" aria-label="语音 ${esc(label)}，官方消息未提供音频地址">
        <span class="dm-voice-play">${icon("play")}</span>
        <span class="dm-voice-time">${esc(label)}</span>
      </span>`;
    }
    return `<button class="dm-voice" type="button" data-voice-src="${esc(url)}" aria-label="播放语音 ${esc(label)}">
      <span class="dm-voice-play">${icon("play")}</span>
      <span class="dm-voice-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
      <span class="dm-voice-time">${esc(label)}</span>
    </button>`;
  }

  function toggleVoice(button) {
    const src = button.dataset.voiceSrc;
    if (!src) return;

    if (voiceButton === button && voiceAudio) {
      if (voiceAudio.paused) {
        voiceAudio.play().catch(() => toast("语音播放失败"));
      } else {
        voiceAudio.pause();
      }
      return;
    }

    if (voiceAudio) {
      voiceAudio.pause();
      voiceButton?.classList.remove("playing");
    }

    const audio = new Audio(src);
    audio.preload = "none";
    voiceAudio = audio;
    voiceButton = button;
    button.classList.add("playing");
    audio.addEventListener("play", () => button.classList.add("playing"));
    audio.addEventListener("pause", () => {
      button.classList.remove("playing");
      button.setAttribute("aria-pressed", "false");
    });
    audio.addEventListener("ended", () => {
      button.classList.remove("playing");
      button.setAttribute("aria-pressed", "false");
      voiceAudio = null;
      voiceButton = null;
    });
    audio.addEventListener("error", () => {
      button.classList.remove("playing");
      toast("语音播放失败");
      voiceAudio = null;
      voiceButton = null;
    });
    audio.play().catch(() => {
      button.classList.remove("playing");
      toast("语音播放失败");
    });
  }

  function overviewHTML() {
    const unread = unreadCount();
    return `<div class="message-overview">
      <div class="message-overview-mark">${mark(48, "var(--brand-ink)", "var(--brand-paper)")}</div>
      <span class="message-overview-eyebrow">PRIVATE MESSAGES</span>
      <h2>私信</h2>
      <p>只显示官方环信账号里的单聊消息。打开会话读取最近 50 条，支持文本回复；发送成功才会出现在气泡里，失败会保留草稿。</p>
      <div class="message-stats">
        <div class="message-stat"><strong>${conversations.length}</strong><span>会话</span></div>
        <div class="message-stat accent"><strong>${unread}</strong><span>未读</span></div>
      </div>
      <div class="message-overview-hint">${icon("chevronRight")}从左侧选择一个会话查看私信</div>
    </div>`;
  }

  function emptyMeta() {
    if (query.trim()) {
      return {
        icon: "search",
        title: "没有找到相关私信",
        copy: "换个关键词试试，或清除搜索查看全部会话。",
        action: "clear-search",
        actionLabel: "清除搜索",
      };
    }

    if (unreadOnly) {
      return {
        icon: "checkCheck",
        title: "没有未读私信",
        copy: "所有私信都已经读过了。",
        action: "show-all",
        actionLabel: "查看全部私信",
      };
    }

    if (imState === "connecting" || imState === "idle") {
      return {
        icon: "message",
        title: "正在连接私信…",
        copy: "正在读取官方账号的私信会话。",
      };
    }
    if (imState === "error") {
      return {
        icon: "lock",
        title: "私信连接失败",
        copy: "没有读取到本机官方客户端的私信凭据，或当前账号与官方客户端不一致。",
      };
    }
    if (imState === "offline") {
      return {
        icon: "message",
        title: "私信已离线",
        copy: "连接暂时断开，稍后刷新页面试试。",
      };
    }

    return {
      icon: "message",
      title: "还没有私信",
      copy: "别人发给你的私信会显示在这里。",
    };
  }

  function emptyStateHTML(meta, size = "") {
    return `<div class="message-empty ${size}">
      <div class="message-empty-icon">${icon(meta.icon)}</div>
      <h2>${esc(meta.title)}</h2>
      <p>${esc(meta.copy)}</p>
      ${
        meta.action
          ? `<button class="message-empty-action" type="button" data-empty-action="${meta.action}">${esc(meta.actionLabel)}</button>`
          : ""
      }
    </div>`;
  }

  // ---- 频道帖子更新 ----

  async function loadChannelUpdates(force = false) {
    if (disposed || channelUpdatesState === "loading") return;
    if (!force && channelUpdatesState === "ready") {
      if (mode === "channel") renderAll();
      return;
    }

    channelUpdatesState = "loading";
    channelUpdatesError = "";
    if (mode === "channel") renderAll();

    try {
      const data = await api.channels();
      const list = Array.isArray(data.channels)
        ? data.channels.filter((channel) => channel && channel.id)
        : [];

      let groupConversations = [];
      if (imClient && imState === "online") {
        try {
          groupConversations = await fetchImGroupConversations(imClient);
        } catch {
          groupConversations = [];
        }
      }
      const groupById = new Map(
        groupConversations.map((conversation) => [
          String(conversation.conversationId || conversation.id || ""),
          conversation,
        ]),
      );
      channelRooms = list.flatMap((channel) =>
        (Array.isArray(channel.chat_rooms) ? channel.chat_rooms : []).map((room) => ({
          ...room,
          channel_name: channel.name,
          channel_icon: channel.icon || "",
          conversation:
            groupById.get(String(room.im_id || "")) || null,
        })),
      );

      const results = await Promise.all(
        list.map(async (channel) => {
          try {
            const page = await api.channelPosts(channel.id);
            const post = Array.isArray(page.posts) ? page.posts[0] : null;
            return post ? { channel, post } : null;
          } catch {
            return null;
          }
        }),
      );
      if (disposed) return;
      channelUpdates = results
        .filter(Boolean)
        .sort(
          (a, b) =>
            new Date(b.post.created_at || 0) - new Date(a.post.created_at || 0),
        );
      channelUpdatesState = "ready";
      if (
        selectedChannelId &&
        !channelUpdates.some((entry) => entry.channel.id === selectedChannelId)
      ) {
        selectedChannelId = null;
      }
      if (
        selectedRoomId &&
        !channelRooms.some((room) => room.id === selectedRoomId)
      ) {
        selectedRoomId = null;
      }
      if (mode === "channel") renderAll();
    } catch (error) {
      if (disposed) return;
      channelUpdatesState = "error";
      channelUpdatesError = error.message || "频道更新加载失败。";
      if (mode === "channel") renderAll();
    }
  }

  function visibleChannelUpdates() {
    const needle = query.trim().toLowerCase();
    if (!needle) return channelUpdates;
    return channelUpdates.filter((entry) =>
      [
        entry.channel.name,
        entry.channel.description,
        entry.post.content,
        entry.post.user?.nickname,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }

  function roomReadKey(room) {
    return `channel-room:${room.id}`;
  }

  function roomUnread(room) {
    if (readIds.has(roomReadKey(room))) return 0;
    return Number(
      room.conversation?.unReadCount ??
        room.conversation?.unread_num ??
        0,
    ) || 0;
  }

  function roomLast(room) {
    return room.conversation?.lastMessage || null;
  }

  function roomSummary(room) {
    const last = roomLast(room);
    if (!last) return "还没有消息";
    const text = imSummary(last);
    return text || "还没有消息";
  }

  function roomTime(room) {
    const last = roomLast(room);
    const stamp =
      Number(last?.time) ||
      Number(room.conversation?.timestamp) ||
      0;
    return stamp ? messageListTime(new Date(stamp).toISOString()) : "";
  }

  function visibleChannelRooms() {
    const needle = query.trim().toLowerCase();
    if (!needle) return channelRooms;
    return channelRooms.filter((room) =>
      [room.name, room.channel_name, room.section, roomSummary(room)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }

  function renderChannelTopbar() {
    unreadSum.textContent =
      channelUpdatesState === "loading"
        ? "读取频道…"
        : `${channelRooms.length} 个聊天房 · ${channelUpdates.length} 个更新`;
    readAll.hidden = true;
    search.placeholder = "搜索文字聊天房 / 频道更新";
    searchClear.hidden = !query;
    filterButton.hidden = true;
  }

  function renderChannelList(resetScroll = false) {
    const previousScroll = list.scrollTop;
    filterButton.hidden = true;

    if (channelUpdatesState === "loading" || channelUpdatesState === "idle") {
      listCount.textContent = "频道 · 读取中";
      list.innerHTML = `<div class="channel-update-state"><span class="spinner"></span><span>正在读取频道聊天房…</span></div>`;
      return;
    }

    if (channelUpdatesState === "error") {
      listCount.textContent = "频道 · 加载失败";
      list.innerHTML = `<div class="channel-update-state">
        <strong>频道加载失败</strong>
        <span>${esc(channelUpdatesError)}</span>
        <button type="button" data-retry-channel>重试</button>
      </div>`;
      return;
    }

    const rooms = visibleChannelRooms();
    const updates = visibleChannelUpdates();
    listCount.textContent = query
      ? `找到 ${rooms.length + updates.length} 条频道内容`
      : `频道 · ${channelRooms.length} 个聊天房 · ${channelUpdates.length} 个更新`;

    if (!rooms.length && !updates.length) {
      list.innerHTML = `<div class="channel-update-state">
        <span>${icon("channel")}</span>
        <strong>${query.trim() ? "没有找到相关频道内容" : "频道还没有聊天房或更新"}</strong>
        <span>${query.trim() ? "换个关键词试试。" : "加入频道的文字聊天房和最新帖子会显示在这里。"}</span>
      </div>`;
      list.scrollTop = resetScroll ? 0 : previousScroll;
      return;
    }

    list.innerHTML = `${
      rooms.length
        ? `<div class="channel-inbox-heading"><span>文字聊天房</span><b>${rooms.length}</b></div>${rooms
            .map((room) => channelRoomRow(room))
            .join("")}`
        : ""
    }${
      updates.length
        ? `<div class="channel-inbox-heading"><span>频道更新</span><b>${updates.length}</b></div>${updates
            .map((entry) => channelUpdateRow(entry))
            .join("")}`
        : ""
    }`;
    list.scrollTop = resetScroll ? 0 : previousScroll;
  }

  function channelRoomRow(room) {
    const unread = roomUnread(room);
    const badge = unread > 99 ? "99+" : String(unread);
    return `<button class="message-item channel-room-item${selectedRoomId === room.id ? " selected" : ""}" type="button" data-channel-room="${esc(room.id)}" aria-current="${selectedRoomId === room.id}" role="listitem">
      ${avatarHTML({
        url: room.channel_icon || "",
        name: room.name,
        color: "beede7",
        size: 42,
        className: "message-avatar",
        label: `${room.name}的图标`,
      })}
      <span class="message-item-main">
        <span class="message-item-top"><strong>${esc(room.name)}</strong></span>
        <span class="message-item-summary"><span>${esc(roomSummary(room))}</span></span>
        <span class="message-item-meta">${icon("channel")}${esc(room.channel_name || "频道")} · ${esc(room.section || "聊天房")}</span>
      </span>
      <span class="message-item-tail">
        <time>${esc(roomTime(room))}</time>
        ${unread ? `<span class="message-unread">${badge}</span>` : ""}
      </span>
    </button>`;
  }

  function channelUpdateRow(entry) {
    const { channel, post } = entry;
    const author = post.user?.nickname || channel.name;
    const snippet = String(post.content || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 72);
    const time = messageListTime(
      new Date(post.created_at || Date.now()).toISOString(),
    );

    return `<button class="message-item channel-update-item${selectedChannelId === channel.id ? " selected" : ""}" type="button" data-channel-update="${esc(channel.id)}" aria-current="${selectedChannelId === channel.id}" role="listitem">
      ${avatarHTML({
        url: channel.icon || "",
        name: channel.name,
        color: "beede7",
        size: 42,
        className: "message-avatar",
        label: `${channel.name}的图标`,
      })}
      <span class="message-item-main">
        <span class="message-item-top"><strong>${esc(channel.name)}</strong></span>
        <span class="message-item-summary"><span>${esc(snippet || "频道有新帖子")}</span></span>
        <span class="message-item-meta">${icon("channel")}频道 · ${esc(author)}</span>
      </span>
      <span class="message-item-tail">
        <time>${esc(time)}</time>
      </span>
    </button>`;
  }

  function renderChannelDetail() {
    if (selectedRoomId) {
      const room = channelRooms.find((item) => item.id === selectedRoomId);
      if (room) {
        renderRoomDetail(room);
        return;
      }
      selectedRoomId = null;
    }

    const entry = channelUpdates.find(
      (item) => item.channel.id === selectedChannelId,
    );

    if (!entry) {
      selectedChannelId = null;
      detail.classList.remove("dm-mode");
      detail.innerHTML = channelUpdates.length || channelRooms.length
        ? channelUpdatesOverviewHTML()
        : emptyStateHTML(
            {
              icon: "channel",
              title: "频道还没有内容",
              copy: "加入频道的文字聊天房和帖子会显示在这里。",
            },
            "",
          );
      page.classList.remove("detail-open");
      return;
    }

    detail.classList.add("dm-mode");
    detail.innerHTML = channelUpdateDetailHTML(entry);
    page.classList.add("detail-open");
    requestAnimationFrame(() => {
      const thread = detail.querySelector("[data-channel-update-thread]");
      if (thread) thread.scrollTop = thread.scrollHeight;
    });
  }

  function roomConversation(room) {
    return {
      actor: {
        name: room.name,
        avatar_url: room.channel_icon || "",
        color: "beede7",
      },
    };
  }

  function renderRoomDetail(room) {
    const history = roomHistories.get(room.id);
    const loading = roomLoading.has(room.id);
    const failed = history && !Array.isArray(history);
    let body = "";

    if (loading) {
      body = `<div class="dm-thread-state"><span class="message-spinner"></span>正在读取聊天房…</div>`;
    } else if (failed) {
      body = `<div class="dm-thread-state"><strong>聊天房暂时无法读取</strong><span>请稍后重试，或确认账号仍在频道内。</span><button type="button" class="channel-inline-retry" data-retry-room>重试</button></div>`;
    } else if (!history) {
      body = `<div class="dm-thread-state"><strong>正在连接聊天房</strong><span>${imState === "online" ? "马上加载消息。" : "私信连接建立后会自动读取。"}</span></div>`;
    } else if (!history.length) {
      body = `<div class="dm-thread-state"><strong>还没有消息</strong><span>在文字聊天房发出第一条消息吧。</span></div>`;
    } else {
      const conversation = roomConversation(room);
      body = history.map((message) => dmBubbleHTML(message, conversation)).join("");
    }

    detail.classList.add("dm-mode");
    detail.innerHTML = `<div class="message-detail-wrap dm-detail-wrap channel-room-wrap">
      <header class="message-detail-head">
        <button class="message-back" type="button" data-room-back aria-label="返回频道">${icon("chevronLeft")}</button>
        ${avatarHTML({
          url: room.channel_icon || "",
          name: room.name,
          color: "beede7",
          size: 44,
          className: "message-avatar",
          label: `${room.name}的图标`,
        })}
        <div class="message-detail-who">
          <strong>${esc(room.name)}</strong>
          <span>${esc(room.channel_name || "频道")} · ${esc(room.section || "文字聊天房")}</span>
        </div>
        <span class="message-detail-readonly">${icon("message")}文字聊天房</span>
      </header>
      <div class="dm-thread channel-room-thread" data-room-thread>${body}</div>
      ${roomComposerHTML(room, Array.isArray(history))}
    </div>`;
    page.classList.add("detail-open");
    requestAnimationFrame(() => {
      const thread = detail.querySelector("[data-room-thread]");
      if (thread) thread.scrollTop = thread.scrollHeight;
    });
  }

  function roomComposerHTML(room, historyReady) {
    const online = imState === "online";
    const canWrite = online && historyReady && !sendingRoom;
    const draft = roomDrafts.get(room.id) || "";
    const placeholder = !online
      ? "私信未连接，暂时不能发言"
      : !historyReady
        ? "正在读取聊天房…"
        : `在 ${room.name} 说点什么…`;

    return `<form class="dm-composer" data-room-form>
      <textarea class="dm-input" data-room-input rows="1" maxlength="2000"
        placeholder="${esc(placeholder)}" aria-label="在文字聊天房发言" ${canWrite ? "" : "disabled"}>${esc(draft)}</textarea>
      <button class="dm-send" type="submit" data-room-send aria-label="发送" ${canWrite && draft.trim() ? "" : "disabled"}>
        ${icon("arrowUp")}
      </button>
    </form>`;
  }

  async function loadRoomHistory(room) {
    if (!imClient || roomLoading.has(room.id)) return;
    if (imState !== "online") {
      roomHistories.set(room.id, { error: true });
      if (selectedRoomId === room.id) renderChannelDetail();
      return;
    }
    roomLoading.add(room.id);
    renderChannelDetail();
    try {
      const messages = await fetchImGroupHistory(imClient, room.im_id);
      if (disposed) return;
      messages.sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));
      roomHistories.set(room.id, messages);
    } catch {
      if (disposed) return;
      roomHistories.set(room.id, { error: true });
    } finally {
      roomLoading.delete(room.id);
      if (!disposed && selectedRoomId === room.id) renderChannelDetail();
    }
  }

  function selectChannelRoom(id) {
    const room = channelRooms.find((item) => item.id === id);
    if (!room) return;
    selectedRoomId = id;
    selectedChannelId = null;
    mobileDetail = true;
    readIds.add(roomReadKey(room));
    saveReadIds();
    renderAll();
    detailPane.scrollTop = 0;
    if (!roomHistories.has(room.id)) loadRoomHistory(room);
  }

  async function sendRoomReply() {
    if (sendingRoom || !imClient || imState !== "online") return;
    const room = channelRooms.find((item) => item.id === selectedRoomId);
    if (!room) return;
    const history = roomHistories.get(room.id);
    const input = detail.querySelector("[data-room-input]");
    const text = (roomDrafts.get(room.id) ?? input?.value ?? "").trim();
    if (!text || !Array.isArray(history)) return;

    sendingRoom = true;
    const button = detail.querySelector("[data-room-send]");
    if (button) {
      button.disabled = true;
      button.innerHTML = `<span class="message-spinner"></span>`;
    }
    if (input) input.disabled = true;

    try {
      const ext = outgoingExt();
      const result = await imClient.send({
        id: newMessageId(),
        type: "txt",
        msg: text,
        to: room.im_id,
        chatType: "groupChat",
        ext,
      });
      const sent = normalizeSent(
        result,
        text,
        { peerId: room.im_id, actor: { name: room.name } },
        ext,
      );
      sent.chatType = "groupChat";
      sent.to = room.im_id;
      if (!history.some((message) => message.id === sent.id)) {
        history.push(sent);
        history.sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));
      }
      roomHistories.set(room.id, history);
      room.conversation = {
        ...(room.conversation || {}),
        lastMessage: sent,
        unReadCount: 0,
      };
      roomDrafts.delete(room.id);
      sendingRoom = false;
      renderAll();
      toast("已发送");
      focusRoomComposer();
    } catch {
      sendingRoom = false;
      renderChannelDetail();
      toast("消息发送失败，请稍后重试");
      focusRoomComposer();
    }
  }

  function focusRoomComposer() {
    requestAnimationFrame(() => {
      const input = detail.querySelector("[data-room-input]");
      if (!input || input.disabled) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  }

  function onRoomIncoming(room, message) {
    const groupId = String(message.to || message.toId || room.im_id);
    if (String(room.im_id) !== groupId) return;
    const history = roomHistories.get(room.id);
    if (Array.isArray(history)) {
      if (!history.some((item) => item.id === message.id)) {
        history.push(message);
        history.sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));
      }
      roomHistories.set(room.id, history);
    }
    room.conversation = {
      ...(room.conversation || {}),
      lastMessage: message,
      unReadCount:
        selectedRoomId === room.id
          ? 0
          : Number(room.conversation?.unReadCount || 0) + 1,
    };
    if (selectedRoomId === room.id) {
      readIds.add(roomReadKey(room));
      saveReadIds();
    }
    renderAll();
  }

  function channelUpdateDetailHTML(entry) {
    const { channel, post } = entry;
    return `<div class="message-detail-wrap dm-detail-wrap channel-update-wrap">
      <header class="message-detail-head">
        <button class="message-back" type="button" data-channel-update-back aria-label="返回频道更新">${icon("chevronLeft")}</button>
        ${avatarHTML({
          url: channel.icon || "",
          name: channel.name,
          color: "beede7",
          size: 44,
          className: "message-avatar",
          label: `${channel.name}的图标`,
        })}
        <div class="message-detail-who">
          <strong>${esc(channel.name)}</strong>
          <span>频道 · 最新帖子</span>
        </div>
        <time class="message-detail-time">${esc(fullDateTime(post.created_at))}</time>
        <span class="message-detail-readonly">${icon("lock")}只读同步</span>
      </header>
      <div class="dm-thread channel-update-thread" data-channel-update-thread>
        ${renderPostCard(post)}
      </div>
      <div class="dm-readonly">${icon("lock")}频道更新只读同步；进入频道可以查看分区和全部帖子。</div>
    </div>`;
  }

  function channelUpdatesOverviewHTML() {
    return `<div class="message-overview">
      <div class="message-overview-mark">${mark(48, "var(--brand-ink)", "var(--brand-paper)")}</div>
      <span class="message-overview-eyebrow">CHANNEL INBOX</span>
      <h2>频道</h2>
      <p>这里显示账号已加入频道的文字聊天房和最新帖子。聊天房直接使用官方群聊，不伪造消息。</p>
      <div class="message-stats">
        <div class="message-stat"><strong>${channelRooms.length}</strong><span>文字聊天房</span></div>
        <div class="message-stat accent"><strong>${channelUpdates.length}</strong><span>频道更新</span></div>
      </div>
      <div class="message-overview-hint">${icon("chevronRight")}从左侧选择聊天房或频道更新</div>
    </div>`;
  }

  function selectChannelUpdate(id) {
    const entry = channelUpdates.find((item) => item.channel.id === id);
    if (!entry) return;
    selectedChannelId = id;
    selectedRoomId = null;
    selectedId = null;
    mobileDetail = true;
    renderAll();
    detailPane.scrollTop = 0;
  }

  // ---- 事件 ----

  function onClick(event) {
    const image = event.target.closest("[data-dm-image]");
    if (image) {
      const url = image.dataset.dmImage;
      if (url) openImage(url);
      return;
    }

    const voice = event.target.closest("[data-voice-src]");
    if (voice) {
      toggleVoice(voice);
      return;
    }

    const modeButton = event.target.closest("[data-message-mode]");
    if (modeButton) {
      switchMode(modeButton.dataset.messageMode);
      return;
    }

    const readAllButton = event.target.closest("[data-read-all]");
    if (readAllButton) {
      if (mode === "channel") return;
      if (unreadCount() === 0) return;
      conversations = conversations.map((item) => {
        readIds.add(item.id);
        return { ...item, read: true, unreadCount: 0 };
      });
      saveReadIds();
      renderAll();
      toast("全部私信已标为已读");
      return;
    }

    const filter = event.target.closest("[data-unread-filter]");
    if (filter) {
      unreadOnly = !unreadOnly;
      selectedId = null;
      mobileDetail = false;
      renderAll({ resetScroll: true });
      return;
    }

    const clearButton = event.target.closest("[data-clear-search]");
    if (clearButton) {
      clearSearch();
      return;
    }

    const channelBack = event.target.closest("[data-channel-update-back]");
    if (channelBack) {
      selectedChannelId = null;
      mobileDetail = false;
      renderAll();
      return;
    }

    const retryChannel = event.target.closest("[data-retry-channel]");
    if (retryChannel) {
      loadChannelUpdates(true);
      return;
    }

    const roomBack = event.target.closest("[data-room-back]");
    if (roomBack) {
      selectedRoomId = null;
      mobileDetail = false;
      renderAll();
      return;
    }

    const retryRoom = event.target.closest("[data-retry-room]");
    if (retryRoom) {
      const room = channelRooms.find((item) => item.id === selectedRoomId);
      if (room) {
        roomHistories.delete(room.id);
        loadRoomHistory(room);
      }
      return;
    }

    const back = event.target.closest("[data-detail-back]");
    if (back) {
      selectedId = null;
      mobileDetail = false;
      renderAll();
      return;
    }

    const emptyAction = event.target.closest("[data-empty-action]");
    if (emptyAction) {
      if (emptyAction.dataset.emptyAction === "clear-search") {
        clearSearch();
      } else if (emptyAction.dataset.emptyAction === "show-all") {
        unreadOnly = false;
        renderAll({ resetScroll: true });
      }
      return;
    }

    const roomRow = event.target.closest("[data-channel-room]");
    if (roomRow) {
      selectChannelRoom(roomRow.dataset.channelRoom);
      return;
    }

    const channelRow = event.target.closest("[data-channel-update]");
    if (channelRow) {
      selectChannelUpdate(channelRow.dataset.channelUpdate);
      return;
    }

    if (mode !== "dm") return;
    const row = event.target.closest("[data-message-id]");
    if (row) selectItem(row.dataset.messageId);
  }

  function switchMode(next) {
    if (mode === next) return;
    mode = next;
    selectedId = null;
    selectedChannelId = null;
    selectedRoomId = null;
    mobileDetail = false;
    unreadOnly = false;
    renderAll({ resetScroll: true });
    if (next === "channel") loadChannelUpdates();
  }

  function onInput(event) {
    if (event.target.matches?.("[data-room-input]")) {
      const room = channelRooms.find((item) => item.id === selectedRoomId);
      if (!room) return;
      roomDrafts.set(room.id, event.target.value);
      const button = detail.querySelector("[data-room-send]");
      if (button) {
        button.disabled =
          !event.target.value.trim() || sendingRoom || imState !== "online";
      }
      event.target.style.height = "auto";
      event.target.style.height = `${event.target.scrollHeight}px`;
      return;
    }
    if (event.target.matches?.("[data-dm-input]")) {
      const item = conversations.find((entry) => entry.id === selectedId);
      if (item) drafts.set(item.id, event.target.value);
      const button = detail.querySelector("[data-dm-send]");
      if (button) {
        button.disabled =
          !event.target.value.trim() || sending || imState !== "online";
      }
      event.target.style.height = "auto";
      event.target.style.height = `${event.target.scrollHeight}px`;
      return;
    }
    if (event.target !== search) return;
    query = search.value;
    searchClear.hidden = !query;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      if (mode === "channel") {
        renderChannelList(true);
        renderChannelDetail();
        renderChannelTopbar();
        return;
      }
      reconcileSelection();
      renderList(true);
      renderDetail();
      renderTopbar();
    }, 90);
  }

  function onSubmit(event) {
    if (event.target.closest("[data-room-form]")) {
      event.preventDefault();
      sendRoomReply();
      return;
    }
    if (!event.target.closest("[data-dm-form]")) return;
    event.preventDefault();
    sendReply();
  }

  function selectItem(id) {
    const item = conversations.find((entry) => entry.id === id);
    if (!item) return;
    selectedId = id;
    mobileDetail = true;
    if (unreadOnly) unreadOnly = false;
    markRead(item);
    renderAll();
    detailPane.scrollTop = 0;
    if (!histories.has(id)) loadHistory(item);
  }

  function clearSearch() {
    query = "";
    search.value = "";
    searchClear.hidden = true;
    if (mode === "channel") {
      renderChannelList(true);
      renderChannelDetail();
      renderChannelTopbar();
      search.focus();
      return;
    }
    reconcileSelection();
    renderList(true);
    renderDetail();
    renderTopbar();
    search.focus();
  }
}
