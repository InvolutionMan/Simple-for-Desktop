// 所有请求都走同源后端；浏览器只带 HttpOnly 会话 Cookie，拿不到官方 token。

export class ApiError extends Error {
  constructor(message, { status = 0, code = "", rateLimited = false, retryAfter = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.rateLimited = rateLimited;
    this.retryAfter = retryAfter;
  }
}

async function request(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    throw new ApiError("网络连接失败，请检查网络后重试。", { code: "network" });
  }

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : null;

  if (!response.ok) {
    const error = new ApiError(data?.error || "服务暂时不可用，请稍后再试。", {
      status: response.status,
      code: data?.code || "",
      rateLimited: Boolean(data?.rate_limited),
      retryAfter: data?.retry_after ?? null,
    });
    if (response.status === 401 && error.code === "session_expired") {
      window.dispatchEvent(new CustomEvent("simple:session-expired"));
    }
    throw error;
  }

  return data ?? {};
}

function query(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, value);
    }
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const api = {
  health: () => request("/api/health"),
  session: () => request("/api/auth/session"),
  sendCode: (phone) => request("/api/auth/code", { method: "POST", body: { phone } }),
  login: (phone, code) => request("/api/auth/login", { method: "POST", body: { phone, code } }),
  logout: () => request("/api/auth/logout", { method: "POST", body: {} }),
  me: () => request("/api/me"),

  feed: (tab, lastId) => request(`/api/feed${query({ tab, last_id: lastId })}`),
  profilePosts: (lastId) => request(`/api/profile/posts${query({ last_id: lastId })}`),
  channels: () => request("/api/channels"),
  channelPosts: (id, lastId) =>
    request(`/api/channels/${encodeURIComponent(id)}/posts${query({ last_id: lastId })}`),
  comments: (postId, lastId) =>
    request(`/api/posts/${encodeURIComponent(postId)}/comments${query({ last_id: lastId })}`),
  addComment: (postId, content) =>
    request(`/api/posts/${encodeURIComponent(postId)}/comments`, {
      method: "POST",
      body: { content },
    }),
  replies: (commentId) => request(`/api/comments/${encodeURIComponent(commentId)}/replies`),
  addReply: (commentId, content) =>
    request(`/api/comments/${encodeURIComponent(commentId)}/replies`, {
      method: "POST",
      body: { content },
    }),
  votePost: (postId, liked) =>
    request("/api/votes", { method: "POST", body: { post_id: postId, liked } }),
  voteComment: (commentId, liked) =>
    request("/api/comment-votes", { method: "POST", body: { comment_id: commentId, liked } }),

  nightMarkets: () => request("/api/night-markets"),
  nightCounts: () => request("/api/night-markets/counts"),

  joinRoom: (roomId) =>
    request(`/api/rooms/${encodeURIComponent(roomId)}/join`, { method: "POST", body: {} }),
  roomState: (roomId) => request(`/api/rooms/${encodeURIComponent(roomId)}/state`),
  leaveRoom: (roomId) =>
    request(`/api/rooms/${encodeURIComponent(roomId)}/leave`, { method: "POST", body: {} }),

  imSession: () => request("/api/im/session", { method: "POST", body: {} }),

  devSession: (token) =>
    request("/api/dev/session", { method: "POST", body: { token } }),
};
