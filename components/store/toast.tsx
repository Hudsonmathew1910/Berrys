"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

const ToastContext = createContext<(message: string) => void>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState("");
  const show = useCallback((m: string) => setMessage(m), []);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 3500);
    return () => clearTimeout(t);
  }, [message]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {message && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {message}
          <button aria-label="Dismiss notification" onClick={() => setMessage("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
