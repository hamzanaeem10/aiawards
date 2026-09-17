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

  // Full-bleed pages that carry their own brand mark: the landing page, and
  // every step of the split-screen sign-in. `is()` covers /login/verify too —
  // matching "/login" exactly used to let this header stack on top of the
  // verify page's own lockup.
  if (path === "/" || is("/login")) return null;

  // The staff area: the evaluation queue and admin (sign-in already returned).
  const staffArea = is("/committee") || is("/admin");

  // Approvers both score and sign off, so they get the Evaluate tab as well as
  // Approvals. Their landing page stays /admin — the aggregate view is where
  // their decision is recorded.
  const isAdmin = session?.role === "admin";
  const isApprover = session?.role === "approver";

  // --- Staff header: signed-in evaluator / approver / admin ---------------
  if (session && staffArea) {
    return (
      <header className="site-header staff">
        <div className="bar">
          <Link
            href={isApprover ? "/admin" : "/committee/queue"}
            className="logo"
            aria-label="JazzWorld AI Impact Awards"
          >
            <Logo />
            <span className="lock">
              <b>JazzWorld</b>
              <span>{isApprover ? "Awards · approvals" : "Awards · committee"}</span>
            </span>
          </Link>
          <nav className="nav">
            <Link href="/committee/queue" className={is("/committee") ? "active" : ""}>
              Evaluate
            </Link>
            {(isAdmin || isApprover) && (
              <Link
                href="/admin"
                className={is("/admin") && !is("/admin/users") ? "active" : ""}
              >
                {isApprover ? "Approvals" : "Admin"}
              </Link>
            )}
            {isAdmin && (
              <Link href="/admin/users" className={is("/admin/users") ? "active" : ""}>
                Evaluators
              </Link>
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
  // Nominees hold a session now that sign-in is email-only, so they need a way
  // out; without this the only way to switch accounts is clearing cookies.
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
        {session ? (
          <nav className="nav">
            <form action={logout}>
              <button type="submit">Sign out</button>
              <span className="who">{session.name}</span>
            </form>
          </nav>
        ) : (
          is("/submit") && <span className="who-quiet">Nomination in progress</span>
        )}
      </div>
    </header>
  );
}
