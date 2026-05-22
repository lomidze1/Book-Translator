import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!user || !domain) return '***';
  const visible = user.length <= 2 ? user[0] : user.slice(0, 2);
  return `${visible}***@${domain}`;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly frontendUrl: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.from = this.config.get<string>('EMAIL_FROM') || 'onboarding@resend.dev';
    this.frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    if (apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      this.logger.warn('RESEND_API_KEY not set — email sending disabled');
      this.resend = null;
    }
  }

  private async send(label: string, to: string, subject: string, html: string): Promise<void> {
    if (!this.resend) {
      this.logger.warn(`Email skipped (no API key): ${label} for ${maskEmail(to)}`);
      return;
    }

    await this.resend.emails.send({ from: this.from, to, subject, html });
    this.logger.log(`Email sent: ${label} → ${maskEmail(to)}`);
  }

  async sendPasswordResetEmail(to: string, token: string, name?: string): Promise<void> {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${token}`;
    await this.send(
      'password-reset',
      to,
      'პაროლის აღდგენა — Book Translator',
      this.getPasswordResetTemplate(resetUrl, name),
    );
  }

  async sendPasswordChangeConfirmation(to: string, token: string, name?: string): Promise<void> {
    const confirmUrl = `${this.frontendUrl}/confirm-password-change?token=${token}`;
    await this.send(
      'password-change-confirmation',
      to,
      'პაროლის შეცვლის დადასტურება — Book Translator',
      this.getPasswordChangeConfirmationTemplate(confirmUrl, name),
    );
  }

  async sendEmailVerification(to: string, token: string, name?: string): Promise<void> {
    const verifyUrl = `${this.frontendUrl}/verify-email?token=${token}`;
    await this.send(
      'email-verification',
      to,
      'ემაილის დადასტურება — Book Translator',
      this.getEmailVerificationTemplate(verifyUrl, name),
    );
  }

  async sendTranslationCompletedEmail(
    to: string,
    locale: string,
    data: { bookTitle: string; bookId: string; userName?: string },
  ): Promise<void> {
    const isKa = locale !== 'en';
    const subject = isKa
      ? 'თარგმანი დასრულდა — Book Translator'
      : 'Translation Completed — Book Translator';
    const readUrl = `${this.frontendUrl}/${locale}/books/${data.bookId}/read`;
    await this.send(
      'translation-completed',
      to,
      subject,
      this.getTranslationCompletedTemplate(readUrl, data.bookTitle, data.userName, isKa),
    );
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
    const isKa = locale !== 'en';
    const subject = isKa
      ? 'გადახდის ქვითარი — Book Translator'
      : 'Payment Receipt — Book Translator';
    await this.send('payment-receipt', to, subject, this.getPaymentReceiptTemplate(data, isKa));
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
    const isKa = locale !== 'en';
    const subject = isKa
      ? 'აუდიო მზადაა — Book Translator'
      : 'Audio Book Ready — Book Translator';
    const listenUrl = `${this.frontendUrl}/${locale}/books/${data.bookId}/read`;
    await this.send(
      'tts-completed',
      to,
      subject,
      this.getTtsCompletedTemplate(listenUrl, data, isKa),
    );
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

  private getPasswordChangeConfirmationTemplate(confirmUrl: string, name?: string): string {
    const greeting = name ? `გამარჯობა, ${name}!` : 'გამარჯობა!';
    return `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>${greeting}</h2>
        <p>თქვენ მოითხოვეთ პაროლის შეცვლა Book Translator-ზე.</p>
        <p>დააჭირეთ ქვემოთ მოცემულ ღილაკს პაროლის შეცვლის დასადასტურებლად:</p>
        <a href="${confirmUrl}" style="display: inline-block; background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">პაროლის შეცვლის დადასტურება</a>
        <p>ეს ლინკი მოქმედებს <strong>1 საათის</strong> განმავლობაში.</p>
        <p>თუ თქვენ არ მოითხოვეთ პაროლის შეცვლა, უგულებელყავით ეს წერილი.</p>
        <hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
        <p style="color: #6b7280; font-size: 12px;">Book Translator — წიგნების თარგმანი ქართულად</p>
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
