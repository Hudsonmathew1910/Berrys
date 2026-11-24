"use client";
import { useSyncExternalStore } from "react";

/**
 * A tiny localStorage-backed store for per-browser conveniences (bag,
 * favourites). Uses useSyncExternalStore so the server render and first
 * client render agree, and tabs stay in sync.
 */
export function createPersistedStore<T>(key: string, fallback: T) {
  let cache: T | undefined;
  const listeners = new Set<() => void>();

  const read = (): T => {
    if (cache === undefined) {
      try {
        const raw = localStorage.getItem(key);
        cache = raw ? (JSON.parse(raw) as T) : fallback;
      } catch {
        cache = fallback;
      }
    }
    return cache;
  };

  const set = (next: T | ((prev: T) => T)) => {
    cache = typeof next === "function" ? (next as (prev: T) => T)(read()) : next;
    try {
      localStorage.setItem(key, JSON.stringify(cache));
    } catch {
      // storage full or blocked: keep the in-memory value
    }
    listeners.forEach((l) => l());
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) {
        cache = undefined;
        listener();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  };

  return {
    set,
    /** Current value (outside React). */
    get: read,
    /** Called on every change in this tab and in other tabs. */
    subscribe,
    use: () => useSyncExternalStore(subscribe, read, () => fallback),
  };
}
