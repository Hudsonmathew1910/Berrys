import { redirect } from "next/navigation";

/** Moved into the single account page. */
export default function Page() {
  redirect("/account#favourites");
}
