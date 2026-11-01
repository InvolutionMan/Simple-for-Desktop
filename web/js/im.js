// 官方环信私信连接层：服务端下发短期 token，浏览器 SDK 拉会话 / 历史 / 发送文本。
// IM 密码只留在服务端，不进入浏览器。

import { api } from "./api.js?v=20261101bf";

let sdkPromise = null;

function safeColor(value) {
  const color = String(value || "").replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(color) ? color : "beede7";
}

function safeUrl(value) {
  const match = String(value || "").match(/^https?:\/\/[^\s"'<>]+/i);
  if (!match) return "";
  try {
    return new URL(match[0]).href;
  } catch {
    return "";
  }
}

function loadSdk() {
  if (window.websdk) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/easemob-chat.js?v=20261101bf";
    script.async = true;
    script.onload = () => {
      if (window.websdk) resolve();
      else reject(new Error("私信 SDK 加载失败。"));
    };
    script.onerror = () => reject(new Error("私信 SDK 加载失败。"));
    document.head.appendChild(script);
  });

  return sdkPromise;
}

export async function connectIm() {
  const info = await api.imSession();
  await loadSdk();

  const connection = new window.websdk.connection({
    appKey: info.app_key,
    url: "https://a1.easemob.com",
    isHttpDNS: true,
  });

  await connection.open({ user: info.user, accessToken: info.token });
  return { connection, userId: info.user };
}

export async function fetchImConversations(connection) {
  const response = await connection.getServerConversations({ pageSize: 100 });
  const list = response?.data?.conversations || [];
  return list.filter((item) => (item.conversationType || item.type) === "singleChat");
}

export async function fetchImHistory(connection, targetId) {
  const response = await connection.getHistoryMessages({
    targetId,
    chatType: "singleChat",
    pageSize: 50,
  });
  return Array.isArray(response?.messages) ? response.messages : [];
}

export async function fetchImGroupConversations(connection) {
  const response = await connection.getServerConversations({ pageSize: 100 });
  const list = response?.data?.conversations || [];
  return list.filter(
    (item) => (item.conversationType || item.type) === "groupChat",
  );
}

export async function fetchImGroupHistory(connection, targetId) {
  const response = await connection.getHistoryMessages({
    targetId,
    chatType: "groupChat",
    pageSize: 50,
  });
  return Array.isArray(response?.messages) ? response.messages : [];
}

export async function fetchChannelHistory(connection, targetId) {
  for (const chatType of ["chatRoom", "groupChat"]) {
    try {
      const response = await connection.getHistoryMessages({
        targetId,
        chatType,
        pageSize: 50,
      });
      const messages = Array.isArray(response?.messages) ? response.messages : [];
      if (messages.length) return messages;
    } catch {
      // 聊天室可能没有历史；继续试下一个类型。
    }
  }
  return [];
}

export function imSummary(message) {
  const type = String(message?.type || "");
  if (type === "txt") return String(message?.msg || "").trim() || "[空消息]";
  if (type === "img" || type === "image") return "[图片]";
  if (type === "audio" || type === "voice") return "[语音]";
  if (type === "video") return "[视频]";
  if (type === "file") return "[文件]";
  return "[消息]";
}

export function conversationToItem(conversation, readIds = new Set()) {
  const last = conversation.lastMessage || {};
  // 会话最后一条可能是自己发的：这时 ext 是「自己的资料」，不能拿来当对方昵称。
  const lastFromPeer = last.from === conversation.conversationId;
  const ext = lastFromPeer ? last.ext || {} : {};
  const id = `im:${conversation.conversationId}`;
  const unread = Number(conversation.unReadCount ?? conversation.unread_num ?? 0) || 0;
  const name =
    ext.nickname ||
    conversation.name ||
    (conversation.conversationId === "admin" ? "Simple 小助手" : "私信用户");
  const avatar = safeUrl(ext.avatarUrl);
  const time = Number(last.time) || Number(conversation.timestamp) || Date.now();

  return {
    id,
    source: "im",
    category: "dm",
    kind: "dm",
    icon: "message",
    title: "",
    summary: imSummary(last),
    content: "",
    createdAt: new Date(time).toISOString(),
    read: readIds.has(id) || unread === 0,
    unreadCount: readIds.has(id) ? 0 : unread,
    peerId: conversation.conversationId,
    actor: {
      name,
      avatar_url: avatar,
      color: safeColor(ext.avatarColor),
    },
    lastMessage: last,
  };
}

export function peerProfileFromMessages(messages, peerId, fallback = {}) {
  const peer = [...(messages || [])]
    .reverse()
    .find((message) => message?.from === peerId && message?.ext);
  const ext = peer?.ext || {};
  const fallbackName =
    peerId === "admin" ? "Simple 小助手" : fallback.name || "私信用户";
  return {
    name: ext.nickname || fallbackName,
    avatar_url: safeUrl(ext.avatarUrl) || fallback.avatar_url || "",
    color: safeColor(ext.avatarColor || fallback.color),
  };
}

export function imAvatarUrl(message, fallback = "") {
  return safeUrl(message?.ext?.avatarUrl || fallback);
}
