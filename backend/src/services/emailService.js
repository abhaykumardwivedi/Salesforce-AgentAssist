import nodemailer from 'nodemailer';

let cachedTransport;

// Email is optional. When SMTP is configured (any free provider: Gmail app
// password, Brevo, Resend SMTP, Mailtrap, self-hosted, ...) real mail is sent.
// When it is not configured, the app falls back to "log mode" so flows like
// password reset still work end to end in development without an external
// dependency: the message and any action link are printed to the server log.
export function emailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT);
}

function transport() {
  if (cachedTransport) return cachedTransport;
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return cachedTransport;
}

function fromAddress() {
  return process.env.EMAIL_FROM || process.env.SMTP_USER || 'no-reply@agentassist.local';
}

export async function sendEmail({ to, subject, text, html }) {
  if (!emailConfigured()) {
    console.log(`[email:log-mode] to=${to} subject="${subject}"\n${text}`);
    return { delivered: false, mode: 'log' };
  }
  await transport().sendMail({ from: fromAddress(), to, subject, text, html });
  return { delivered: true, mode: 'smtp' };
}

function appBaseUrl() {
  const origin = (process.env.APP_BASE_URL || process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
    .split(',')[0]
    .trim();
  return origin.replace(/\/$/, '');
}

export function passwordResetLink(token) {
  return `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

export function emailVerifyLink(token) {
  return `${appBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}

export function sendPasswordResetEmail(to, token) {
  const link = passwordResetLink(token);
  return sendEmail({
    to,
    subject: 'Reset your AgentAssist password',
    text: `We received a request to reset your password.\n\nReset it here: ${link}\n\nThis link expires in 60 minutes. If you did not request this, you can ignore this email.`,
    html: `<p>We received a request to reset your password.</p><p><a href="${link}">Reset your password</a></p><p>This link expires in 60 minutes. If you did not request this, you can ignore this email.</p>`,
  });
}

export function sendVerificationEmail(to, token) {
  const link = emailVerifyLink(token);
  return sendEmail({
    to,
    subject: 'Verify your AgentAssist email',
    text: `Welcome to AgentAssist. Confirm your email address here: ${link}\n\nThis link expires in 24 hours.`,
    html: `<p>Welcome to AgentAssist.</p><p><a href="${link}">Confirm your email address</a></p><p>This link expires in 24 hours.</p>`,
  });
}
