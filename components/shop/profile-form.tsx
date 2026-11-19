"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { api } from "@/components/store/api";
import { useToast } from "@/components/store/toast";

/** Name and contact mobile number. */
export function ProfileForm({ initialName, initialPhone }: { initialName: string; initialPhone: string }) {
  const router = useRouter();
  const toast = useToast();
  const startPhone = initialPhone.replace(/^\+91/, "");
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(startPhone);
  const [busy, setBusy] = useState(false);
  const changed = name.trim() !== initialName || phone.trim() !== startPhone;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/account/profile", { method: "PATCH", json: { name, phone } });
      toast("Your details are saved.");
      router.refresh();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="profile-form" onSubmit={save}>
      <label>
        Your name
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoComplete="name" />
      </label>
      <label>
        Mobile number
        <div className="phone-input">
          <span>+91</span>
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="98765 43210"
            pattern="(\+91|0)?[6-9][0-9 -]{9,11}"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <small className="muted">Used for delivery updates and pre-filled at checkout.</small>
      </label>
      <button className="primary" disabled={busy || !changed}>
        {busy ? <Loader2 className="spin" size={15} /> : <Check size={15} />} Save details
      </button>
    </form>
  );
}
