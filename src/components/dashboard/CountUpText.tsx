// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
/**
 * OMN-21970 AC9 (Lakshman 2026-11-02): a card figure counts up when its card first appears.
 *
 * Presentation only. The served, formatted figure is the truth: the count animates the one number inside that text,
 * keeping its prefix, suffix, decimals and thousands separators, and its last frame is the exact text it was given.
 * A text with no number ("Not recorded") is shown as it is, a later figure (a data refresh) is shown at once instead of
 * counting from zero again, and under prefers-reduced-motion the figure is shown at once.
 */
import { useEffect, useRef, useState } from 'react';
import { localeString as fmtLocaleString } from '@/lib/format';

export const COUNT_UP_MS = 800;

const NUMBER = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/s;

/**
 * True unless the browser can confirm the reader has not asked for reduced motion: an environment with no matchMedia
 * (server render, jsdom) cannot, so it shows the final figure.
 */
function prefersReducedMotion(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
}

/** The text's number written at `value`, in the text's own format. */
function frame(text: string, value: number): string {
  const match = NUMBER.exec(text);
  if (!match) return text;
  const [, prefix, digits, suffix] = match as unknown as [string, string, string, string];
  const decimals = digits.includes('.') ? digits.split('.')[1]!.length : 0;
  const grouped = digits.includes(',');
  const written = fmtLocaleString(value, 'en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped });
  return `${prefix}${written}${suffix}`;
}

export function CountUpText({ text }: { text: string }) {
  // started: this card has begun counting; counted: the text it began with; done: the count reached its end.
  const started = useRef(false);
  const counted = useRef<string | null>(null);
  const done = useRef(false);
  const [shown, setShown] = useState(() => {
    const match = NUMBER.exec(text);
    return match && !prefersReducedMotion() ? frame(text, 0) : text;
  });

  useEffect(() => {
    const match = NUMBER.exec(text);
    // Shown at once: no number to count, reduced motion asked for, the count already ran, or a new figure arrived
    // (a data refresh) after this card began counting.
    if (!match || prefersReducedMotion() || done.current || (started.current && counted.current !== text)) {
      started.current = true;
      counted.current = text;
      done.current = true;
      setShown(text);
      return undefined;
    }
    // A first run that was cancelled before it ended (React's development StrictMode runs effects twice) starts again.
    started.current = true;
    counted.current = text;
    const target = Number(match[2]!.replace(/,/g, ''));
    const start = performance.now();
    let handle = 0;
    // A superseded count (a new figure, or unmount) never writes again, even if its frame was already queued.
    let live = true;
    const step = (time: number) => {
      if (!live) return;
      const progress = Math.min(1, (time - start) / COUNT_UP_MS);
      if (progress >= 1) { done.current = true; setShown(text); return; }
      const eased = 1 - (1 - progress) ** 3;
      setShown(frame(text, target * eased));
      handle = requestAnimationFrame(step);
    };
    handle = requestAnimationFrame(step);
    return () => { live = false; cancelAnimationFrame(handle); };
  }, [text]);

  return <>{shown}</>;
}
