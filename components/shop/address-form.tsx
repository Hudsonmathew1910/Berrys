"use client";
import { indianStates } from "@/lib/validation";

export type AddressValues = {
  name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
};

export const emptyAddress: AddressValues = {
  name: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  pincode: "",
  isDefault: false,
};

/** Read an address out of a <form> containing <AddressFields />. */
export function readAddress(form: HTMLFormElement): AddressValues {
  const f = new FormData(form);
  const v = (k: string) => String(f.get(k) ?? "").trim();
  return {
    name: v("name"),
    phone: v("phone"),
    line1: v("line1"),
    line2: v("line2"),
    city: v("city"),
    state: v("state"),
    pincode: v("pincode"),
    isDefault: f.get("isDefault") === "on",
  };
}

/** Delivery address inputs (used at checkout and in My account → Addresses). */
export function AddressFields({
  initial = emptyAddress,
  showDefault = true,
}: {
  initial?: AddressValues;
  showDefault?: boolean;
}) {
  return (
    <div className="address-fields">
      <label>
        Full name
        <input
          name="name"
          required
          minLength={2}
          maxLength={100}
          autoComplete="name"
          defaultValue={initial.name}
        />
      </label>
      <label>
        Mobile number
        <input
          name="phone"
          required
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          pattern="(\+91|0)?[6-9][0-9]{9}"
          placeholder="10-digit mobile number"
          defaultValue={initial.phone.replace(/^\+91/, "")}
        />
      </label>
      <label className="wide">
        House / flat, street
        <input
          name="line1"
          required
          minLength={5}
          maxLength={200}
          autoComplete="address-line1"
          defaultValue={initial.line1}
        />
      </label>
      <label className="wide">
        Area, landmark (optional)
        <input name="line2" maxLength={200} autoComplete="address-line2" defaultValue={initial.line2} />
      </label>
      <label>
        City
        <input
          name="city"
          required
          minLength={2}
          maxLength={80}
          autoComplete="address-level2"
          defaultValue={initial.city}
        />
      </label>
      <label>
        State
        <select name="state" required autoComplete="address-level1" defaultValue={initial.state}>
          <option value="" disabled>
            Choose state
          </option>
          {indianStates.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        PIN code
        <input
          name="pincode"
          required
          inputMode="numeric"
          autoComplete="postal-code"
          pattern="[1-9][0-9]{5}"
          maxLength={6}
          defaultValue={initial.pincode}
        />
      </label>
      {showDefault && (
        <label className="check wide">
          <input type="checkbox" name="isDefault" defaultChecked={initial.isDefault} /> Make this my default
          address
        </label>
      )}
    </div>
  );
}
