"use client";
import { useEffect } from "react";
import type { BagLine } from "@/lib/catalog";
import { bagStore, likesStore } from "./bag";

const OWNER = "berry-bag-owner"; // which account this browser's bag belongs to
const DIRTY = "berry-bag-dirty"; // changed here but not saved to the account yet

const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      // storage blocked: the bag still works for this visit
    }
  },
};

const key = (l: BagLine) => `${l.productId}\u0000${l.size}`;

/** This browser's bag + the account's bag: every line from both, the larger quantity when both have it. */
function merge(a: BagLine[], b: BagLine[]) {
  const out = new Map<string, BagLine>();
  for (const l of [...a, ...b]) {
    const prev = out.get(key(l));
    out.set(key(l), prev && prev.quantity >= l.quantity ? prev : l);
  }
  return [...out.values()];
}

/**
 * Keeps a signed-in customer's bag and favourites the same on every device.
 * - First visit on a device after signing in: this browser's bag is merged into the account's.
 * - Every change here is saved to the account (half a second later).
 * - Changes from other devices arrive when the tab is shown again, and every 30 seconds.
 * - Signed out: the account's bag is removed from this browser (shared devices).
 */
export function BagSync({ userId }: { userId: string | null }) {
  useEffect(() => {
    if (!userId) {
      if (ls.get(OWNER)) {
        ls.set(OWNER, null);
        ls.set(DIRTY, null);
        bagStore.set([]);
        likesStore.set([]);
      }
      return;
    }

    let applying = false; // true while we write what the server sent (not a change by the shopper)
    let timer: ReturnType<typeof setTimeout> | undefined;
    let saving = false;
    let stopped = false;

    const apply = (bag: BagLine[], likes: string[]) => {
      applying = true;
      bagStore.set(bag);
      likesStore.set(likes);
      applying = false;
    };

    async function save() {
      if (saving) return;
      saving = true;
      try {
        const res = await fetch("/api/account/bag", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bag: bagStore.get(), likes: likesStore.get() }),
        });
        if (res.ok) ls.set(DIRTY, null);
      } catch {
        // offline: DIRTY stays set and we try again next time
      } finally {
        saving = false;
      }
    }

    async function pull(first = false) {
      if (stopped || timer || saving) return; // a change of ours is about to be saved
      try {
        const res = await fetch("/api/account/bag", { cache: "no-store" });
        if (!res.ok) return;
        const server = (await res.json()) as { bag: BagLine[]; likes: string[]; saved: boolean };
        if (stopped || timer) return;
        const owner = ls.get(OWNER);
        if (first && (!owner || (owner === userId && ls.get(DIRTY)))) {
          // Signing in with a guest bag: keep everything from both. Or unsaved changes from before.
          if (!owner)
            apply(merge(server.bag, bagStore.get()), [...new Set([...server.likes, ...likesStore.get()])]);
          ls.set(OWNER, userId);
          await save();
          return;
        }
        // Another account's bag left in this browser is never mixed in: the account's bag wins.
        ls.set(OWNER, userId);
        const same =
          JSON.stringify(server.bag) === JSON.stringify(bagStore.get()) &&
          JSON.stringify(server.likes) === JSON.stringify(likesStore.get());
        if (!same) apply(server.bag, server.likes);
      } catch {
        // offline: try again later
      }
    }

    const changed = () => {
      if (applying) return;
      ls.set(DIRTY, "1");
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void save();
      }, 500);
    };
    // A change not saved yet when the tab closes stays marked (DIRTY) and is saved on the next visit.
    const offBag = bagStore.subscribe(changed);
    const offLikes = likesStore.subscribe(changed);
    const onShow = () => document.visibilityState === "visible" && void pull();
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    const every = setInterval(() => document.visibilityState === "visible" && void pull(), 30_000);
    void pull(true);

    return () => {
      stopped = true;
      offBag();
      offLikes();
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
      clearInterval(every);
      if (timer) {
        clearTimeout(timer);
        void save();
      }
    };
  }, [userId]);

  return null;
}
