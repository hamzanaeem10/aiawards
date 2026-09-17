import nodemailer from "nodemailer";

// Jazz's internal Postfix relay (smtp.jazz.com.pk:25) takes mail from internal
// sources with no AUTH and no STARTTLS, so there are no mail credentials to
// hold. It is only reachable from inside the corporate network — the OpenShift
// pod egress must be permitted to reach it (see docs/SECURITY-REVIEW.md).
const HOST = process.env.SMTP_HOST || "smtp.jazz.com.pk";
const PORT = Number(process.env.SMTP_PORT) || 25;
const FROM =
  process.env.SMTP_FROM ||
  "JazzWorld AI Impact Awards <noreply@jazz.com.pk>";

export const MAIL_ENABLED = !!HOST;

let cached: nodemailer.Transporter | null = null;

function transport() {
  if (cached) return cached;
  cached = nodemailer.createTransport({
    host: HOST,
    port: PORT,
    // Port 25 on this relay offers neither STARTTLS nor AUTH. `secure: false`
    // with ignoreTLS keeps nodemailer from trying to upgrade and failing.
    secure: false,
    ignoreTLS: true,
    requireTLS: false,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 20_000,
  });
  return cached;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  await transport().sendMail({
    from: FROM,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}

/** The sign-in code email. The code is never logged, only mailed. */
export function loginCodeEmail(code: string, minutes: number) {
  const subject = `${code} is your AI Impact Awards sign-in code`;

  const text = [
    `Your sign-in code for the JazzWorld AI Impact Awards portal is:`,
    ``,
    `    ${code}`,
    ``,
    `It expires in ${minutes} minutes and can be used once.`,
    ``,
    `If you didn't try to sign in, you can ignore this email — no one can`,
    `access the portal without this code.`,
  ].join("\n");

  // Inline styles + a table shell: Outlook is the primary client here.
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f7f3f0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f3f0;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e7e0dd;border-radius:16px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#3d0335 0%,#7c0733 62%,#a5194f 100%);padding:22px 28px;">
          <div style="font:600 15px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;color:#ffffff;letter-spacing:.01em;">JazzWorld</div>
          <div style="font:400 11px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:rgba(255,255,255,.72);letter-spacing:.14em;text-transform:uppercase;margin-top:3px;">AI Impact Awards</div>
        </td></tr>
        <tr><td style="padding:32px 28px 8px;">
          <p style="margin:0 0 20px;font:400 15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#4c454a;">Here is your sign-in code.</p>
          <div style="font:700 34px/1 -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.22em;color:#7c0733;background:#f9f2f4;border:1px solid #f0d7e0;border-radius:11px;padding:20px 0;text-align:center;">${code}</div>
          <p style="margin:20px 0 0;font:400 13px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#857c81;">Expires in ${minutes} minutes. Can be used once.</p>
        </td></tr>
        <tr><td style="padding:20px 28px 30px;">
          <p style="margin:0;padding-top:18px;border-top:1px solid #f0ebe8;font:400 12px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#857c81;">
            If you didn't try to sign in, ignore this email — the portal cannot be accessed without this code.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, text, html };
}
