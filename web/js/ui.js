// 无框架的小工具：图标、头像、弹层、toast。所有用户内容都走 esc()。

import { initial, normalizeColor } from "./format.js?v=20261101bf";

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

const ICONS = {
  home: '<path d="M4 10.6 12 4l8 6.6V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M9.5 21v-6h5v6"/>',
  message:
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  channel: '<path d="M9.5 3 7 21M17 3l-2.5 18M4 9h16M3 15h16"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  moonStars:
    '<path d="M20 14.2A8 8 0 0 1 9.8 4a7.4 7.4 0 1 0 10.2 10.2z"/><path d="M17.5 3v2.6M16.2 4.3h2.6"/>',
  envelope:
    '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
  settings:
    '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  heart:
    '<path d="M12 20.3S4.8 15.9 3 11.7A4.9 4.9 0 0 1 12 6.3a4.9 4.9 0 0 1 9 5.4c-1.8 4.2-9 8.6-9 8.6z"/>',
  heartFilled:
    '<path d="M12 20.3S4.8 15.9 3 11.7A4.9 4.9 0 0 1 12 6.3a4.9 4.9 0 0 1 9 5.4c-1.8 4.2-9 8.6-9 8.6z" fill="currentColor"/>',
  comment:
    '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  users:
    '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c.6-3.4 2.8-5.2 5.5-5.2S14 16.6 14.5 20"/><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.8c1.6.7 2.6 2.4 3 5.2"/>',
  user: '<circle cx="12" cy="8" r="3.4"/><path d="M5 20c.7-3.7 3.3-5.6 7-5.6s6.3 1.9 7 5.6"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/>',
  micOff:
    '<path d="M9 5a3 3 0 0 1 6 0v5M9 9.5V11a3 3 0 0 0 4.5 2.6"/><path d="M5.5 11a6.5 6.5 0 0 0 9 6M12 17.5V21M9 21h6"/><path d="M3 3l18 18"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 6 3.5-6 3.5z"/>',
  photo:
    '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m4 18 5.5-5 4.5 4 3-2.5 3 3.5"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7.5 4v16M16.5 4v16M3 9h4.5M3 15h4.5M16.5 9H21M16.5 15H21"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  logout:
    '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 8l-4 4 4 4M6 12h9"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  edit: '<path d="M4 20h4l10.2-10.2a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  music:
    '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  external:
    '<path d="M14 4h6v6M20 4l-8 8"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  share:
    '<path d="M12 16V4M8 8l4-4 4 4"/><path d="M4 14v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
  ellipsis:
    '<circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  copy:
    '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  eyeOff:
    '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.4 2.5-2.8 3.8"/><path d="M6.4 6.4C4.3 7.9 2.8 10 2 12c1 2.5 5 7 10 7 1.8 0 3.5-.5 5-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  emoji:
    '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><circle cx="9" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r=".9" fill="currentColor" stroke="none"/>',
  link:
    '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-2 2"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l2-2"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.4"/><path d="M20 5v6h-6"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  fold: '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>',
  userX: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  checkCheck: '<path d="m2 13 4 4L14 7"/><path d="m10 17 1 1L22 7"/>',
  inbox: '<path d="M4 5h16l1.5 9H16l-1.5 3h-5L8 14H2.5z"/><path d="M4 5 2.5 14v5h19v-5"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14z"/><path d="M11.6 16.8a3 3 0 0 1-5.8-1.6"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6"/><path d="M10 11v6M14 11v6"/>',
  filter: '<path d="M4 5h16l-6 7v5l-4 2v-7z"/>',
};

