"use client";

import * as React from "react";

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled]):not([type=hidden])", "select:not([disabled])",
  "textarea:not([disabled])", "[tabindex]:not([tabindex='-1'])", "[contenteditable=true]",
].join(",");

let scrollLocks = 0;
let savedOverflow = "";

/**
 * 模态层的焦点管理（WAI-ARIA Dialog Pattern，评审 R19）：
 * - 打开时把焦点移进对话框（优先 `[data-autofocus]`，否则第一个可聚焦元素，否则对话框本身）；
 * - Tab / Shift+Tab 在对话框内循环，不会跑到背后的页面；
 * - Esc 只由焦点所在的那一层处理 —— 抽屉叠抽屉时一次 Esc 只关最上面一层；
 * - 关闭后焦点回到打开前的元素；
 * - 页面滚动锁按计数，多层叠加时最后一层关闭才解锁。
 */
export function useModalFocus(ref: React.RefObject<HTMLElement | null>, open: boolean, onEscape: () => void) {
  const onEscapeRef = React.useRef(onEscape);
  onEscapeRef.current = onEscape;

  React.useEffect(() => {
    if (!open) return;
    const container = ref.current;
    if (!container) return;
    const previous = document.activeElement as HTMLElement | null;

    if (scrollLocks++ === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
    const initial = container.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0];
    if (!container.hasAttribute("tabindex")) container.setAttribute("tabindex", "-1");
    (initial ?? container).focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onEscapeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) { event.preventDefault(); container.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === container)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    };
    container.addEventListener("keydown", onKeyDown);

    return () => {
      container.removeEventListener("keydown", onKeyDown);
      if (--scrollLocks === 0) document.body.style.overflow = savedOverflow;
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [open, ref]);
}
