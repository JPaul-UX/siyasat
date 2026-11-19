import type { Judgment } from '@siyasat/core';
import { create } from 'zustand';

/** Something the user just did that can be taken back. */
export interface UndoEntry {
  /** Completes "Undone: …", e.g. "deleted check “Thesis”". */
  label: string;
  /** Put things back. Return false when that was not possible. */
  run: () => boolean | void;
  used?: boolean;
  /** Set for a verdict on a claim, so the claim's drawer can offer the undo inline as well. */
  judgment?: { checkId: string; claim: number; to: Judgment | null };
}

/** A button on a toast other than Undo, such as "Open". */
export interface ToastAction {
  label: string;
  run: () => void;
}

interface ToastState {
  toast: { key: number; message: string; undo?: UndoEntry; action?: ToastAction } | null;
  /** The most recent undoable action. */
  last: UndoEntry | null;
}

export const useToast = create<ToastState>(() => ({ toast: null, last: null }));

let nextKey = 1;

/** Show a short message at the bottom of the screen, with an Undo button when `undo` is given. */
export function toast(message: string, undo?: UndoEntry, action?: ToastAction): void {
  useToast.setState((s) => ({ toast: { key: nextKey++, message, undo, action }, last: undo ?? s.last }));
}

export const dismissToast = (): void => useToast.setState({ toast: null });

export function runUndo(entry: UndoEntry): void {
  if (entry.used) {
    toast('That action was already undone');
    return;
  }
  entry.used = true;
  useToast.setState((s) => ({ last: s.last === entry ? null : s.last }));
  if (entry.run() === false) return;
  toast('Undone: ' + entry.label);
}

/* A notice that is worth showing once in a while, not on every failed request. */
const lastShown: Record<string, number> = {};
export function toastOncePer(key: string, everyMs: number, message: string): void {
  const now = Date.now();
  if (now - (lastShown[key] ?? 0) < everyMs) return;
  lastShown[key] = now;
  toast(message);
}
