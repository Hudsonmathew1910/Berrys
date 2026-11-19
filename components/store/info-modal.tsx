"use client";
import { X } from "lucide-react";
import { sizes } from "@/lib/catalog";
import { IconButton, Overlay } from "./modal";

export type InfoTopic = "Our little story" | "Size guide" | "Shipping & returns" | "Get in touch";

/**
 * Help pages. PLACEHOLDER copy: replace the size chart, shipping/returns
 * policy and contact details with Berry's real information before launch.
 */
export function InfoModal({ topic, onClose }: { topic: InfoTopic; onClose: () => void }) {
  return (
    <Overlay onClose={onClose}>
      <section className="info-modal modal" role="dialog" aria-modal="true" aria-label={topic}>
        <IconButton className="modal-close" label="Close information" onClick={onClose}>
          <X />
        </IconButton>
        <div className="eyebrow">A LITTLE HELP FROM BERRY’S</div>
        <h2>{topic}</h2>
        {topic === "Our little story" && (
          <>
            <p>
              Berry’s is a clothing brand for the everyday wonder of being little. Our collection brings
              together easy comfort, playful personality and pieces that make getting dressed a little
              happier.
            </p>
            <p>From slow mornings to big adventures, there’s a little favourite for every moment.</p>
          </>
        )}
        {topic === "Size guide" && (
          <>
            <p>Sizes vary by product. Check each product for current stock in every size.</p>
            <table>
              <thead>
                <tr>
                  <th>SIZE</th>
                  <th>AGE (GUIDE)</th>
                </tr>
              </thead>
              <tbody>
                {sizes.map((s) => (
                  <tr key={s}>
                    <td>{s}</td>
                    <td>To be confirmed</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>Garment measurements will be added with each product’s specifications.</p>
          </>
        )}
        {topic === "Shipping & returns" && (
          <>
            <p>
              Orders are packed and dispatched after payment is confirmed. You’ll receive your order number at
              checkout.
            </p>
            <p>
              Delivery timelines, shipping charges and the returns window will be published here before
              launch.
            </p>
          </>
        )}
        {topic === "Get in touch" && (
          <p>Customer support contact details will be added before the store opens to the public.</p>
        )}
      </section>
    </Overlay>
  );
}
