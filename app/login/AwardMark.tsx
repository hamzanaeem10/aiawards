/**
 * The sign-in panel's mark: a laurel drawn in hairline, blooming leaf by leaf.
 *
 * Geometry is computed here rather than hand-drawn so the two branches mirror
 * exactly. Deterministic — no randomness — so the server and client agree.
 *
 * Motion is opacity and transform only, so the bloom stays on the compositor.
 */

const CX = 150;
const CY = 172;
const R = 112;
const N = 10; // leaves per branch

const rad = (d: number) => (d * Math.PI) / 180;
const px = (d: number) => CX + R * Math.cos(rad(d));
const py = (d: number) => CY + R * Math.sin(rad(d));

// Both branches sweep up their own side from the foot, starting just past the
// bottom of the circle so their stems cross where a wreath would be tied.
const L_FROM = 82;
const L_TO = 216;
const R_FROM = 98;
const R_TO = -36;

type Leaf = { x: number; y: number; a: number; s: number; d: number };

function branch(from: number, to: number, right: boolean): Leaf[] {
  return Array.from({ length: N }, (_, i) => {
    const t = (i + 0.6) / N;
    const deg = from + t * (to - from);
    // Tangent is θ±90; splaying 34° back off it lifts the leaf off the stem.
    const a = right ? deg - 90 + 34 : deg + 90 - 34;
    return { x: px(deg), y: py(deg), a, s: 1 - t * 0.46, d: i * 0.055 };
  });
}

const LEFT = branch(L_FROM, L_TO, false);
const RIGHT = branch(R_FROM, R_TO, true);

// sweep-flag follows the direction θ travels: 1 for increasing, 0 for decreasing.
const STEM_L = `M ${px(L_FROM)} ${py(L_FROM)} A ${R} ${R} 0 0 1 ${px(L_TO)} ${py(L_TO)}`;
const STEM_R = `M ${px(R_FROM)} ${py(R_FROM)} A ${R} ${R} 0 0 0 ${px(R_TO)} ${py(R_TO)}`;

// A single leaf, drawn from its attachment point at the origin.
const LEAF = "M0 0 C 8 -5.4 20 -6 28 0 C 20 6 8 5.4 0 0 Z";

// The star the laurel opens onto, seated just above the branch tips.
const SY = CY - R * 0.95;
const star = () =>
  Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? 11 : 27;
    const a = rad(-90 + i * 36);
    return `${(CX + r * Math.cos(a)).toFixed(1)} ${(SY + r * Math.sin(a)).toFixed(1)}`;
  }).join(" L ");

export default function AwardMark() {
  return (
    <div className="mark-wrap" aria-hidden="true">
      <svg className="mark-svg" viewBox="0 0 300 300" fill="none">
        <g className="mark-laurel">
          <path className="mark-stem" d={STEM_L} />
          <path className="mark-stem" d={STEM_R} />

          {[...LEFT, ...RIGHT].map((l, i) => (
            <g key={i} transform={`translate(${l.x} ${l.y}) rotate(${l.a}) scale(${l.s})`}>
              <path className="mark-leaf" d={LEAF} style={{ animationDelay: `${0.45 + l.d}s` }} />
            </g>
          ))}

          <path className="mark-star" d={`M ${star()} Z`} />
        </g>
      </svg>
    </div>
  );
}
