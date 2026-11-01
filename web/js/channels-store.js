// 已加入的夜市频道 + 频道消息的本地缓存。
// 频道消息来自环信聊天室；官方不保留历史时，只显示网页连接后收到的新消息。

const CHANNELS_PREFIX = "simple.channels.v2.";
const MESSAGES_PREFIX = "simple.channel.messages.v2.";
const READ_PREFIX = "simple.channel.read.v2.";

function key(prefix, accountId) {
  return `${prefix}${accountId || "local"}`;
}

function readJson(storageKey, fallback) {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(storageKey, value) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // 无痕模式只影响本次页面。
  }
}

export function loadJoinedChannels(accountId = "local") {
  const list = readJson(key(CHANNELS_PREFIX, accountId), []);
  return Array.isArray(list)
    ? list.filter((item) => item && item.id && item.im_id)
    : [];
}

export function rememberChannel(accountId, channel) {
  if (!channel?.id || !channel?.im_id) return;
  const list = loadJoinedChannels(accountId);
  const next = {
    id: String(channel.id),
    im_id: String(channel.im_id),
    name: String(channel.name || "夜市频道"),
    count: Number(channel.count || 0),
    joinedAt: Date.now(),
  };
  const index = list.findIndex((item) => item.id === next.id);
  if (index >= 0) list[index] = { ...list[index], ...next };
  else list.unshift(next);
  writeJson(key(CHANNELS_PREFIX, accountId), list.slice(0, 20));
}

export function loadChannelMessages(accountId, channelId) {
  const all = readJson(key(MESSAGES_PREFIX, accountId), {});
  const list = all?.[channelId];
  return Array.isArray(list) ? list : [];
}

export function saveChannelMessages(accountId, channelId, messages) {
  if (!channelId || !Array.isArray(messages)) return;
  const all = readJson(key(MESSAGES_PREFIX, accountId), {});
  all[channelId] = messages.slice(-200);
  writeJson(key(MESSAGES_PREFIX, accountId), all);
}

export function loadChannelRead(accountId = "local") {
  const value = readJson(key(READ_PREFIX, accountId), {});
  return value && typeof value === "object" ? value : {};
}

export function markChannelRead(accountId, channelId) {
  const all = loadChannelRead(accountId);
  all[channelId] = Date.now();
  writeJson(key(READ_PREFIX, accountId), all);
  return all;
}
