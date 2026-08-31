'use client';

/**
 * iframe 高度自動同步。
 *
 * 嵌入 widget 最常見嘅失敗唔係功能壞，而係**高度**：父頁面畀 iframe 一個
 * 固定高度，然後個報告一長就出現 iframe 入面再有 scrollbar，喺手機上面
 * 幾乎冇得用（兩層 scroll 打交）。
 *
 * 解決方法係 iframe 主動報高度上去，父頁面跟住改。呢度用 ResizeObserver
 * 而唔係定時輪詢 —— 內容一變就即刻報，唔會見到一格空白跳嚟跳去。
 */
export function startHeightSync() {
  if (typeof window === 'undefined' || window.parent === window) return () => {};

  let last = 0;
  const post = () => {
    // 量 body 嘅 rect 高度，唔好用 documentElement.scrollHeight ——
    // scrollHeight 有 viewport 下限：父頁一將 iframe 拉高，我哋嘅
    // viewport 就係咁高，內容縮短之後個數字縮唔返，iframe 只加唔減。
    // 「再分析一次」由長報告返去短表格嗰下就會留低成千 px 死位。
    // body 冇設高度（globals.css），係 content-sized，縮得返。
    const h = Math.ceil(document.body.getBoundingClientRect().height);
    if (h === last) return;
    last = h;
    // targetOrigin 用 '*'：父頁面網域係診所自己設嘅，呢度只送高度數字，
    // 冇任何個人資料，所以唔需要（亦冇辦法）限死收件方。
    window.parent.postMessage({ type: 'drt-consult:height', height: h }, '*');
  };

  const ro = new ResizeObserver(post);
  // observe 個量度對象本身 —— 觀察 documentElement 但量 body，
  // body 縮嗰下 documentElement 可能冇 resize，事件會漏
  ro.observe(document.body);
  window.addEventListener('load', post);
  post();

  return () => ro.disconnect();
}

/**
 * 叫父頁面捲返上去。
 *
 * iframe 入面 window.scrollTo 只會捲 iframe 自己，父頁面唔會郁。出咗報告
 * 之後客人會停留喺頁面中間，望住一份由中間開始嘅報告 —— 睇落好似壞咗。
 */
export function scrollParentToTop() {
  if (typeof window === 'undefined') return;
  if (window.parent === window) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  window.parent.postMessage({ type: 'drt-consult:scroll-top' }, '*');
}
