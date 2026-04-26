// SOURCE: Claude Design prototype (app.jsx:264-305, OmniDash.html:393-416).
//
// The prototype's dropdown menus are small, position-absolute popovers anchored
// to a trigger button's bounding rect. This module is the shared infrastructure
// for that pattern:
//
//   - `.menu` / `.menu-item` / `.menu-item.danger` / `.menu-sep` CSS lives in
//     src/styles/dashboard.css (verbatim port from OmniDash.html).
//   - `usePositionedMenu()` manages the open-anchor state and dismissal handlers.
//   - `<PositionedMenu>` renders the positioned popover shell.
//   - `<MenuItem>` and `<MenuSeparator>` render `.menu-item` / `.menu-sep`.
//
// Call-site pattern:
//   const menu = usePositionedMenu();
//   <button ref={menu.triggerRef} onClick={menu.open}>...</button>
//   {menu.isOpen && (
//     <PositionedMenu anchor={menu.anchor} onClose={menu.close}>
//       <MenuItem onSelect={doThing}>Configure</MenuItem>
//       <MenuSeparator />
//       <MenuItem variant="danger" onSelect={doOther}>Remove</MenuItem>
//     </PositionedMenu>
//   )}
//
// Intentional gaps (matching the prototype):
//   - No arrow-key navigation, no typeahead search.
//   - No focus trap. Menu dismisses on outside click or Escape.
//   - No RTL-aware positioning — assumes LTR flow, mirrors the prototype.

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/** Anchor rect captured from the trigger on open. Menu positions relative to this. */
export interface MenuAnchor {
  top: number;
  left: number;
  /** Width of the trigger, used to compute right-align offsets. */
  width: number;
  /** Height of the trigger, used to place the menu just below it. */
  height: number;
}

/** How the menu aligns relative to the trigger's bounding rect. */
export type MenuPlacement =
  /** Below the trigger, left edge aligned. */
  | 'bottom-start'
  /** Below the trigger, right edge aligned. */
  | 'bottom-end'
  /** Right of the trigger, top aligned. */
  | 'right-start';

interface UsePositionedMenuResult {
  isOpen: boolean;
  anchor: MenuAnchor | null;
  /** Bind to your trigger button's onClick. Reads currentTarget's rect. */
  open: (e: ReactMouseEvent<HTMLElement>) => void;
  close: () => void;
  /** Call this from a menu item's handler to fire the action and dismiss. */
  select: (fn: () => void) => () => void;
}

export function usePositionedMenu(): UsePositionedMenuResult {
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);

  const open = useCallback((e: ReactMouseEvent<HTMLElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setAnchor({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
  }, []);

  const close = useCallback(() => setAnchor(null), []);

  const select = useCallback(
    (fn: () => void) => () => {
      fn();
      setAnchor(null);
    },
    [],
  );

  return { isOpen: anchor !== null, anchor, open, close, select };
}

interface PositionedMenuProps {
  anchor: MenuAnchor | null;
  onClose: () => void;
  placement?: MenuPlacement;
  /** Minimum width in px; defaults to 180 matching the prototype. */
  minWidth?: number;
  children: ReactNode;
}

/**
 * Renders a position-fixed popover anchored to `anchor`. Dismisses on outside
 * click (pointerdown outside the menu) or Escape key. Uses the `.menu` CSS
 * class from dashboard.css for appearance + animation.
 *
 * Portaled to document.body so it escapes any parent with `overflow: hidden`
 * or transforms that would clip a positioned child.
 */
export function PositionedMenu({
  anchor,
  onClose,
  placement = 'bottom-end',
  minWidth = 180,
  children,
}: PositionedMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!anchor) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (!menuRef.current) return;
      if (e.target instanceof Node && menuRef.current.contains(e.target)) return;
      onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [anchor, onClose]);

  if (!anchor) return null;

  // Compute the menu's top/left from the anchor rect and requested placement.
  const style: React.CSSProperties = { minWidth };
  if (placement === 'bottom-start') {
    style.top = anchor.top + anchor.height + 4;
    style.left = anchor.left;
  } else if (placement === 'right-start') {
    style.top = anchor.top;
    style.left = anchor.left + anchor.width + 4;
  } else {
    // bottom-end: right edges aligned
    style.top = anchor.top + anchor.height + 4;
    // minWidth check in case the menu is wider than the trigger
    style.left = anchor.left + anchor.width - Math.max(minWidth, 0);
  }

  // Use position: fixed because anchor rect is viewport-relative.
  style.position = 'fixed';

  return createPortal(
    <div ref={menuRef} className="menu" style={style} role="menu">
      {children}
    </div>,
    document.body,
  );
}

interface MenuItemProps {
  onSelect: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
  children: ReactNode;
}

export function MenuItem({ onSelect, variant = 'default', disabled, children }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={cn('menu-item', variant === 'danger' && 'danger')}
      onClick={onSelect}
    >
      {children}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="menu-sep" role="separator" />;
}
