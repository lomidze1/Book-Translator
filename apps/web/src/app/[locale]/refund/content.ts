import type { LegalDoc } from '@/components/LegalPage';

const CONTACT_EMAIL = 'info@booktranslator.ge';

export const refundContent: Record<'ka' | 'en', LegalDoc> = {
  ka: {
    title: 'თანხის დაბრუნების პოლიტიკა',
    updated: 'ბოლო განახლება: 14 ივლისი 2026',
    intro: [
      'Book Translator-ზე გადახდა ერთჯერადია და უკავშირდება კონკრეტული წიგნის თარგმნას. ეს დოკუმენტი აღწერს, როდის და როგორ ბრუნდება თანხა.',
    ],
    sections: [
      {
        heading: 'როდის გიბრუნდებათ თანხა',
        bullets: [
          'თარგმნა ტექნიკური მიზეზით ჩაიშალა და ვერ დასრულდა განმეორებითი მცდელობების შემდეგაც.',
          'თანხა ჩამოგეჭრათ ორჯერ ან გადახდა განხორციელდა, მაგრამ მომსახურება ვერ მიიღეთ.',
          'გადაიხადეთ, მაგრამ თარგმნა ჯერ არ დაწყებულა და მოითხოვეთ გაუქმება.',
        ],
      },
      {
        heading: 'როდის არ ბრუნდება თანხა',
        bullets: [
          'თარგმნა წარმატებით დასრულდა და შედეგი ხელმისაწვდომია — ციფრული მომსახურება უკვე გაწეულია.',
          'უკმაყოფილება მხოლოდ AI-თარგმანის სტილით ან ხარისხით, როცა თარგმანი ტექნიკურად სრულია (ხარისხის შესახებ იხ. მომსახურების პირობები).',
          'პრობლემა გამოწვეულია თქვენ მიერ ატვირთული დაზიანებული ან წაუკითხავი ფაილით.',
        ],
      },
      {
        heading: 'როგორ მოითხოვოთ დაბრუნება',
        paragraphs: [
          `მოგვწერეთ ${CONTACT_EMAIL}-ზე და მიუთითეთ: ანგარიშის ელფოსტა, წიგნის სახელი, გადახდის თარიღი და პრობლემის აღწერა.`,
        ],
      },
      {
        heading: 'განხილვის ვადები',
        bullets: [
          'მოთხოვნას განვიხილავთ 5 სამუშაო დღეში.',
          'დადებითი გადაწყვეტილების შემთხვევაში თანხა დაბრუნდება იმავე გადახდის მეთოდზე 14 დღეში (ზუსტი ვადა დამოკიდებულია ბანკზე/პროვაიდერზე).',
        ],
      },
      {
        heading: 'კონტაქტი',
        paragraphs: [`კითხვების შემთხვევაში მოგვწერეთ: ${CONTACT_EMAIL}`],
      },
    ],
  },
  en: {
    title: 'Refund Policy',
    updated: 'Last updated: July 14, 2026',
    intro: [
      'Payments on Book Translator are one-time and tied to the translation of a specific book. This document describes when and how refunds are issued.',
    ],
    sections: [
      {
        heading: 'When You Are Eligible for a Refund',
        bullets: [
          'The translation failed for technical reasons and could not be completed even after retries.',
          'You were charged twice, or a payment was made but the service was not delivered.',
          'You paid, but the translation has not started yet and you requested a cancellation.',
        ],
      },
      {
        heading: 'When Refunds Are Not Issued',
        bullets: [
          'The translation completed successfully and the result is available — the digital service has been delivered.',
          'Dissatisfaction solely with the style or quality of the AI translation when the translation is technically complete (see the Terms of Service regarding quality).',
          'The problem was caused by a corrupted or unreadable file you uploaded.',
        ],
      },
      {
        heading: 'How to Request a Refund',
        paragraphs: [
          `Email us at ${CONTACT_EMAIL} and include: your account email, the book title, the payment date, and a description of the problem.`,
        ],
      },
      {
        heading: 'Processing Times',
        bullets: [
          'We review requests within 5 business days.',
          'If approved, the refund is returned to the original payment method within 14 days (the exact timing depends on your bank/provider).',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: [`If you have questions, contact us: ${CONTACT_EMAIL}`],
      },
    ],
  },
};
