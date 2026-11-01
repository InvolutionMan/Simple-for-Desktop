// 时间与文本的小工具，逻辑对齐桌面版 RelativeTime。

export function parseTime(raw) {
  if (raw === null || raw === undefined || raw === "") return null;

  if (typeof raw === "number" || (typeof raw === "string" && /^\d{9,13}$/.test(raw.trim()))) {
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    return new Date(value > 1e12 ? value : value * 1000);
  }

  if (typeof raw !== "string") return null;
  let text = raw.trim();
  if (!text) return null;

  // 服务端给 6 位微秒，Date 只认 3 位，先截断。
  text = text.replace(/(\.\d{3})\d+/, "$1");
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function relativeTime(raw) {
  const date = parseTime(raw);
  if (!date) return "";

  const seconds = (Date.now() - date.getTime()) / 1000;
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  if (seconds < 86400 * 2) return "昨天";
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function postTime(raw, now = new Date()) {
  const date = parseTime(raw);
  if (!date) return "";

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const time = `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;

  if (sameDay) return time;

  const datePart =
    date.getFullYear() === now.getFullYear()
      ? `${date.getMonth() + 1}月${date.getDate()}日`
      : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;

  return `${datePart} ${time}`;
}

export function messageListTime(raw) {
  const date = parseTime(raw);
  if (!date) return "";

  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes(),
    ).padStart(2, "0")}`;
  }

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  ) {
    return "昨天";
  }

  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

export function fullDateTime(raw) {
  const date = parseTime(raw);
  if (!date) return "";
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${String(
    date.getHours(),
  ).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function clockText(date = new Date()) {
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function initial(name) {
  const text = String(name || "").trim();
  return text ? Array.from(text)[0] : "·";
}

export function normalizeColor(raw, fallback = "#E6F7F6") {
  const text = String(raw || "")
    .trim()
    .replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(text) ? `#${text.toLowerCase()}` : fallback;
}

export function maskPhone(phone) {
  const text = String(phone || "");
  if (text.length === 11 && /^\d+$/.test(text)) {
    return `${text.slice(0, 3)} **** ${text.slice(7)}`;
  }
  return text;
}

export function plural(count, unit) {
  return `${count} ${unit}`;
}
