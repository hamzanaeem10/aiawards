import { redirect } from "next/navigation";
import {
  clearPendingLogin,
  createSession,
  getPendingLogin,
  getSession,
  homeFor,
  signInByEmail,
} from "@/lib/auth";
import { CODE_LENGTH, CODE_TTL_MINUTES, verifyCode } from "@/lib/otp";
import { Logo } from "../../components/Logo";
import AwardMark from "../AwardMark";
import CodeForm from "./CodeForm";

// Step 2: the code proves control of the mailbox, so the session is issued here.
async function submitCode(formData: FormData) {
  "use server";
  const pending = await getPendingLogin();
  if (!pending) redirect("/login?e=expired");

  const result = await verifyCode(
    pending.codeId,
    pending.email,
    String(formData.get("code") || ""),
  );

  if (!result.ok) {
    if (result.reason === "invalid") redirect("/login/verify?e=invalid");
    // Expired or burned: the code is gone, so start over.
    await clearPendingLogin();
    redirect(`/login?e=${result.reason === "expired" ? "expired" : "attempts"}`);
  }

  // Only now does an account get created or fetched.
  const user = await signInByEmail(pending.email);
  if (!user) {
    await clearPendingLogin();
    redirect("/login?e=inactive");
  }

  await clearPendingLogin();
  await createSession(user);
  redirect(homeFor(user.role));
}

async function startOver() {
  "use server";
  await clearPendingLogin();
  redirect("/login");
}

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const existing = await getSession();
  if (existing) redirect(homeFor(existing.role));

  const pending = await getPendingLogin();
  if (!pending) redirect("/login");

  const { e } = await searchParams;

  // Show enough of the address to reassure, not enough to leak it.
  const [local, domain] = pending.email.split("@");
  const masked =
    (local.length <= 2 ? local[0] + "•" : local.slice(0, 2) + "•".repeat(Math.min(local.length - 2, 6))) +
    "@" +
    domain;

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
          <h1>Check your email</h1>
          <p className="auth-lede">
            We sent a {CODE_LENGTH}-digit code to <b>{masked}</b>. It expires in{" "}
            {CODE_TTL_MINUTES} minutes.
          </p>

          {e === "invalid" && (
            <div className="notice n-danger" role="alert">
              That code isn&apos;t right. Check the email and try again.
            </div>
          )}

          <CodeForm action={submitCode} length={CODE_LENGTH} />

          <form action={startOver}>
            <button type="submit" className="auth-link">
              Use a different email address
            </button>
          </form>

          <p className="auth-foot">
            The code can be used once. If it doesn&apos;t arrive within a minute,
            check your junk folder.
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
