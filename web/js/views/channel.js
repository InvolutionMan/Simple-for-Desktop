// 频道弹层：桌面版目前也是空态。

import { icon, openModal } from "../ui.js?v=20261101bf";

export function openChannel() {
  openModal(
    `
    <div class="panel-head">
      <h2 class="panel-title">频道</h2>
      <button class="panel-close" type="button" data-close>关闭</button>
    </div>
    <div class="channel-empty">
      <div class="state-badge">${icon("channel")}</div>
      <h3>还没有加入任何频道</h3>
      <p>加入频道后，频道里的内容会出现在这里。</p>
    </div>`,
    { panelClass: "channel-panel" },
  );
}
