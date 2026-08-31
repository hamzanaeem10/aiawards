import "./globals.css";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, destroySession } from "@/lib/auth";
import { SiteHeader } from "./components/SiteHeader";

export const metadata: Metadata = {
  title: "JazzWorld AI Impact Awards",
  description: "Nomination submission and evaluation committee portal",
};

async function logout() {
  "use server";
  await destroySession();
  redirect("/login");
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const s = await getSession();
  return (
    <html lang="en">
      <body>
        <SiteHeader
          session={s ? { role: s.role, name: s.name } : null}
          logout={logout}
        />
        {children}
      </body>
    </html>
  );
}
