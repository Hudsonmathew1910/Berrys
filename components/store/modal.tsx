"use client";
import { useEffect } from "react";

export function IconButton({
  label,
  onClick,
  children,
  className = "",
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={"icon-btn " + className}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Closes on Escape and locks page scroll while mounted. */
export function useOverlayBehaviour(onClose?: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);
}

/** Dimmed backdrop; clicking it (but not the content) closes. */
export function Overlay({
  onClose,
  className = "",
  children,
}: {
  onClose?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  useOverlayBehaviour(onClose);
  return (
    <div className={"overlay " + className} onClick={onClose}>
      <div style={{ display: "contents" }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
