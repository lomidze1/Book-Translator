import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend: Resend | null;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      console.warn('⚠️  RESEND_API_KEY not set — email sending disabled');
      this.resend = null;
    }
  }

  async sendPasswordResetEmail(to: string, token: string, name?: string): Promise<void> {
    if (!this.resend) {
      console.warn(`⚠️  Email skipped (no API key): password reset for ${to}`);
      return;
    }

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    const from = process.env.EMAIL_FROM || 'onboarding@resend.dev';

    console.log(`📧 Sending password reset email: from=${from}, to=${to}`);

    const result = await this.resend.emails.send({
      from,
      to,
      subject: 'პაროლის აღდგენა — Book Translator',
      html: this.getPasswordResetTemplate(resetUrl, name),
    });

    console.log(`📧 Resend response:`, JSON.stringify(result));
  }

  async sendEmailVerification(to: string, token: string, name?: string): Promise<void> {
    if (!this.resend) {
      console.warn(`⚠️  Email skipped (no API key): verification for ${to}`);
      return;
    }

    const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

    await this.resend.emails.send({
      from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
      to,
      subject: 'ემაილის დადასტურება — Book Translator',
      html: this.getEmailVerificationTemplate(verifyUrl, name),
    });
  }

  private getPasswordResetTemplate(resetUrl: string, name?: string): string {
    const greeting = name ? `გამარჯობა, ${name}!` : 'გამარჯობა!';
    return `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>${greeting}</h2>
        <p>თქვენ მოითხოვეთ პაროლის აღდგენა Book Translator-ზე.</p>
        <p>დააჭირეთ ქვემოთ მოცემულ ღილაკს ახალი პაროლის დასაყენებლად:</p>
        <a href="${resetUrl}" style="display: inline-block; background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">პაროლის აღდგენა</a>
        <p>ეს ლინკი მოქმედებს <strong>1 საათის</strong> განმავლობაში.</p>
        <p>თუ თქვენ არ მოითხოვეთ პაროლის აღდგენა, უგულებელყავით ეს წერილი.</p>
        <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
        <p style="color: #6b7280; font-size: 12px;">Book Translator — წიგნების თარგმანი ქართულად</p>
      </body>
      </html>
    `;
  }

  // === Phase 9: Notification Emails ===

  async sendTranslationCompletedEmail(
    to: string,
    locale: string,
    data: { bookTitle: string; bookId: string; userName?: string },
  ): Promise<void> {
    if (!this.resend) {
      console.warn(`⚠️  Email skipped (no API key): translation completed for ${to}`);
      return;
    }

    const isKa = locale !== 'en';
    const subject = isKa
      ? 'თარგმანი დასრულდა — Book Translator'
      : 'Translation Completed — Book Translator';
    const readUrl = `${process.env.FRONTEND_URL}/${locale}/books/${data.bookId}/read`;

    await this.resend.emails.send({
      from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
      to,
      subject,
      html: this.getTranslationCompletedTemplate(readUrl, data.bookTitle, data.userName, isKa),
    });
  }

  async sendPaymentReceiptEmail(
    to: string,
    locale: string,
    data: {
      amount: number;
      currency: string;
      bookTitle: string;
      paymentId: string;
      paidAt: Date;
      userName?: string;
    },
  ): Promise<void> {
    if (!this.resend) {
      console.warn(`⚠️  Email skipped (no API key): payment receipt for ${to}`);
      return;
    }

    const isKa = locale !== 'en';
    const subject = isKa
      ? 'გადახდის ქვითარი — Book Translator'
      : 'Payment Receipt — Book Translator';

    await this.resend.emails.send({
      from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
      to,
      subject,
      html: this.getPaymentReceiptTemplate(data, isKa),
    });
  }

  async sendTtsCompletedEmail(
    to: string,
    locale: string,
    data: {
      bookTitle: string;
      bookId: string;
      audioBookId: string;
      totalDuration: number;
      userName?: string;
    },
  ): Promise<void> {
    if (!this.resend) {
      console.warn(`⚠️  Email skipped (no API key): TTS completed for ${to}`);
      return;
    }

    const isKa = locale !== 'en';
    const subject = isKa
      ? 'აუდიო მზადაა — Book Translator'
      : 'Audio Book Ready — Book Translator';
    const listenUrl = `${process.env.FRONTEND_URL}/${locale}/books/${data.bookId}/read`;

    await this.resend.emails.send({
      from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
      to,
      subject,
      html: this.getTtsCompletedTemplate(listenUrl, data, isKa),
    });
  }

  private getTranslationCompletedTemplate(readUrl: string, bookTitle: string, name?: string, isKa = true): string {
    const greeting = name
      ? (isKa ? `გამარჯობა, ${name}!` : `Hello, ${name}!`)
      : (isKa ? 'გამარჯობა!' : 'Hello!');
    const bodyText = isKa
      ? `წიგნის „${bookTitle}" თარგმანი წარმატებით დასრულდა.`
      : `The translation of "${bookTitle}" has been completed successfully.`;
    const ctaText = isKa ? 'წაკითხვა' : 'Read Now';
    const footer = isKa ? 'Book Translator — წიგნების თარგმანი ქართულად' : 'Book Translator — Translate books to Georgian';

    return `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>${greeting}</h2>
        <p>${bodyText}</p>
        <a href="${readUrl}" style="display: inline-block; background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">${ctaText}</a>
        <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
        <p style="color: #6b7280; font-size: 12px;">${footer}</p>
      </body>
      </html>
    `;
  }

  private getPaymentReceiptTemplate(
    data: { amount: number; currency: string; bookTitle: string; paymentId: string; paidAt: Date; userName?: string },
    isKa: boolean,
  ): string {
    const greeting = data.userName
      ? (isKa ? `გამარჯობა, ${data.userName}!` : `Hello, ${data.userName}!`)
      : (isKa ? 'გამარჯობა!' : 'Hello!');
    const dateStr = data.paidAt.toLocaleDateString(isKa ? 'ka-GE' : 'en-US');
    const footer = isKa ? 'Book Translator — წიგნების თარგმანი ქართულად' : 'Book Translator — Translate books to Georgian';

    return `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>${greeting}</h2>
        <p>${isKa ? 'გადახდა წარმატებით შესრულდა.' : 'Your payment was successful.'}</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">${isKa ? 'თანხა' : 'Amount'}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${data.amount} ${data.currency}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">${isKa ? 'წიგნი' : 'Book'}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${data.bookTitle}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">${isKa ? 'თარიღი' : 'Date'}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${dateStr}</td>
          </tr>
          <tr>
            <td style="padding: 8px; color: #6b7280;">${isKa ? 'ტრანზაქცია' : 'Transaction'}</td>
            <td style="padding: 8px; font-family: monospace; font-size: 12px;">${data.paymentId}</td>
          </tr>
        </table>
        <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
        <p style="color: #6b7280; font-size: 12px;">${footer}</p>
      </body>
      </html>
    `;
  }

  private getTtsCompletedTemplate(
    listenUrl: string,
    data: { bookTitle: string; totalDuration: number; userName?: string },
    isKa: boolean,
  ): string {
    const greeting = data.userName
      ? (isKa ? `გამარჯობა, ${data.userName}!` : `Hello, ${data.userName}!`)
      : (isKa ? 'გამარჯობა!' : 'Hello!');
    const minutes = Math.round(data.totalDuration / 60000);
    const durationStr = isKa ? `${minutes} წუთი` : `${minutes} minutes`;
    const bodyText = isKa
      ? `წიგნის „${data.bookTitle}" აუდიო ვერსია მზადაა (${durationStr}).`
      : `The audio version of "${data.bookTitle}" is ready (${durationStr}).`;
    const ctaText = isKa ? 'მოსმენა' : 'Listen Now';
    const footer = isKa ? 'Book Translator — წიგნების თარგმანი ქართულად' : 'Book Translator — Translate books to Georgian';

    return `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>${greeting}</h2>
        <p>${bodyText}</p>
        <a href="${listenUrl}" style="display: inline-block; background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">${ctaText}</a>
        <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
        <p style="color: #6b7280; font-size: 12px;">${footer}</p>
      </body>
      </html>
    `;
  }

  private getEmailVerificationTemplate(verifyUrl: string, name?: string): string {
    const greeting = name ? `გამარჯობა, ${name}!` : 'გამარჯობა!';
    return `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>${greeting}</h2>
        <p>მადლობა რეგისტრაციისთვის Book Translator-ზე!</p>
        <p>გთხოვთ დაადასტუროთ თქვენი ემაილი ქვემოთ მოცემულ ღილაკზე დაჭერით:</p>
        <a href="${verifyUrl}" style="display: inline-block; background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">ემაილის დადასტურება</a>
        <p>ეს ლინკი მოქმედებს <strong>24 საათის</strong> განმავლობაში.</p>
        <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
        <p style="color: #6b7280; font-size: 12px;">Book Translator — წიგნების თარგმანი ქართულად</p>
      </body>
      </html>
    `;
  }
}
