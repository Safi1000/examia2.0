import { redirect } from "next/navigation";

/** /start was an Instagram bio page; Hamza chose the homepage instead (22 Nov 2026). Old links land there. */
export default function StartPage() {
  redirect("/");
}
