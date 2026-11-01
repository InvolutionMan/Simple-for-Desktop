// 慢信：卡片 + 写信弹层。信只存在浏览器本地，不落服务端。

import { esc, icon, openModal, toast } from "../ui.js?v=20261101bf";

const STORAGE_KEY = "simple.letters";

function readLetters() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const value = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function mountSlowLetter(root) {
  const letters = readLetters();

  root.innerHTML = `
    <div class="letter">
      <div class="paper-bg"></div>
      <div class="letter-inner">
        <div class="page-title-bar"><h1>信箱</h1></div>

        <section class="letter-card">
          <div class="letter-rule">
            <div class="eyebrow">SLOW LETTER</div>
            <div class="letter-stamp">慢</div>
          </div>
          <h2 class="letter-title">一封慢信</h2>
          <p class="letter-copy">写一封不着急被读到的信。把此刻的心情折好，交给时间。</p>
          <div class="letter-actions">
            <button class="primary-button letter-write" type="button" data-write>
              ${icon("edit")}写一封慢信
            </button>
          </div>
        </section>

        <div class="letter-empty" data-empty>${emptyText(letters.length)}</div>
      </div>
    </div>`;

  root.querySelector("[data-write]").addEventListener("click", () => {
    openComposer((title, content) => {
      const next = readLetters();
      next.unshift({ title, content, at: Date.now() });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, 20)));
      root.querySelector("[data-empty]").textContent = emptyText(next.length);
      toast("信已经折好，等待寄出。");
    });
  });

  function emptyText(count) {
    if (!count) return "还没有收到信。写下的信会先留在这一页，等时间寄出。";
    return `已经写好 ${count} 封，等时间寄出。`;
  }
}

function openComposer(onSubmit) {
  const modal = openModal(
    `
    <div class="letter-composer">
      <h2>写一封慢信</h2>
      <textarea class="letter-textarea" data-letter maxlength="500" placeholder="写给未来的某一天……"></textarea>
      <p class="letter-count"><span data-count>0</span> / 500</p>
      <div class="letter-composer-actions">
        <button class="secondary-button" type="button" data-close>先不写</button>
        <button class="send-button" type="button" data-submit disabled>折好，寄出</button>
      </div>
      <p class="modal-note">慢信只保存在这个浏览器里，不会上传。</p>
    </div>`,
  );

  const textarea = modal.panel.querySelector("[data-letter]");
  const counter = modal.panel.querySelector("[data-count]");
  const submit = modal.panel.querySelector("[data-submit]");

  textarea.addEventListener("input", () => {
    counter.textContent = String(textarea.value.length);
    submit.disabled = textarea.value.trim().length === 0;
  });

  submit.addEventListener("click", () => {
    const content = textarea.value.trim();
    if (!content) return;
    onSubmit("一封慢信", content);
    modal.close();
  });

  textarea.focus();
}
