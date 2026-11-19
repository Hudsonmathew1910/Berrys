"use client";
import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/catalog";
import { api } from "@/components/store/api";

/** Live price & stock for the given product ids (bag, favourites). */
export function useProducts(ids: string[]) {
  const key = useMemo(() => [...new Set(ids)].sort().join(","), [ids]);
  const [state, setState] = useState<{ key: string; products: Product[]; error: string } | null>(null);

  useEffect(() => {
    let active = true;
    const load = key
      ? api<{ products: Product[] }>(`/api/products?ids=${encodeURIComponent(key)}`)
      : Promise.resolve({ products: [] });
    load
      .then((d) => active && setState({ key, products: d.products, error: "" }))
      .catch((e: Error) => active && setState({ key, products: [], error: e.message }));
    return () => {
      active = false;
    };
  }, [key]);

  const ready = state?.key === key;
  return {
    products: ready ? state.products : [],
    loading: !ready,
    error: ready ? state.error : "",
    reload: () => setState(null),
  };
}
