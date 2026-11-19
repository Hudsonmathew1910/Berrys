import type { Metadata } from "next";
import AdminApp from "@/components/admin/admin-app";

export const metadata: Metadata = { title: "Store admin — Berry’s", robots: { index: false } };

export default function Page() {
  return <AdminApp />;
}
