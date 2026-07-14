import nodemailer from 'nodemailer';

function getTransporter() {
  const host = process.env.SMTP_HOST;
  if (!host) return null; // no SMTP configured → log instead of send
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

const FROM = process.env.SMTP_FROM || 'noreply@hhscholars.org';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
// The editorial inbox notified whenever a new proof is ready to review.
const EDITOR_EMAIL = process.env.EDITOR_EMAIL || 'editor@hhscholars.org';

function escHtml(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// On each new submission, notify the editorial team that a formatted proof is
// ready to review. No automated emails are sent to students.
export async function sendProofReadyNotification(
  rawTitle: string,
  rawAuthor: string,
  submissionId: string,
) {
  const transporter = getTransporter();
  const previewUrl = `${BASE_URL}/preview/${submissionId}`;
  const adminUrl = `${BASE_URL}/admin/${submissionId}`;
  const title = escHtml(rawTitle);
  const author = escHtml(rawAuthor);

  if (!transporter) {
    console.log(`[email] Would notify ${EDITOR_EMAIL}: proof ready — "${rawTitle}" by ${rawAuthor} — ${previewUrl}`);
    return;
  }

  await transporter.sendMail({
    from: FROM,
    to: EDITOR_EMAIL,
    subject: `New proof ready: ${rawTitle}`,
    html: `
      <p>A new submission has been received and a formatted proof is ready to review.</p>
      <p><strong>Title:</strong> ${title}<br/>
      <strong>Author:</strong> ${author}</p>
      <p>Preview the formatted article:<br/><a href="${previewUrl}">${previewUrl}</a></p>
      <p>Open in the editor dashboard:<br/><a href="${adminUrl}">${adminUrl}</a></p>
    `,
  });
}
