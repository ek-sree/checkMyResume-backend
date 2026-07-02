import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import type { IPayment } from '../models/Payment';

/**
 * Email notifications. When SMTP is configured we send real mail; otherwise we
 * log the message so the feature is fully demonstrable without any provider.
 */
let transporter: Transporter | null = null;
if (env.email.enabled) {
  transporter = nodemailer.createTransport({
    host: env.email.host,
    port: env.email.port,
    secure: env.email.port === 465,
    auth: { user: env.email.user, pass: env.email.pass },
  });
  logger.info('SMTP configured — email notifications are live.');
} else {
  logger.info('SMTP not configured — emails will be logged to the console.');
}

interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: { filename: string; content: Buffer }[];
}

async function send(mail: Mail): Promise<void> {
  if (!transporter) {
    logger.info(`[email:dev] To: ${mail.to} | Subject: ${mail.subject}\n${mail.text}`);
    return;
  }
  try {
    await transporter.sendMail({ from: env.email.from, ...mail });
    logger.info(`Email sent to ${mail.to}: ${mail.subject}`);
  } catch (err) {
    logger.warn('Email send failed:', (err as Error).message);
  }
}

/** Escape user-provided text before embedding it in HTML email. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const shell = (heading: string, body: string) => `
  <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#0F172A">
    <h2 style="margin:0 0 8px">${heading}</h2>
    <div style="color:#334155;line-height:1.6">${body}</div>
    <p style="margin-top:24px;color:#94A3B8;font-size:12px">— ${env.appName}</p>
  </div>`;

export async function sendOtpEmail(
  to: string,
  code: string,
  purpose: 'verify' | 'reset' | 'change-email'
): Promise<void> {
  const what = {
    verify: 'verify your email',
    reset: 'reset your password',
    'change-email': 'confirm your new email',
  }[purpose];
  await send({
    to,
    subject: `${env.appName} code: ${code}`,
    text: `Your code to ${what} is ${code}. It expires in 10 minutes.`,
    html: shell(
      'Your verification code',
      `<p>Use this code to ${what}:</p>
       <p style="font-size:34px;font-weight:700;letter-spacing:10px;margin:16px 0">${esc(code)}</p>
       <p style="color:#94A3B8">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>`
    ),
  });
}

export async function sendNewUserAdminEmail(
  admins: string[],
  user: { name: string; email: string; plan: string; provider: string }
): Promise<void> {
  if (!admins.length) return;
  await send({
    to: admins.join(','),
    subject: `New ${env.appName} signup: ${user.name}`,
    text: `New user: ${user.name} <${user.email}> · signed up via ${user.provider} · ${user.plan} plan.`,
    html: shell(
      'New user signed up 🎉',
      `<p><strong>${esc(user.name)}</strong> just created an account.</p>
       <p>Email: ${esc(user.email)}<br/>Method: ${esc(user.provider)}<br/>Plan: ${esc(user.plan)}</p>
       <p><a href="${env.clientUrl}/admin/users" style="display:inline-block;margin-top:8px;background:#4F46E5;color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none">View in admin →</a></p>`
    ),
  });
}

export async function sendNotificationEmail(to: string, subject: string, message: string): Promise<void> {
  await send({
    to,
    subject,
    text: message,
    html: shell(esc(subject), `<p style="white-space:pre-wrap">${esc(message)}</p>`),
  });
}

export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  await send({
    to,
    subject: `Welcome to ${env.appName} 🔨`,
    text: `Hi ${name}, welcome to ${env.appName}! You have free credits to analyze your first job. Head to ${env.clientUrl}/analyze to start.`,
    html: shell(
      `Welcome, ${name} 👋`,
      `You're in. Your account comes with free AI runs — upload a resume, paste a job, and watch your AI coach get to work.
       <p><a href="${env.clientUrl}/analyze" style="display:inline-block;margin-top:12px;background:#4F46E5;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none">Analyze your first job →</a></p>`
    ),
  });
}

export async function sendInvoiceEmail(
  to: string,
  name: string,
  payment: IPayment,
  pdf: Buffer
): Promise<void> {
  await send({
    to,
    subject: `Your ${env.appName} invoice — ${payment.invoiceNumber}`,
    text: `Hi ${name}, thanks for subscribing to ${payment.planName}. Invoice ${payment.invoiceNumber} for Rs. ${payment.amount} is attached.`,
    html: shell(
      'Payment received ✅',
      `Thanks for subscribing to <strong>${esc(payment.planName)}</strong>. Your invoice
       <strong>${esc(payment.invoiceNumber)}</strong> for Rs. ${payment.amount} is attached as a PDF.
       <p><a href="${env.clientUrl}/payments" style="display:inline-block;margin-top:12px;background:#4F46E5;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none">View your payments →</a></p>`
    ),
    attachments: [{ filename: `${payment.invoiceNumber}.pdf`, content: pdf }],
  });
}

export async function sendContactEmail(from: { name: string; email: string; message: string }): Promise<void> {
  await send({
    to: env.contactEmail,
    replyTo: from.email,
    subject: `New contact message from ${from.name}`,
    text: `Name: ${from.name}\nEmail: ${from.email}\n\n${from.message}`,
    html: shell(
      'New contact message',
      `<p><strong>Name:</strong> ${esc(from.name)}</p>
       <p><strong>Email:</strong> ${esc(from.email)}</p>
       <p style="margin-top:12px;white-space:pre-wrap">${esc(from.message)}</p>`
    ),
  });
}

export async function sendAnalysisReadyEmail(
  to: string,
  name: string,
  jobTitle: string,
  matchScore: number | null
): Promise<void> {
  await send({
    to,
    subject: `Your analysis is ready — ${jobTitle || 'job match'}`,
    text: `Hi ${name}, your analysis for "${jobTitle || 'the role'}" is ready${
      matchScore != null ? ` with a ${matchScore}/100 match` : ''
    }. View it at ${env.clientUrl}/dashboard.`,
    html: shell(
      `Your analysis is ready ✅`,
      `Your AI coach finished analyzing <strong>${jobTitle || 'the role'}</strong>${
        matchScore != null ? ` — you scored <strong>${matchScore}/100</strong>` : ''
      }.
       <p><a href="${env.clientUrl}/dashboard" style="display:inline-block;margin-top:12px;background:#4F46E5;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none">View results →</a></p>`
    ),
  });
}