export function icon(name, className = "") {
  const body = ICONS[name] ?? "";
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function mark(size = 24, circle = "var(--brand-ink)", bars = "var(--brand-paper)") {
  const heights = [0.3, 0.54, 0.8, 0.52, 0.28];
  const barWidth = 24 * 0.072;
  const gap = 24 * 0.056;
  const total = barWidth * heights.length + gap * (heights.length - 1);
  let x = (24 - total) / 2;
  const rects = heights
    .map((height) => {
      const barHeight = 24 * height;
      const y = (24 - barHeight) / 2;
      const rect = `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" rx="${(barWidth / 2).toFixed(2)}" fill="${bars}"/>`;
      x += barWidth + gap;
      return rect;
    })
    .join("");

  return `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><g transform="rotate(8 12 12)"><circle cx="12" cy="12" r="12" fill="${circle}"/>${rects}</g></svg>`;
}

export function avatarHTML({
  url,
  name,
  color,
  size = 46,
  className = "",
  label = "",
} = {}) {
  const tint = normalizeColor(color);
  const fontSize = Math.max(9, Math.round(size * 0.35));
  const image = url
    ? `<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
    : "";
  const accessible = label ? `aria-label="${esc(label)}" role="img"` : 'aria-hidden="true"';
  return `<span class="avatar ${className}" style="--tint:${tint};width:${size}px;height:${size}px;font-size:${fontSize}px" ${accessible}><span class="avatar-fallback">${esc(initial(name))}</span>${image}</span>`;
}

export function spinnerHTML(label = "") {
  return `<div class="loading-block"><span class="spinner"></span>${label ? `<span>${esc(label)}</span>` : ""}</div>`;
}

export function stateHTML({
  title,
  copy,
  actionLabel = "",
  action = "retry",
  badge = "mark",
  badgeIcon = "refresh",
} = {}) {
  const badgeContent =
    badge === "mark"
      ? mark(30, "var(--brand-ink)", "var(--brand-paper)")
      : icon(badgeIcon, "state-icon");
  return `<div class="state">
    <div class="state-badge">${badgeContent}</div>
    <h2 class="state-title">${esc(title)}</h2>
    <p class="state-copy">${esc(copy)}</p>
    ${actionLabel ? `<button class="state-action" data-action="${esc(action)}">${esc(actionLabel)}</button>` : ""}
  </div>`;
}

let toastTimer = null;

export function toast(message) {
  const element = document.getElementById("toast");
  if (!element) return;
  element.textContent = message;
  element.hidden = false;
  requestAnimationFrame(() => element.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    element.classList.remove("show");
    setTimeout(() => {
      element.hidden = true;
    }, 220);
  }, 2600);
}

export function openModal(content, { panelClass = "", onClose = null, closeOnBackdrop = true } = {}) {
  const root = document.getElementById("overlay-root");
  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  backdrop.innerHTML = `<div class="panel ${panelClass}" role="dialog" aria-modal="true" tabindex="-1">${content}</div>`;
  const panel = backdrop.firstElementChild;
  root.appendChild(backdrop);

  const previousFocus = document.activeElement;
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    backdrop.classList.remove("in");
    setTimeout(() => backdrop.remove(), 140);
    if (previousFocus && typeof previousFocus.focus === "function") {
      previousFocus.focus({ preventScroll: true });
    }
    onClose?.();
  };

  const onKey = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  document.addEventListener("keydown", onKey);
  if (closeOnBackdrop) {
    backdrop.addEventListener("mousedown", (event) => {
      if (event.target === backdrop) close();
    });
  }
  backdrop.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", close);
  });

  requestAnimationFrame(() => {
    backdrop.classList.add("in");
    const focusTarget =
      panel.querySelector("input:not([type=hidden]), textarea") ||
      panel.querySelector("button") ||
      panel;
    focusTarget.focus({ preventScroll: true });
  });

  return { backdrop, panel, close };
}

function closeLayer(layer, onClose) {
  const close = () => {
    layer.remove();
    document.removeEventListener("keydown", onKey);
    onClose?.();
  };
  const onKey = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };
  document.addEventListener("keydown", onKey);
  layer.addEventListener("mousedown", (event) => {
    if (event.target === layer) close();
  });
  layer.querySelector("[data-close-layer]")?.addEventListener("click", close);
  return close;
}

export function openImage(url) {
  const root = document.getElementById("overlay-root");
  const layer = document.createElement("div");
  layer.className = "lightbox-backdrop";
  layer.innerHTML = `
    <img class="lightbox-image" src="${esc(url)}" alt="动态配图">
    <button class="lightbox-close" data-close-layer aria-label="关闭大图">${icon("close")}</button>`;
  root.appendChild(layer);

  const image = layer.querySelector("img");
  image.addEventListener("error", () => {
    // 只换掉图片本身，关闭按钮保持原来的事件绑定。
    image.remove();
    const note = document.createElement("div");
    note.className = "lightbox-error";
    note.innerHTML = `${icon("photo")}<span>图片加载失败</span>`;
    layer.insertBefore(note, layer.firstChild);
  });
  closeLayer(layer);
  layer.querySelector("button")?.focus({ preventScroll: true });
}

export function openVideo(url, poster) {
  const root = document.getElementById("overlay-root");
  const layer = document.createElement("div");
  layer.className = "lightbox-backdrop";
  layer.innerHTML = `
    <video class="lightbox-video" controls autoplay playsinline preload="metadata" referrerpolicy="no-referrer"${poster ? ` poster="${esc(poster)}"` : ""}>
      <source src="${esc(url)}" referrerpolicy="no-referrer">
    </video>
    <button class="lightbox-close" data-close-layer aria-label="关闭视频">${icon("close")}</button>`;
  root.appendChild(layer);

  const video = layer.querySelector("video");
  video.play().catch(() => {});
  closeLayer(layer, () => {
    video.pause();
    video.removeAttribute("src");
    video.load();
  });
  layer.querySelector("button")?.focus({ preventScroll: true });
}

export function bindMusicParallax(root) {
  const onMove = (event) => {
    const card = event.target.closest?.(".attachment-card.music");
    if (!card || !root.contains(card)) return;
    const rect = card.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    card.style.setProperty("--music-x", `${(x * 100).toFixed(1)}%`);
    card.style.setProperty("--music-y", `${(y * 100).toFixed(1)}%`);
    card.style.setProperty("--music-shift-x", `${((x - 0.5) * 28).toFixed(1)}px`);
    card.style.setProperty("--music-shift-y", `${((y - 0.5) * 20).toFixed(1)}px`);
  };

  const resetCard = (card) => {
    card.style.removeProperty("--music-x");
    card.style.removeProperty("--music-y");
    card.style.removeProperty("--music-shift-x");
    card.style.removeProperty("--music-shift-y");
  };

  const reset = () => {
    root.querySelectorAll(".attachment-card.music").forEach(resetCard);
  };

  const onOut = (event) => {
    const card = event.target.closest?.(".attachment-card.music");
    if (!card) return;
    if (event.relatedTarget && card.contains(event.relatedTarget)) return;
    resetCard(card);
  };

  const onLeave = (event) => {
    if (!root.contains(event.relatedTarget)) reset();
  };

  root.addEventListener("pointermove", onMove, { passive: true });
  root.addEventListener("pointerout", onOut);
  root.addEventListener("pointerleave", onLeave);
  return () => {
    root.removeEventListener("pointermove", onMove);
    root.removeEventListener("pointerout", onOut);
    root.removeEventListener("pointerleave", onLeave);
  };
}

export function bindAction(root, selector, handler) {
  root.querySelectorAll(selector).forEach((element) => {
    element.addEventListener("click", handler);
  });
}
