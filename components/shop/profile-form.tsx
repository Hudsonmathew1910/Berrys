"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { api } from "@/components/store/api";
import { useToast } from "@/components/store/toast";

export function ProfileForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/account/profile", { method: "PATCH", json: { name } });
      toast("Your details are saved.");
      router.refresh();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={save}>
      <label>
        Your name
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
      </label>
      <button className="outline" disabled={busy || name.trim() === initialName}>
        {busy ? <Loader2 className="spin" size={15} /> : <Check size={15} />} Save
      </button>
    </form>
  );
}
