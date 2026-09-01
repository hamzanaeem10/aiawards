import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { getSession } from "@/lib/auth";
import AddReviewer from "./AddReviewer";
import ReviewerRow from "./ReviewerRow";

export default async function UsersPage() {
  const s = await getSession();
  if (!s || s.role !== "admin") redirect("/login");

  const reviewers = await db
    .select()
    .from(users)
    .where(eq(users.role, "reviewer"))
    .orderBy(asc(users.name));

  return (
    <div className="wrap stack">
      <div>
        <div className="eyebrow">Administration</div>
        <h1>Evaluators</h1>
        <Link className="eval-back" href="/admin">
          <span aria-hidden="true">←</span> Submissions
        </Link>
      </div>

      <AddReviewer />

      <div className="card">
        <div className="section-head">
          <span className="n">{reviewers.length}</span>
          <h2>Reviewers</h2>
        </div>
        {reviewers.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>None yet — add one above.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {reviewers.map((u) => (
                  <ReviewerRow
                    key={u.id}
                    userId={u.id}
                    name={u.name}
                    email={u.email}
                    active={u.active}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
