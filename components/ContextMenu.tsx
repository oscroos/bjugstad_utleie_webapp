"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

// The app's right-click menu.
//
//   const menu = useContextMenu();
//   <div onContextMenu={(event) => menu.open(event, items)}>...</div>
//   <button onClick={(event) => menu.openFrom(event.currentTarget, items)}>...</button>
//   {menu.element}
//
// `open` places the menu at the pointer. `openFrom` places it under an element,
// for a "more" button, so the same actions are reachable on touch screens and
// with the keyboard. The menu closes on Escape, on a click outside, and when the
// page scrolls or is resized.

export type ContextMenuItem =
  | {
      label: string;
      icon?: ReactNode;
      onSelect: () => void;
      disabled?: boolean;
      /** Small text on the right, for example why an item is disabled. */
      hint?: string;
      tone?: "default" | "danger";
    }
  | { separator: true };

type MenuState = {
  x: number;
  y: number;
  items: ContextMenuItem[];
  /** Gets focus back when the menu closes. */
  returnFocusTo: HTMLElement | null;
  /** Opened with the keyboard: the first item is focused, ready for Enter and the arrow keys. */
  viaKeyboard: boolean;
};

const MENU_WIDTH = 240;
const VIEWPORT_MARGIN = 8;

export function useContextMenu() {
  const [state, setState] = useState<MenuState | null>(null);

  const close = useCallback(() => setState(null), []);

  const open = useCallback((event: ReactMouseEvent, items: ContextMenuItem[]) => {
    if (items.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    // A menu opened from the keyboard (Menu key, Shift+F10) is not a right-button
    // click, and may come without a pointer position.
    const fromKeyboard = event.button !== 2 || (event.clientX === 0 && event.clientY === 0);
    const hasPosition = event.clientX !== 0 || event.clientY !== 0;
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    setState({
      x: hasPosition ? event.clientX : rect.left + 24,
      y: hasPosition ? event.clientY : rect.bottom,
      items,
      returnFocusTo: document.activeElement instanceof HTMLElement ? document.activeElement : target,
      viaKeyboard: fromKeyboard,
    });
  }, []);

  const openFrom = useCallback((anchor: HTMLElement, items: ContextMenuItem[]) => {
    if (items.length === 0) return;
    const rect = anchor.getBoundingClientRect();
    setState({
      x: rect.right - MENU_WIDTH,
      y: rect.bottom + 4,
      items,
      returnFocusTo: anchor,
      // A button activated with Enter or Space shows its keyboard focus ring; a clicked one does not.
      viaKeyboard: anchor.matches(":focus-visible"),
    });
  }, []);

  return {
    open,
    openFrom,
    close,
    isOpen: state !== null,
    element: state ? <ContextMenuView state={state} onClose={close} /> : null,
  };
}

function ContextMenuView({ state, onClose }: { state: MenuState; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: state.x, top: state.y });

  // Keep the whole menu inside the window.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPosition({
      left: Math.max(VIEWPORT_MARGIN, Math.min(state.x, window.innerWidth - width - VIEWPORT_MARGIN)),
      top: Math.max(VIEWPORT_MARGIN, Math.min(state.y, window.innerHeight - height - VIEWPORT_MARGIN)),
    });
  }, [state.x, state.y, state.items]);

  useEffect(() => {
    const returnFocusTo = state.returnFocusTo;
    // With the mouse, focus goes to the menu itself, so no item looks selected
    // until the pointer is over it. The arrow keys still work from there.
    if (state.viaKeyboard) focusItem(menuRef.current, 0);
    else menuRef.current?.focus();

    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("contextmenu", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("contextmenu", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
      // Not when the menu item itself moved focus elsewhere, for example into a dialog.
      if (!document.activeElement || document.activeElement === document.body) returnFocusTo?.focus?.();
    };
  }, [onClose, state.returnFocusTo, state.viaKeyboard]);

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const buttons = enabledButtons(menuRef.current);
    if (buttons.length === 0) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | null = null;
    // `current` is -1 while no item is picked: down then starts at the top, up at the bottom.
    if (event.key === "ArrowDown") next = (current + 1) % buttons.length;
    else if (event.key === "ArrowUp") next = current <= 0 ? buttons.length - 1 : current - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    else if (event.key === "Tab") {
      event.preventDefault();
      onClose();
      return;
    }
    if (next !== null) {
      event.preventDefault();
      buttons[next].focus();
    }
  }

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      onKeyDown={onMenuKeyDown}
      // The pointer has left the menu: no item stays picked.
      onMouseLeave={() => menuRef.current?.focus()}
      onContextMenu={(event) => event.preventDefault()}
      className="fixed z-[60] rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl outline-none ring-1 ring-slate-900/5"
      style={{ left: position.left, top: position.top, width: MENU_WIDTH }}
    >
      {state.items.map((item, index) =>
        "separator" in item ? (
          <div key={`separator-${index}`} role="separator" className="my-1.5 border-t border-slate-100" />
        ) : (
          <button
            key={`${item.label}-${index}`}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            // One highlight at a time: the item under the pointer is also the focused one.
            onMouseEnter={(event) => {
              if (!item.disabled) event.currentTarget.focus();
            }}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm outline-none transition disabled:cursor-not-allowed disabled:text-slate-400 ${
              item.tone === "danger"
                ? "text-red-700 enabled:hover:bg-red-50 enabled:focus:bg-red-50"
                : "text-slate-700 enabled:hover:bg-slate-100 enabled:focus:bg-slate-100"
            } ${item.disabled ? "" : "cursor-pointer"}`}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center">{item.icon}</span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.hint ? <span className="shrink-0 text-xs text-slate-400">{item.hint}</span> : null}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

function enabledButtons(menu: HTMLDivElement | null) {
  return menu ? Array.from(menu.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')) : [];
}

function focusItem(menu: HTMLDivElement | null, index: number) {
  enabledButtons(menu)[index]?.focus();
}
