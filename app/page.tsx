import Link from "next/link";

export default function Home() {
  return (
    <div className="wrap stack">
      <section className="hero">
        <div className="eyebrow">Everyday ideas, meaningful impact</div>
        <h1>
          JazzWorld <em>AI Impact</em> Awards
        </h1>
        <p>
          Put forward an AI-led initiative you&apos;ve built or piloted — at any
          stage, from early concept to fully scaled.
        </p>
        <div className="btn-row" style={{ marginTop: 26 }}>
          <Link className="btn ghost" href="/submit">
            Submit an initiative
          </Link>
        </div>
      </section>
    </div>
  );
}
