import PDFDocument from 'pdfkit';
import type { IPayment } from '../models/Payment';
import { env } from '../config/env';

const INK = '#0F172A';
const MUTED = '#64748B';
const BRAND = '#4F46E5';
const LINE = '#E5E7EB';

export function generateInvoicePdf(payment: IPayment, user: { name: string; email: string }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const money = (n: number) => `Rs. ${n.toLocaleString('en-IN')}.00`;
    const date = new Date(payment.createdAt).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    // Header
    doc.fillColor(INK).fontSize(22).font('Helvetica-Bold').text(env.appName, 50, 55);
    doc.fillColor(MUTED).fontSize(10).font('Helvetica').text('AI Career Coach', 50, 82);
    doc.fillColor(BRAND).fontSize(26).font('Helvetica-Bold').text('INVOICE', 0, 55, { align: 'right' });
    doc.fillColor(MUTED).fontSize(10).font('Helvetica').text(`#${payment.invoiceNumber}`, 0, 86, { align: 'right' });

    doc.moveTo(50, 115).lineTo(545, 115).strokeColor(LINE).lineWidth(1).stroke();

    // Meta
    doc.fillColor(MUTED).fontSize(9).font('Helvetica').text('BILLED TO', 50, 135);
    doc.fillColor(INK).fontSize(11).font('Helvetica-Bold').text(user.name, 50, 149);
    doc.fillColor(MUTED).fontSize(10).font('Helvetica').text(user.email, 50, 165);

    doc.fillColor(MUTED).fontSize(9).font('Helvetica').text('DATE', 380, 135, { width: 165, align: 'right' });
    doc.fillColor(INK).fontSize(11).font('Helvetica-Bold').text(date, 380, 149, { width: 165, align: 'right' });
    doc.fillColor(MUTED).fontSize(9).font('Helvetica').text('STATUS', 380, 169, { width: 165, align: 'right' });
    doc.fillColor('#059669').fontSize(11).font('Helvetica-Bold').text('PAID', 380, 183, { width: 165, align: 'right' });

    // Table header
    const top = 225;
    doc.rect(50, top, 495, 28).fill('#F8FAFC');
    doc.fillColor(MUTED).fontSize(9).font('Helvetica-Bold');
    doc.text('DESCRIPTION', 64, top + 9);
    doc.text('AMOUNT', 380, top + 9, { width: 151, align: 'right' });

    // Row
    const rowY = top + 40;
    doc.fillColor(INK).fontSize(11).font('Helvetica-Bold').text(`${payment.planName} plan`, 64, rowY);
    doc.fillColor(MUTED).fontSize(9).font('Helvetica').text(payment.periodLabel, 64, rowY + 16);
    doc.fillColor(INK).fontSize(11).font('Helvetica').text(money(payment.amount), 380, rowY, { width: 151, align: 'right' });

    doc.moveTo(50, rowY + 44).lineTo(545, rowY + 44).strokeColor(LINE).stroke();

    // Total
    const totalY = rowY + 60;
    doc.fillColor(MUTED).fontSize(10).font('Helvetica').text('Total', 300, totalY, { width: 80, align: 'right' });
    doc.fillColor(INK).fontSize(14).font('Helvetica-Bold').text(money(payment.amount), 380, totalY - 2, { width: 151, align: 'right' });
    doc.fillColor(MUTED).fontSize(9).font('Helvetica').text(`Paid via ${payment.method.toUpperCase()} · ${payment.currency}`, 300, totalY + 22, { width: 231, align: 'right' });

    // Footer
    doc.fillColor(MUTED).fontSize(9).font('Helvetica').text(
      `Thank you for subscribing to ${env.appName}. This is a system-generated invoice.`,
      50,
      760,
      { align: 'center', width: 495 }
    );

    doc.end();
  });
}

/** Build a human-friendly invoice number. */
export function makeInvoiceNumber(): string {
  const d = new Date();
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `CF-${d.getFullYear()}-${rand}`;
}
