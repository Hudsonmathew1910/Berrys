"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/components/store/api";
import { useToast } from "@/components/store/toast";
import { AddressFields, emptyAddress, readAddress } from "./address-form";
import type { SavedAddress } from "./checkout-view";

/** List, add, edit, delete and set-default for saved addresses. */
export function AddressesManager({ addresses }: { addresses: SavedAddress[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<SavedAddress | "new" | null>(addresses.length ? null : "new");
  const [busy, setBusy] = useState(false);

  async function run(task: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await task();
      toast(done);
      setEditing(null);
      router.refresh();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = readAddress(e.currentTarget);
    const id = editing && editing !== "new" ? editing.id : null;
    return run(
      () =>
        api(id ? `/api/account/addresses/${id}` : "/api/account/addresses", {
          method: id ? "PUT" : "POST",
          json: body,
        }),
      "Address saved.",
    );
  }

  const makeDefault = (a: SavedAddress) =>
    run(
      () => api(`/api/account/addresses/${a.id}`, { method: "PUT", json: { ...a, isDefault: true } }),
      "Default address updated.",
    );

  const remove = (a: SavedAddress) => {
    if (!window.confirm(`Delete the address for ${a.name}?`)) return;
    return run(() => api(`/api/account/addresses/${a.id}`, { method: "DELETE" }), "Address deleted.");
  };

  return (
    <>
      <div className="address-grid">
        {addresses.map((a) => (
          <div key={a.id} className={"address-card" + (a.isDefault ? " default" : "")}>
            <MapPin size={18} />
            <div>
              <b>{a.name}</b> {a.isDefault && <em className="tag">Default</em>}
              <p>
                {[a.line1, a.line2, a.city, a.state].filter(Boolean).join(", ")} — {a.pincode}
                <br />
                +91 {a.phone}
              </p>
              <div className="address-actions">
                <button className="text-link" disabled={busy} onClick={() => setEditing(a)}>
                  <Pencil size={13} /> Edit
                </button>
                {!a.isDefault && (
                  <button className="text-link" disabled={busy} onClick={() => makeDefault(a)}>
                    <Check size={13} /> Make default
                  </button>
                )}
                <button className="text-link danger" disabled={busy} onClick={() => remove(a)}>
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        {editing === null && (
          <button className="address-card add" onClick={() => setEditing("new")}>
            <Plus size={20} /> Add a new address
          </button>
        )}
      </div>

      {editing !== null && (
        <form
          className="account-card-box address-editor"
          onSubmit={save}
          key={editing === "new" ? "new" : editing.id}
        >
          <h2>{editing === "new" ? "Add a new address" : "Edit address"}</h2>
          <AddressFields initial={editing === "new" ? emptyAddress : editing} />
          <div className="edit-actions">
            {addresses.length > 0 && (
              <button type="button" className="outline" onClick={() => setEditing(null)}>
                Cancel
              </button>
            )}
            <button className="primary" disabled={busy}>
              {busy ? <Loader2 className="spin" size={16} /> : <Check size={16} />} Save address
            </button>
          </div>
        </form>
      )}
    </>
  );
}
