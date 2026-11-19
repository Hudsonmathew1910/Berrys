"use client";
import { useState } from "react";

/** Main photo with thumbnails (up to 6 photos per product). */
export function ProductGallery({ images, name, badge }: { images: string[]; name: string; badge: string }) {
  const [active, setActive] = useState(0);
  const current = images[active] ?? images[0];
  return (
    <div className="product-gallery">
      <div className="product-detail-photo">
        <img src={current} alt={name} />
        {badge && <span className="product-badge">{badge}</span>}
      </div>
      {images.length > 1 && (
        <div className="gallery-thumbs" role="list">
          {images.map((src, i) => (
            <button
              key={src + i}
              type="button"
              role="listitem"
              className={i === active ? "active" : ""}
              aria-label={`Photo ${i + 1} of ${images.length}`}
              onClick={() => setActive(i)}
            >
              <img src={src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
