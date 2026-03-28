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

    await this.resend.emails.send({
      from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
      to,
      subject: 'პაროლის აღდგენა — Book Translator',
      html: this.getPasswordResetTemplate(resetUrl, name),
    });
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
