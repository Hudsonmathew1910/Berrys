"use client";
import { useCallback, useEffect, useState } from "react";
import type { Product } from "@/lib/catalog";

/** fetch + JSON with the server's friendly error message on failure. */
export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init || {};
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Please try again.");
  return data as T;
}

export type StoreState = {
  products: Product[];
  preview: boolean;
  viewer: { email: string | null; phone: string | null; name: string; complete: boolean } | null;
  admin: boolean;
  needsSetup: boolean;
};

const initial: StoreState = { products: [], preview: false, viewer: null, admin: false, needsSetup: false };

/** Loads the catalogue and the visitor's role from /api/store. */
export function useStoreData() {
  const [data, setData] = useState<StoreState>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setData(await api<StoreState>("/api/store"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api<StoreState>("/api/store")
      .then((d) => active && (setData(d), setError("")))
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return { ...data, loading, error, refresh };
}
