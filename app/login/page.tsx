import { redirect } from "next/navigation";
import { verifyLogin, createSession, getSession } from "@/lib/auth";

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
    <div className="wrap narrow stack">
      <div>
        <div className="eyebrow">Awards panel &amp; administration</div>
        <h1>Sign in</h1>
      </div>
      {e && <div className="notice n-danger">Incorrect email or password.</div>}
      <form action={login} className="card pad-lg">
        <div className="field">
          <label className="flabel">Email</label>
          <input type="email" name="email" required autoFocus />
        </div>
        <div className="field">
          <label className="flabel">Password</label>
          <input type="password" name="password" required />
        </div>
        <button className="btn" style={{ width: "100%", justifyContent: "center" }}>
          Sign in
        </button>
      </form>
    </div>
  );
}
