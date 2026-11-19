import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { AccountNav } from "@/components/shop/account-nav";

/** Every /account page: requires login, shows the account sidebar. */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/account");
  return (
    <div className="page-section account-layout">
      <AccountNav name={viewer.name || viewer.email || "Your account"} avatar={viewer.avatarUrl} />
      <div className="account-content">{children}</div>
    </div>
  );
}
