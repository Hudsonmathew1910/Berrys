import type { Metadata } from "next";
import { listAddresses } from "@/lib/addresses";
import { getViewer } from "@/lib/auth";
import { AddressesManager } from "@/components/shop/addresses-manager";

export const metadata: Metadata = { title: "Addresses — Berry’s", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AddressesPage() {
  const viewer = (await getViewer())!;
  const addresses = await listAddresses(viewer.userId);
  return (
    <>
      <h1 className="page-title">Saved addresses</h1>
      <AddressesManager
        addresses={addresses.map(({ id, name, phone, line1, line2, city, state, pincode, isDefault }) => ({
          id,
          name,
          phone,
          line1,
          line2,
          city,
          state,
          pincode,
          isDefault,
        }))}
      />
    </>
  );
}
