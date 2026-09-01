"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";

type Session = { role: string; name: string } | null;

export function SiteHeader({
  session,
  logout,
}: {
  session: Session;
  logout: () => void;
}) {
  const path = usePathname();
  const is = (p: string) => path === p || path.startsWith(p + "/");

  // The landing page is a full-bleed page with no site chrome of its own.
  if (path === "/") return null;

  // The staff area: sign-in, the evaluation queue, and admin.
  const staffArea = is("/login") || is("/committee") || is("/admin");

  // --- Staff header: only ever shown to a signed-in evaluator / admin -----
  if (session && staffArea) {
    return (
      <header className="site-header staff">
        <div className="bar">
          <Link href="/committee/queue" className="logo" aria-label="JazzWorld AI Impact Awards">
            <Logo />
            <span className="lock">
              <b>JazzWorld</b>
              <span>Awards · committee</span>
            </span>
          </Link>
          <nav className="nav">
            <Link href="/committee/queue" className={is("/committee") ? "active" : ""}>
              Evaluate
            </Link>
            {session.role === "admin" && (
              <>
                <Link
                  href="/admin"
                  className={is("/admin") && !is("/admin/users") ? "active" : ""}
                >
                  Admin
                </Link>
                <Link
                  href="/admin/users"
                  className={is("/admin/users") ? "active" : ""}
                >
                  Evaluators
                </Link>
              </>
            )}
            <form action={logout}>
              <button type="submit">Sign out</button>
              <span className="who">{session.name}</span>
            </form>
          </nav>
        </div>
      </header>
    );
  }

  // --- Public header: nominees only, no evaluator surface at all ----------
  return (
    <header className={is("/submit") ? "site-header focused" : "site-header"}>
      <div className="bar">
        <Link href="/" className="logo" aria-label="JazzWorld AI Impact Awards — home">
          <Logo />
          <span className="lock">
            <b>JazzWorld</b>
            <span>AI Impact Awards</span>
          </span>
        </Link>
        {is("/submit") && <span className="who-quiet">Nomination in progress</span>}
      </div>
    </header>
  );
}
