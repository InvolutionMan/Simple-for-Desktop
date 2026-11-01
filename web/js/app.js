// 启动：闪屏、会话恢复、登录 / 外壳切换、登录过期兜底。

import { api, ApiError } from "./api.js?v=20261101bf";
import { mark, toast } from "./ui.js?v=20261101bf";
import { mountLogin } from "./views/login.js?v=20261101bf";
import { mountShell } from "./shell.js?v=20261101bf";
import { initTheme } from "./theme.js?v=20261101bf";

initTheme();

const app = document.getElementById("app");
console.info("[simple] web build 20261101bf");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const SPLASH_MS = reduceMotion ? 1800 : 2800;

let session = null;
let health = null;
let shellCleanup = null;
let booted = false;
let ready = false;
let skipRequested = false;
let bootStarted = 0;

showSplash();
boot();

async function boot() {
  bootStarted = performance.now();

  const healthPromise = api.health().catch(() => null);
  const sessionPromise = Promise.race([
    api.session().catch((error) => {
      if (!(error instanceof ApiError) || error.status !== 401) {
        console.warn("[simple] 会话恢复失败", error);
      }
      return null;
    }),
    sleep(10000).then(() => null),
  ]);

  const [healthResult, sessionResult] = await Promise.all([healthPromise, sessionPromise]);
  health = healthResult;
  session = sessionResult?.user || null;
  ready = true;

  const elapsed = performance.now() - bootStarted;
  const delay = skipRequested ? 0 : Math.max(0, SPLASH_MS - elapsed);

  setTimeout(async () => {
    if (health?.mock && location.hash === "#/dev") {
      try {
        const data = await api.devSession("mock");
        session = data.user;
        history.replaceState(null, "", "#/feed");
      } catch (error) {
        toast(error.message || "预览入口没开。");
      }
    }
    finishBoot();
  }, delay);
}

function showSplash() {
  const splash = document.createElement("div");
  splash.className = "splash";
  splash.id = "splash";
  splash.innerHTML = `
    <div class="splash-lockup">
      <div class="splash-eyebrow">
        ${["单", "纯", "交", "个"].map((character) => `<span>${character}</span>`).join("")}
        <span class="bracket tl"></span>
      </div>
      <div class="splash-word">朋友<span class="bracket br"></span></div>
    </div>
    <div class="splash-brand">${mark(38, "#F7F5F0", "#0A0A0A")}<span>Simple</span></div>`;
  document.body.appendChild(splash);
  requestAnimationFrame(() => splash.classList.add("in"));

  const dismiss = (event) => {
    if (event.type === "keydown" && event.key !== "Escape") return;
    skipRequested = true;
    if (ready) finishBoot();
  };

  splash._dismiss = dismiss;
  splash.addEventListener("click", dismiss);
  document.addEventListener("keydown", dismiss);
}

function finishBoot() {
  if (booted) return;
  booted = true;

  const splash = document.getElementById("splash");
  if (splash) {
    const dismiss = splash._dismiss;
    if (dismiss) {
      splash.removeEventListener("click", dismiss);
      document.removeEventListener("keydown", dismiss);
    }
    splash.classList.add("out");
    setTimeout(() => splash.remove(), 600);
  }

  if (!(health?.mock) && location.hash === "#/dev") {
    history.replaceState(null, "", "#/feed");
  }

  if (session) {
    renderShell();
  } else {
    renderLogin();
  }
}

function renderLogin() {
  app.innerHTML = "";
  mountLogin(app, {
    mock: Boolean(health?.mock),
    onPreview: startPreview,
    onLogin: (user) => {
      session = user;
      renderShell();
    },
  });
}

function renderShell() {
  shellCleanup?.();
  shellCleanup = null;
  app.innerHTML = "";
  shellCleanup = mountShell(app, {
    user: session,
    onSignOut: signOut,
    mock: Boolean(health?.mock),
  });
}

function signOut() {
  shellCleanup?.();
  shellCleanup = null;
  session = null;
  history.replaceState(null, "", "#/feed");
  renderLogin();
}

async function startPreview() {
  try {
    const data = await api.devSession("mock");
    session = data.user;
    history.replaceState(null, "", "#/feed");
    renderShell();
  } catch (error) {
    toast(error.message || "预览入口没开。");
  }
}

window.addEventListener("simple:session-expired", () => {
  if (!session) return;
  session = null;
  shellCleanup?.();
  shellCleanup = null;
  app.innerHTML = "";
  renderLogin();
  toast("登录已过期，请重新登录。");
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
