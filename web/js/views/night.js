// 夜市：一次拉全量（服务端已翻页聚合），留页时每 20 秒刷一次人数。

import { api } from "../api.js?v=20261101bf";
import { esc, icon, openModal, toast } from "../ui.js?v=20261101bf";

export function mountNight(root, { onOpenRoom }) {
  let channels = [];
  const locals = [];
  let timer = null;
  let disposed = false;
  let isOpen = true;

  root.innerHTML = `
    <div class="night">
      <div class="night-inner">
        <header class="night-head">
          <div>
            <div class="eyebrow">${icon("moonStars")}NIGHT MARKET</div>
            <h1 class="night-title">夜市</h1>
            <p class="night-sub">限时聊天室<span class="dot">·</span>20:00-02:00</p>
          </div>
          <button class="ghost-button" type="button" data-create>
            ${icon("plus")}创建聊天室
          </button>
        </header>
        <div class="rule"></div>
        <div class="night-list" data-list>
          <div class="night-loading"><span class="spinner"></span></div>
        </div>
      </div>
    </div>`;

  const list = root.querySelector("[data-list]");
  const sub = root.querySelector(".night-sub");
  const createButton = root.querySelector("[data-create]");

  createButton.addEventListener("click", openCreate);
  list.addEventListener("click", (event) => {
    const row = event.target.closest("[data-room]");
    if (!row) return;
    if (!isOpen) {
      toast("现在不是营业时间，夜市每天 20:00-02:00 开放。");
      return;
    }
    const channel = [...locals, ...channels].find((entry) => entry.id === row.dataset.room);
    if (channel) onOpenRoom(channel);
  });

  const onVisibility = () => {
    if (document.visibilityState === "visible") refreshCounts();
  };
  document.addEventListener("visibilitychange", onVisibility);
  timer = setInterval(refreshCounts, 20000);

  load();

  return () => {
    disposed = true;
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };

  // ---- 数据 ----

  async function load() {
    try {
      const data = await api.nightMarkets();
      isOpen = data.is_open !== false;
      channels = Array.isArray(data.channels) ? data.channels.filter((item) => item && item.id) : [];
      updateStatus();
      render();
    } catch (error) {
      if (disposed) return;
      list.innerHTML = `<div class="night-error">${esc(error.message || "夜市加载失败，请稍后再试。")}</div>`;
    }
  }

  function refreshCounts() {
    if (disposed || !isOpen || document.visibilityState !== "visible") return;
    api
      .nightCounts()
      .then((data) => {
        const counts = data.counts || {};
        channels = channels.map((channel) =>
          counts[channel.id] !== undefined ? { ...channel, count: counts[channel.id] } : channel,
        );
        for (const row of list.querySelectorAll("[data-room]")) {
          const value = counts[row.dataset.room];
          if (value === undefined) continue;
          const label = row.querySelector("[data-count]");
          if (label) label.textContent = String(value);
        }
      })
      .catch(() => {});
  }

  function updateStatus() {
    sub.innerHTML = isOpen
      ? `营业中<span class="dot">·</span>20:00-02:00`
      : `已打烊<span class="dot">·</span>20:00-02:00`;
    createButton.disabled = !isOpen;
  }

  function render() {
    const all = [...locals, ...channels];
    if (!all.length) {
      list.innerHTML = isOpen
        ? `<div class="night-error">今晚还没有开市的房间。</div>`
        : `<div class="night-closed-note">${icon("lock")}<span>现在不是营业时间，今晚还没有可见的夜市房间。</span></div>`;
      return;
    }

    // 打烊时仍展示已经开过的房间名称，但按钮禁用，不能点进去。
    const notice = isOpen
      ? ""
      : `<div class="night-closed-note">${icon("lock")}<span>夜市已打烊，只能查看房间名；每天 20:00-02:00 开放。</span></div>`;
    list.innerHTML = notice + all.map(rowHTML).join("");
  }

  function rowHTML(channel) {
    const closed = !isOpen;
    const label = closed
      ? `夜市已打烊，不能进入 ${esc(channel.name)}`
      : `进入聊天室 ${esc(channel.name)}，${Number(channel.count || 0)} 人在线`;
    return `<button class="channel-row" type="button" data-room="${esc(channel.id)}"
      aria-label="${label}" ${closed ? 'disabled aria-disabled="true"' : ""}>
      <span class="room-bars" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="channel-name">${esc(channel.name || "未命名房间")}</span>
      <span class="channel-count">${icon("user")}<span data-count>${Number(channel.count || 0)}</span></span>
      <span class="channel-chevron">${icon(closed ? "lock" : "chevronRight")}</span>
    </button>`;
  }

  function openCreate() {
    if (!isOpen) {
      toast("现在不是营业时间，夜市每天 20:00-02:00 开放。");
      return;
    }
    const modal = openModal(
      `
      <div class="panel-head">
        <h2 class="panel-title">创建聊天室</h2>
        <button class="panel-close" type="button" data-close>关闭</button>
      </div>
      <label class="dialog-label" for="create-room-name">聊天室名称</label>
      <input class="dialog-input" id="create-room-name" maxlength="24" placeholder="今晚想聊点什么">
      <p class="dialog-hint">${icon("clock")}限时 20:00-02:00，创建后仅在本页预览。</p>
      <div class="dialog-actions">
        <button class="secondary-button" type="button" data-close>取消</button>
        <button class="primary-button create-confirm" type="button" data-confirm>创建</button>
      </div>`,
      { panelClass: "create-panel" },
    );

    const input = modal.panel.querySelector("input");
    const confirm = modal.panel.querySelector("[data-confirm]");

    const create = () => {
      const name = input.value.trim();
      if (!name) {
        input.focus();
        return;
      }
      locals.unshift({
        id: `local-${Date.now()}`,
        name,
        count: 0,
        local: true,
        root_name: "夜市",
      });
      modal.close();
      render();
      toast("已创建（本地预览，服务端创建接口还没接入）。");
    };

    confirm.addEventListener("click", create);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        create();
      }
    });
  }
}
