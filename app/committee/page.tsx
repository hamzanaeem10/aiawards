import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

/** Friendly entry point for the panel: /committee → queue, or sign-in. */
export default async function CommitteeHome() {
  const s = await getSession();
  if (s && (s.role === "reviewer" || s.role === "chair")) {
    redirect("/committee/queue");
  }
  if (s && s.role === "admin") redirect("/admin");
  redirect("/login");
}
