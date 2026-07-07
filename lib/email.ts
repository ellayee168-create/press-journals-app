import nodemailer from 'nodemailer';

function getTransporter() {
  const host = process.env.SMTP_HOST;
  if (!host) {
    // Return null-ish transporter that logs instead of sending
    return null;
  }
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const FROM = process.env.SMTP_FROM || 'noreply@press-journals.org';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

export async function sendStudentConfirmation(
  to: string,
  firstName: string,
  submissionId: string,
) {
  const transporter = getTransporter();
  const previewUrl = `${BASE_URL}/preview/${submissionId}`;
  const statusUrl = `${BASE_URL}/status/${submissionId}`;

  if (!transporter) {
    console.log(`[email] Would send student confirmation to ${to} — preview: ${previewUrl}`);
    return;
  }

  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'Your PRESS Journals submission has been received',
    html: `
      <p>Dear ${firstName},</p>
      <p>Thank you for submitting your article to <strong>PRESS Journals</strong>. Your submission has been received and is under review.</p>
      <p>You can preview your formatted article here:<br/>
      <a href="${previewUrl}">${previewUrl}</a></p>
      <p>Check your submission status anytime here:<br/>
      <a href="${statusUrl}">${statusUrl}</a></p>
      <p>You will be notified within two weeks of the submission deadline about your acceptance status.</p>
      <p>Best,<br/>The PRESS Journals Editorial Team</p>
    `,
  });
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function sendDecisionEmail(
  to: string,
  firstName: string,
  rawTitle: string,
  decision: 'accepted' | 'rejected',
  rawNote?: string,
) {
  const title = escHtml(rawTitle);
  const note = rawNote ? escHtml(rawNote) : undefined;
  const transporter = getTransporter();
  const subject =
    decision === 'accepted'
      ? 'Your PRESS Journals submission has been accepted!'
      : 'Update on your PRESS Journals submission';

  const body =
    decision === 'accepted'
      ? `<p>Dear ${firstName},</p>
         <p>Congratulations! Your article <strong>"${title}"</strong> has been <strong>accepted</strong> for publication in PRESS Journals.</p>
         ${note ? `<p><em>A note from the editors:</em><br/>${note.replace(/\n/g, '<br/>')}</p>` : ''}
         <p>You will receive further details about the upcoming issue soon.</p>
         <p>Best,<br/>The PRESS Journals Editorial Team</p>`
      : `<p>Dear ${firstName},</p>
         <p>Thank you for submitting your article <strong>"${title}"</strong> to PRESS Journals. After careful review, we are unable to accept it for publication at this time.</p>
         ${note ? `<p><em>Feedback from the editors:</em><br/>${note.replace(/\n/g, '<br/>')}</p>` : ''}
         <p>We encourage you to revise and submit again in a future cycle.</p>
         <p>Best,<br/>The PRESS Journals Editorial Team</p>`;

  if (!transporter) {
    console.log(`[email] Would send ${decision} email to ${to} for "${title}"${note ? ` with note: ${note}` : ''}`);
    return;
  }

  await transporter.sendMail({ from: FROM, to, subject, html: body });
}

export async function sendGuardianNotification(
  to: string,
  studentName: string,
  submissionId: string,
) {
  const transporter = getTransporter();
  const previewUrl = `${BASE_URL}/preview/${submissionId}`;

  if (!transporter) {
    console.log(`[email] Would send guardian notification to ${to} — preview: ${previewUrl}`);
    return;
  }

  await transporter.sendMail({
    from: FROM,
    to,
    subject: `PRESS Journals: ${studentName} has submitted an article`,
    html: `
      <p>Dear Parent/Guardian,</p>
      <p>This is to let you know that <strong>${studentName}</strong> has submitted a research article to PRESS Journals.</p>
      <p>You can preview the formatted article here:<br/>
      <a href="${previewUrl}">${previewUrl}</a></p>
      <p>Best,<br/>The PRESS Journals Editorial Team</p>
    `,
  });
}
