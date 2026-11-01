// 深色 / 浅色主题：localStorage 记忆，切换时带 View Transition 淡入淡出。

const STORAGE_KEY = "simple.theme";
const LIGHT_COLOR = "#FBFAF8";
const DARK_COLOR = "#0F1214";
const TRANSITION_CLASS = "theme-transition";
const TRANSITION_MS = 420;

let transitionTimer = 0;

export function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function isDark() {
  return currentTheme() === "dark";
}

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

function updateMeta(theme) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? DARK_COLOR : LIGHT_COLOR);
}

function systemTheme() {
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

function savedTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    return null;
  }
}

function beginCssTransition() {
  const root = document.documentElement;
  root.classList.add(TRANSITION_CLASS);
  // 先让浏览器记录旧颜色，再切 dataset，保证过渡从当前值开始。
  void root.offsetWidth;
  clearTimeout(transitionTimer);
}

function endCssTransition() {
  clearTimeout(transitionTimer);
  transitionTimer = window.setTimeout(() => {
    document.documentElement.classList.remove(TRANSITION_CLASS);
  }, TRANSITION_MS);
}

export function applyTheme(theme, { persist = true, animate = false } = {}) {
  const next = theme === "dark" ? "dark" : "light";
  const root = document.documentElement;
  const shouldAnimate = animate && !prefersReducedMotion();

  if (shouldAnimate) beginCssTransition();

  root.dataset.theme = next;
  root.style.colorScheme = next;
  updateMeta(next);

  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 无痕模式或禁用存储时只影响本次页面。
    }
  }

  if (shouldAnimate) endCssTransition();

  window.dispatchEvent(new CustomEvent("simple:theme", { detail: { theme: next } }));
  return next;
}

function themeOrigin(origin) {
  if (
    origin &&
    Number.isFinite(origin.x) &&
    Number.isFinite(origin.y) &&
    (origin.x !== 0 || origin.y !== 0)
  ) {
    return { x: Math.round(origin.x), y: Math.round(origin.y) };
  }

  const active = document.activeElement;
  const rect =
    active && active !== document.body && typeof active.getBoundingClientRect === "function"
      ? active.getBoundingClientRect()
      : null;

  if (rect && rect.width > 0 && rect.height > 0) {
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    };
  }

  return { x: Math.round(window.innerWidth - 48), y: 48 };
}

export function toggleTheme(clickOrigin = null) {
  const next = currentTheme() === "dark" ? "light" : "dark";

  // Chrome / 新版 Safari：从点击位置扩散圆形切换，渐变和图片一起过渡。
  if (!prefersReducedMotion() && typeof document.startViewTransition === "function") {
    try {
      const origin = themeOrigin(clickOrigin);
      const root = document.documentElement;
      root.style.setProperty("--theme-x", `${origin.x}px`);
      root.style.setProperty("--theme-y", `${origin.y}px`);
      const transition = document.startViewTransition(() => {
        applyTheme(next);
      });
      transition?.finished?.catch(() => {});
      return next;
    } catch {
      // 降级到颜色过渡。
    }
  }

  return applyTheme(next, { animate: true });
}

export function initTheme() {
  const current = document.documentElement.dataset.theme;
  if (current === "dark" || current === "light") {
    document.documentElement.style.colorScheme = current;
    updateMeta(current);
    return current;
  }

  const next = savedTheme() || systemTheme();
  return applyTheme(next, { persist: false });
}
