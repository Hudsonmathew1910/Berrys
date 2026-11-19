"use client";
import { useEffect, useState } from "react";
import type { Product } from "@/lib/catalog";
import { useStoreData } from "./api";
import { addToBag, bagTotals, useBag, useLikes } from "./bag";
import { BagDrawer } from "./bag-drawer";
import { Collection } from "./collection";
import { InfoModal, type InfoTopic } from "./info-modal";
import { ProductModal } from "./product-modal";
import { ShopHeader } from "./shop-header";
import { ShopHome } from "./shop-home";
import { SiteFooter, StoryBlock } from "./site-footer";
import { ToastProvider, useToast } from "./toast";

export default function Storefront() {
  return (
    <ToastProvider>
      <StorefrontInner />
    </ToastProvider>
  );
}

const scrollToCollection = () =>
  setTimeout(() => document.getElementById("collection")?.scrollIntoView({ behavior: "smooth" }), 70);

function StorefrontInner() {
  const store = useStoreData();
  const bag = useBag();
  const likes = useLikes();
  const toast = useToast();

  const [category, setCategory] = useState("All pieces");
  const [query, setQuery] = useState("");
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [selected, setSelected] = useState<{ product: Product; size?: string } | null>(null);
  const [bagOpen, setBagOpen] = useState(false);

  // Coming back from login during checkout (/?bag=1): reopen the bag.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("bag") !== "1") return;
    url.searchParams.delete("bag");
    window.history.replaceState(null, "", url.pathname + url.search);
    const t = setTimeout(() => setBagOpen(true), 0);
    return () => clearTimeout(t);
  }, []);
  const [info, setInfo] = useState<InfoTopic | null>(null);

  function shop(c = "All pieces") {
    setCategory(c);
    setFavouritesOnly(false);
    setQuery("");
    scrollToCollection();
  }

  function search(q: string) {
    setQuery(q);
    setCategory("All pieces");
    setFavouritesOnly(false);
  }

  function add(size: string, quantity: number) {
    if (!selected) return;
    const problem = addToBag(bag, selected.product, size, quantity);
    if (problem) return toast(problem);
    setSelected(null);
    toast("A little favourite, added to your bag.");
    setBagOpen(true);
  }

  const showHome = !favouritesOnly && !query && category === "All pieces";

  return (
    <>
      <ShopHeader
        query={query}
        onQuery={search}
        onSubmitSearch={scrollToCollection}
        category={category}
        favouritesOnly={favouritesOnly}
        likesCount={likes.length}
        bagCount={bagTotals(bag, store.products).count}
        signedIn={!!store.viewer}
        onShop={shop}
        onFavourites={() => {
          shop();
          setFavouritesOnly(true);
        }}
        onOpenBag={() => setBagOpen(true)}
        onStory={() => setInfo("Our little story")}
      />
      <main>
        {store.preview && (
          <div className="admin-notice preview-notice">
            <span className="notice-dot" />
            Preview: the store owner hasn’t opened the shop yet, so ordering is switched off.
          </div>
        )}
        {showHome && <ShopHome products={store.products} onShop={shop} />}
        <Collection
          products={store.products}
          likes={likes}
          category={category}
          query={query}
          favouritesOnly={favouritesOnly}
          error={store.error}
          onCategory={(c) => {
            setCategory(c);
            setFavouritesOnly(false);
          }}
          onResetAll={() => {
            setCategory("All pieces");
            setQuery("");
            setFavouritesOnly(false);
          }}
          onRetry={store.refresh}
          onChoose={(product, size) => setSelected({ product, size })}
        />
        <StoryBlock onStory={() => setInfo("Our little story")} />
      </main>
      <SiteFooter onShop={shop} onInfo={setInfo} />

      {selected && (
        <ProductModal
          key={selected.product.id}
          product={selected.product}
          initialSize={selected.size}
          onClose={() => setSelected(null)}
          onAdd={add}
          onSizeGuide={() => setInfo("Size guide")}
        />
      )}
      {bagOpen && (
        <BagDrawer
          bag={bag}
          products={store.products}
          preview={store.preview}
          viewer={store.viewer}
          onClose={() => setBagOpen(false)}
          onBrowse={() => {
            setBagOpen(false);
            shop();
          }}
          onStockChanged={store.refresh}
        />
      )}
      {info && <InfoModal topic={info} onClose={() => setInfo(null)} />}
    </>
  );
}
