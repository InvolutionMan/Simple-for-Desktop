// 房间：麦位、人数、退房。语音与聊天桥未接入，消息只在本机预览。

import { api } from "../api.js?v=20261101bf";
import {
  esc,
  avatarHTML,
  icon,
  toast,
} from "../ui.js?v=20261101bf";
import { clockText, initial, normalizeColor } from "../format.js?v=20261101bf";
import { rememberChannel } from "../channels-store.js?v=20261101bf";

export function mountRoom(root, { channel, user, onExit }) {
  const roomId = channel.id;
  const isLocal = Boolean(channel.local) || !roomId;

  const state = {
    count: Number(channel.count || 0),
    seats: [],
    seatsOk: true,
    seatsError: "",
    pollError: "",
    showingSeats: true,
    showingPeople: false,
    micOn: false,
    messages: [],
    attachment: null,
    timer: null,
    disposed: false,
    left: false,
  };

  root.innerHTML = `
    <div class="room">
      <div class="room-inner">
        <header class="room-head">
          <div class="room-title-row">
            <h1 class="room-title">${esc(channel.name || "聊天室")}</h1>
            <button class="exit-button" type="button" data-exit>
              ${icon("logout")}退出房间
            </button>
          </div>
          ${channel.root_name ? `<p class="room-root">所属频道：${esc(channel.root_name)}</p>` : ""}
          <div class="room-counts">
            <button class="count-button" type="button" data-toggle-people aria-expanded="false">
              ${icon("users")}在房 <span data-count>${state.count}</span> 人${icon("chevronRight", "chevron")}
            </button>
            <button class="count-button open" type="button" data-toggle-seats aria-expanded="true">
              ${icon("mic")}上麦 <span data-seat-count>0</span> 人${icon("chevronRight", "chevron")}
            </button>
          </div>
        </header>
        <div class="rule"></div>
        <div class="seat-board" data-seats></div>
        <p class="seats-note" data-seats-note hidden></p>
        <div class="room-people" data-people hidden></div>
        <div class="rule"></div>
        <div class="room-stage" data-stage></div>
        <div class="composer">
          <div class="voice-controls">
            <button class="mic-button" type="button" data-mic>${icon("mic")}上麦</button>
            <span class="mic-status" data-mic-status>观众模式</span>
          </div>
          <div data-attachment></div>
          <div class="composer-bar">
            <button class="attach-button" type="button" data-attach aria-label="添加照片或视频">${icon("photo")}</button>
            <input class="message-input" data-input type="text" maxlength="500" placeholder="说点什么…" aria-label="消息">
            <button class="send-icon" type="button" data-send disabled aria-label="发送">${icon("arrowUp")}</button>
          </div>
          <input type="file" accept="image/*,video/*" hidden data-file>
          <p class="composer-note">网页版还没接环信消息桥，发送的内容只在本机显示；语音（声网）同样只做界面预演。</p>
        </div>
      </div>
    </div>`;

  const seatsBoard = root.querySelector("[data-seats]");
  const seatsNote = root.querySelector("[data-seats-note]");
  const people = root.querySelector("[data-people]");
  const stage = root.querySelector("[data-stage]");
  const input = root.querySelector("[data-input]");
  const sendButton = root.querySelector("[data-send]");
  const attachButton = root.querySelector("[data-attach]");
  const fileInput = root.querySelector("[data-file]");
  const attachmentHost = root.querySelector("[data-attachment]");
  const micButton = root.querySelector("[data-mic]");
  const micStatus = root.querySelector("[data-mic-status]");
  const seatsToggle = root.querySelector("[data-toggle-seats]");
  const peopleToggle = root.querySelector("[data-toggle-people]");
  const countLabel = root.querySelector("[data-count]");
  const seatCountLabel = root.querySelector("[data-seat-count]");

  renderSeats();
  renderPeople();
  renderMessages();
  updateSend();

  root.querySelector("[data-exit]").addEventListener("click", exit);
  seatsToggle.addEventListener("click", () => {
    state.showingSeats = !state.showingSeats;
    seatsToggle.classList.toggle("open", state.showingSeats);
    seatsToggle.setAttribute("aria-expanded", String(state.showingSeats));
    seatsBoard.hidden = !state.showingSeats;
  });
  peopleToggle.addEventListener("click", () => {
    state.showingPeople = !state.showingPeople;
    peopleToggle.classList.toggle("open", state.showingPeople);
    peopleToggle.setAttribute("aria-expanded", String(state.showingPeople));
    people.hidden = !state.showingPeople;
  });

  micButton.addEventListener("click", toggleMic);
  input.addEventListener("input", updateSend);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      sendMessage();
    }
  });
  sendButton.addEventListener("click", sendMessage);
  attachButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", pickAttachment);

  stage.addEventListener("click", (event) => {
    const image = event.target.closest("[data-message-image]");
    if (image) {
      window.open(image.dataset.messageImage, "_blank", "noopener");
    }
  });

  const beacon = () => {
    if (isLocal || state.left) return;
    navigator.sendBeacon(`/api/rooms/${encodeURIComponent(roomId)}/leave`);
  };
  window.addEventListener("pagehide", beacon);

  enter();

  return () => {
    state.disposed = true;
    clearInterval(state.timer);
    window.removeEventListener("pagehide", beacon);
    // 从侧栏或浏览器后退离开时也算退房，别把麦位记录留在房间里。
    beacon();
  };

  // ---- 房间数据 ----

  async function enter() {
    if (isLocal) {
      state.seatsOk = true;
      seatsNote.hidden = false;
      seatsNote.textContent = "本地预览房间：没有服务端房间 id，麦位与人数不可用。";
      return;
    }

    // 直链 / 旧标签页也要先看夜市状态：打烊时不要先挂出房间 UI 再报错。
    try {
      const night = await api.nightMarkets();
      if (night.is_open === false) {
        showClosed("现在不是营业时间，夜市每天 20:00-02:00 开放。");
        return;
      }
    } catch {
      // 网络抖动时继续走 join，让后续错误自己说话。
    }

    try {
      await api.joinRoom(roomId);
      rememberChannel(user?.id, channel);
    } catch (error) {
      if (error.status === 401) return;
      if (isClosedMessage(error.message)) {
        showClosed(error.message);
        return;
      }
      state.pollError = error.message;
    }

    await poll();
    state.timer = setInterval(() => {
      if (document.visibilityState === "visible") poll();
    }, 4000);
  }

  function isClosedMessage(message) {
    return /营业时间|打烊|not\s*(open|business)|closed/i.test(String(message || ""));
  }

  function showClosed(message) {
    state.left = true;
    clearInterval(state.timer);
    window.removeEventListener("pagehide", beacon);
    root.innerHTML = `<div class="room-closed">
      <span class="room-closed-icon">${icon("moonStars")}</span>
      <h2>夜市已打烊</h2>
      <p>${esc(message || "现在不是营业时间，夜市每天 20:00-02:00 开放。")}</p>
      <button class="primary-button" type="button" data-closed-exit>返回夜市</button>
    </div>`;
    root.querySelector("[data-closed-exit]").addEventListener("click", onExit);
  }

  async function poll() {
    if (state.disposed) return;
    try {
      const data = await api.roomState(roomId);
      state.count = Number(data.count || 0);
      state.seats = Array.isArray(data.seats) ? data.seats : [];
      state.seatsOk = data.seats_ok !== false;
      state.seatsError = data.seats_error || "";
      state.pollError = "";
      countLabel.textContent = String(state.count);
      renderSeats();
      renderPeople();
    } catch (error) {
      if (error.status === 401) return;
      if (isClosedMessage(error.message)) {
        showClosed(error.message);
        return;
      }
      state.pollError = error.message || "房间信息刷新失败。";
      renderNote();
    }
  }

  // ---- 渲染 ----

  function seatHTML(seat) {
    const tint = normalizeColor(seat.avatar_color);
    const ring = seat.avatar_color ? tint : "var(--line)";
    const name = seat.nickname || "匿名用户";
    return `<div class="seat" title="${esc(name)}">
      <div class="seat-avatar" style="--seat-tint:${tint};--seat-ring:${ring}">
        <span class="seat-initial">${esc(initial(name))}</span>
        ${
          seat.avatar_url
            ? `<img src="${esc(seat.avatar_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
            : ""
        }
        ${seat.is_muted ? `<span class="mic-badge">${icon("micOff")}</span>` : ""}
      </div>
      <div class="seat-name">${esc(name)}</div>
    </div>`;
  }

  function renderSeats() {
    seatCountLabel.textContent = state.seatsOk ? String(state.seats.length) : "—";
    seatsBoard.hidden = !state.showingSeats;

    if (state.seatsOk && state.seats.length === 0) {
      seatsBoard.innerHTML = `<div class="seat-empty">${icon("micOff")}还没有人上麦</div>`;
    } else if (!state.seatsOk && state.seats.length === 0) {
      seatsBoard.innerHTML = `<div class="seat-empty" title="${esc(state.seatsError || "")}">${icon("micOff")}这个房间暂时看不到麦位</div>`;
    } else {
      seatsBoard.innerHTML = state.seats.map(seatHTML).join("");
    }

    renderNote();
  }

  function renderNote() {
    // 麦位不可见时由麦位区自己说明；这里只报轮询失败，避免同一句话出现两遍。
    const text = state.pollError;
    seatsNote.hidden = !text;
    seatsNote.textContent = text || "";
  }

  function renderPeople() {
    people.hidden = !state.showingPeople;
    if (!state.seats.length) {
      people.innerHTML = "";
      return;
    }

    people.innerHTML = state.seats
      .map(
        (seat) => `<div class="people-chip">
          ${avatarHTML({
            url: seat.avatar_url,
            name: seat.nickname,
            color: seat.avatar_color,
            size: 26,
          })}
          <span class="people-name">${esc(seat.nickname || "匿名用户")}</span>
        </div>`,
      )
      .join("");
  }

  function renderMessages() {
    if (!state.messages.length) {
      stage.innerHTML = `<div class="room-empty">
        <div class="state-badge">${icon("comment")}</div>
        <h2 class="room-empty-title">还没有人说话</h2>
        <p class="room-empty-copy">说点什么，让今晚的聊天室热闹起来。</p>
      </div>`;
      return;
    }

    stage.innerHTML = `<div class="messages" data-messages>${state.messages
      .map(messageHTML)
      .join("")}</div>`;
    const box = stage.querySelector("[data-messages]");
    if (box) box.scrollTop = box.scrollHeight;
  }

  function messageHTML(message) {
    const attachment = message.attachment
      ? message.attachment.kind === "video"
        ? `<video class="message-media" src="${esc(message.attachment.url)}" controls></video>`
        : `<img class="message-media" src="${esc(message.attachment.url)}" alt="${esc(message.attachment.name)}">`
      : "";

    return `<div class="message">
      <div class="message-main">
        <span class="message-author">${esc(user?.nickname || user?.phone || "我")}</span>
        ${attachment}
        ${message.text ? `<div class="message-bubble">${esc(message.text)}</div>` : ""}
        <span class="message-time">${esc(message.time)}</span>
      </div>
      ${avatarHTML({
        url: user?.avatar_url,
        name: user?.nickname || user?.phone,
        color: "beede7",
        size: 30,
      })}
    </div>`;
  }

  function renderAttachment() {
    if (!state.attachment) {
      attachmentHost.innerHTML = "";
      return;
    }

    const isVideo = state.attachment.kind === "video";
    attachmentHost.innerHTML = `<div class="attach-preview">
      ${isVideo ? icon("film") : `<img src="${esc(state.attachment.url)}" alt="">`}
      <span>${esc(state.attachment.name)}</span>
      <button type="button" data-remove-attach aria-label="移除附件">${icon("close")}</button>
    </div>`;

    attachmentHost.querySelector("[data-remove-attach]").addEventListener("click", () => {
      URL.revokeObjectURL(state.attachment.url);
      state.attachment = null;
      renderAttachment();
      updateSend();
    });
  }

  // ---- 交互 ----

  function updateSend() {
    sendButton.disabled = !input.value.trim() && !state.attachment;
  }

  function sendMessage() {
    const text = input.value.trim();
    if (!text && !state.attachment) return;

    state.messages.push({
      text,
      time: clockText(),
      attachment: state.attachment,
    });
    input.value = "";
    state.attachment = null;
    renderAttachment();
    renderMessages();
    updateSend();
    input.focus();
  }

  function pickAttachment() {
    const file = fileInput.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    state.attachment = {
      url,
      kind: file.type.startsWith("video") ? "video" : "image",
      name: file.name,
    };
    fileInput.value = "";
    renderAttachment();
    updateSend();
  }

  function toggleMic() {
    state.micOn = !state.micOn;
    micButton.classList.toggle("on", state.micOn);
    micButton.innerHTML = state.micOn ? `${icon("mic")}下麦` : `${icon("mic")}上麦`;
    micStatus.textContent = state.micOn ? "麦克风已开启（界面预演）" : "观众模式";
    if (state.micOn) {
      toast("声网语音还没接入，这里只做界面预演。");
    }
  }

  async function exit() {
    if (state.disposed) return;
    state.disposed = true;
    state.left = true;
    clearInterval(state.timer);
    window.removeEventListener("pagehide", beacon);

    if (!isLocal) {
      try {
        await api.leaveRoom(roomId);
      } catch {
        // 退房失败也照常离开，别把人困在房间里。
      }
    }
    onExit();
  }
}
