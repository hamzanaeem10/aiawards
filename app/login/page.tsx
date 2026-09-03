import { redirect } from "next/navigation";
import { verifyLogin, createSession, getSession } from "@/lib/auth";
import { Logo } from "../components/Logo";
import AwardMark from "./AwardMark";

async function login(formData: FormData) {
  "use server";
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const u = await verifyLogin(email, password);
  if (!u) redirect("/login?e=1");
  await createSession(u);
  redirect(
    u.role === "nominee"
      ? "/submit"
      : u.role === "admin"
        ? "/admin"
        : "/committee/queue",
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const existing = await getSession();
  if (existing) redirect(existing.role === "admin" ? "/admin" : "/committee/queue");
  const { e } = await searchParams;

  return (
    <div className="auth">
      <a href="/" className="logo auth-brand">
        <Logo />
        <span className="lock">
          <b>JazzWorld</b>
          <span>AI Impact Awards</span>
        </span>
      </a>

      <div className="auth-form">
        <div className="auth-inner">
          <h1>Sign in</h1>

          {e && (
            <div className="notice n-danger" role="alert">
              That email and password don&apos;t match an account.
            </div>
          )}

          <form action={login} className="auth-fields">
            <div className="field">
              <label className="flabel" htmlFor="email">
                Email
              </label>
              <input id="email" type="email" name="email" required autoFocus autoComplete="email" />
            </div>
            <div className="field">
              <label className="flabel" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                name="password"
                required
                autoComplete="current-password"
              />
            </div>
            <button className="btn auth-submit" type="submit">
              Sign in
            </button>
          </form>

          <p className="auth-foot">
            Evaluators and administrators only. An administrator can issue you a
            new password.
          </p>
        </div>
      </div>

      <aside className="auth-panel">
        <div className="auth-panel-inner">
          <AwardMark />
          <p className="auth-panel-line">
            Recognising the work that moves us forward.
          </p>
        </div>
      </aside>
    </div>
  );
}
