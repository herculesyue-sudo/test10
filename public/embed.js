/**
 * Dr Timeless · AI 面部分析 —— 官網嵌入腳本
 * ─────────────────────────────────────────────────────────
 * 用法：喺想擺個工具嘅位置貼呢兩行
 *
 *   <div id="drt-consult"></div>
 *   <script src="https://你嘅網址/embed.js" async></script>
 *
 * 就係咁。適用於 WordPress、Wix、Squarespace、Webflow 或者自建網站 ——
 * 任何俾你插 HTML 嘅地方都得。
 *
 * 想擺喺唔同位置 / 改高度，可以加 data 屬性：
 *   <div id="drt-consult" data-min-height="700"></div>
 */
(function () {
  'use strict';

  // 呢個檔由邊度載入，widget 就由邊度載入 —— 診所唔使喺兩個地方填網址，
  // 亦唔會出現「搬咗 server 但腳本仲指住舊網址」呢種靜靜雞壞咗嘅情況。
  var self = document.currentScript;
  if (!self) return;
  var base = new URL(self.src, location.href).origin;

  var mount = document.getElementById('drt-consult');
  if (!mount) {
    console.warn('[drt-consult] 搵唔到 <div id="drt-consult"></div>，請確認個 div 喺 script 之前。');
    return;
  }
  if (mount.getAttribute('data-drt-ready') === '1') return; // 防止重複載入
  mount.setAttribute('data-drt-ready', '1');

  var minHeight = parseInt(mount.getAttribute('data-min-height') || '0', 10) || 620;

  var frame = document.createElement('iframe');
  frame.src = base + '/embed';
  frame.title = 'AI 免費面部分析';
  frame.loading = 'lazy';
  // camera：手機直接開鏡頭自拍要用到。冇呢個 iOS Safari 會靜靜雞唔准。
  frame.allow = 'camera; clipboard-write';
  frame.style.cssText =
    'width:100%;border:0;display:block;min-height:' + minHeight + 'px;transition:height .18s ease;';
  frame.setAttribute('scrolling', 'no');
  mount.appendChild(frame);

  window.addEventListener('message', function (e) {
    // 只收自己個 widget 嘅訊息。冇呢個檢查，頁面上任何第三方腳本
    // （廣告、聊天 widget）都可以隨便改你個 iframe 高度。
    if (e.origin !== base) return;
    var d = e.data;
    if (!d || typeof d !== 'object') return;

    if (d.type === 'drt-consult:height' && typeof d.height === 'number') {
      frame.style.height = Math.max(minHeight, d.height) + 'px';
    }

    // 出咗報告之後要捲返上去。iframe 入面自己 scrollTo 只會捲 iframe，
    // 父頁面唔會郁，客人會望住一份由中間開始嘅報告，以為壞咗。
    if (d.type === 'drt-consult:scroll-top') {
      var top = frame.getBoundingClientRect().top + window.pageYOffset - 20;
      window.scrollTo({ top: top, behavior: 'smooth' });
    }
  });
})();
