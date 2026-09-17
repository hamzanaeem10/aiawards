/**
 * Team members on a submission.
 *
 * `submissions.data` is free-form jsonb, and `data.teamMembers` has had two
 * shapes over the life of the form:
 *
 *   legacy  "Asha — Data Science\nBilal — Engineering"   (one free-text block)
 *   current [{ name: "Asha", contribution: "Ideation" }, …]
 *
 * Rows written before the change still hold the string, so every reader must
 * cope with both. `teamMembersText` is the single normaliser — use it anywhere
 * the value is rendered or serialised, or a legacy row will print
 * "[object Object]".
 */

/**
 * What a team member did.
 *
 * "Sponsor" was dropped at the stakeholder's request: Section 2 already has a
 * required `Project owner / sponsor` field, so offering it here let one
 * submission name two different sponsors with no way to reconcile them. This
 * also matches the original note, which asked for three options.
 *
 * Any value stored before that decision still renders — `teamMembersText`
 * prints whatever is on the row — but it can no longer be submitted, because
 * `readTeamMembers` accepts only the values listed here.
 */
export const CONTRIBUTIONS = [
  "Ideation",
  "Development",
  "Ideation and Development",
] as const;

export type Contribution = (typeof CONTRIBUTIONS)[number];

export type TeamMember = {
  name: string;
  /** One of CONTRIBUTIONS, or "" when the submitter left it unset. */
  contribution: string;
};

function isMember(v: unknown): v is TeamMember {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as TeamMember).name === "string" &&
    (v as TeamMember).name.trim() !== ""
  );
}

/**
 * The structured list, or [] for a legacy string (which carries no structure to
 * recover). Callers that want to render legacy rows should fall back to
 * `teamMembersText`.
 */
export function asTeamMemberList(v: unknown): TeamMember[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isMember).map((m) => ({
    name: m.name.trim(),
    contribution: typeof m.contribution === "string" ? m.contribution.trim() : "",
  }));
}

/**
 * A display string for either shape.
 *   legacy string -> returned unchanged
 *   structured    -> "Asha (Ideation); Bilal (Development)"
 *   empty/absent  -> ""
 */
export function teamMembersText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();

  if (Array.isArray(v)) {
    const structured = asTeamMemberList(v);
    if (structured.length) {
      return structured
        .map((m) => (m.contribution ? `${m.name} (${m.contribution})` : m.name))
        .join("; ");
    }
    // Defensive: an array of plain strings from some other writer.
    return v.map((x) => String(x).trim()).filter(Boolean).join("; ");
  }

  return String(v).trim();
}

/**
 * Zip the parallel `teamMemberName` / `teamMemberContribution` form fields into
 * the stored shape.
 *
 * Rows with a blank name are dropped, so the blank rows the form always renders
 * cost nothing. A contribution outside CONTRIBUTIONS is discarded rather than
 * stored — the value reaches us from the client and is displayed to the panel.
 *
 * Pure, so the zipping and filtering can be tested without a FormData.
 */
export function readTeamMembers(
  names: readonly string[],
  contributions: readonly string[],
): TeamMember[] {
  const allowed = new Set<string>(CONTRIBUTIONS);
  return names
    .map((raw, i) => {
      const name = String(raw ?? "").trim();
      const c = String(contributions[i] ?? "").trim();
      return { name, contribution: allowed.has(c) ? c : "" };
    })
    .filter((m) => m.name !== "");
}
