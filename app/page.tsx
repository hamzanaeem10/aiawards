import Link from "next/link";
import { Logo } from "./components/Logo";
import "./landing.css";

const STEPS: [string, string][] = [
  ["01", "Submit your idea"],
  ["02", "Showcase your impact"],
  ["03", "Get recognized"],
];

export default function Home() {
  return (
    <main className="lp-page">
      <div className="lp-inner">
        <header className="lp-top">
          <span className="lp-logo">
            <Logo />
            <span className="lp-logo-txt">
              <b>JazzWorld</b>
              <span>AI Impact Awards</span>
            </span>
          </span>
        </header>

        <section className="lp-hero">
          <div className="lp-hero-art" aria-hidden="true">
            <svg viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="1">
              <circle cx="100" cy="100" r="30" />
              <circle cx="100" cy="100" r="55" opacity="0.7" />
              <circle cx="100" cy="100" r="80" opacity="0.45" />
              <circle cx="100" cy="100" r="99" opacity="0.25" />
              <path d="M100 100 L155 100 M100 100 L100 45 M100 100 L64 146" opacity="0.55" />
              <circle cx="100" cy="100" r="3" fill="currentColor" stroke="none" />
              <circle cx="155" cy="100" r="2.6" fill="currentColor" stroke="none" />
              <circle cx="100" cy="45" r="2.6" fill="currentColor" stroke="none" />
              <circle cx="64" cy="146" r="2.6" fill="currentColor" stroke="none" />
            </svg>
          </div>

          <div className="lp-hero-body">
            <div className="lp-eyebrow">Everyday ideas, meaningful impact</div>
            <h1>
              JazzWorld <span className="lp-accent">AI Impact</span> Awards
            </h1>
            <p>
              Put forward an AI-led initiative you&apos;ve built or piloted, at
              any stage, from early concept to fully scaled.
            </p>
            <Link className="lp-cta" href="/submit">
              Submit an initiative <span>→</span>
            </Link>
          </div>
        </section>

        <ol className="lp-steps">
          {STEPS.map(([n, t]) => (
            <li key={n}>
              <span className="lp-step-n">{n}</span>
              <span className="lp-step-t">{t}</span>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
