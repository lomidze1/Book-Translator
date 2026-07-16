import type { LegalDoc } from '@/components/LegalPage';

const CONTACT_EMAIL = 'info@booktranslator.ge';

export const copyrightContent: Record<'ka' | 'en', LegalDoc> = {
  ka: {
    title: 'საავტორო უფლებების პოლიტიკა',
    updated: 'ბოლო განახლება: 14 ივლისი 2026',
    intro: [
      'Book Translator პატივს სცემს ინტელექტუალური საკუთრების უფლებებს. პლატფორმა არის პირადი თარგმნის სამუშაო სივრცე: მომხმარებლები ატვირთავენ საკუთარ ფაილებს და თარგმანი ხელმისაწვდომია მხოლოდ ატვირთვის ავტორისთვის.',
    ],
    sections: [
      {
        heading: 'მომხმარებლის პასუხისმგებლობა',
        paragraphs: [
          'ფაილის ატვირთვით მომხმარებელი ადასტურებს, რომ აქვს ამ კონტენტის პირადი გამოყენებისთვის თარგმნის უფლება. საავტორო უფლებებით დაცული მასალის უფლების გარეშე ატვირთვა ან ნათარგმნის გავრცელება არღვევს ჩვენს მომსახურების პირობებს.',
        ],
      },
      {
        heading: 'უფლების მფლობელებისთვის — მოთხოვნის გაგზავნა',
        paragraphs: [
          `თუ თვლით, რომ პლატფორმაზე თქვენი საავტორო უფლება ირღვევა, მოგვწერეთ: ${CONTACT_EMAIL}. მოთხოვნა უნდა შეიცავდეს:`,
        ],
        bullets: [
          'დაცული ნაწარმოების იდენტიფიკაციას (სათაური, ავტორი).',
          'დარღვევის აღწერას და, თუ შესაძლებელია, შესაბამის ბმულს ან იდენტიფიკატორს.',
          'თქვენს საკონტაქტო მონაცემებს.',
          'კეთილსინდისიერ განცხადებას, რომ ხართ უფლების მფლობელი ან მისი წარმომადგენელი.',
        ],
      },
      {
        heading: 'რეაგირების პროცესი',
        bullets: [
          'მოთხოვნის მიღებას დაგიდასტურებთ 48 საათში.',
          'დასაბუთებული მოთხოვნის შემთხვევაში კონტენტზე წვდომას შევზღუდავთ ან წავშლით 72 საათში.',
          'შესაბამის მომხმარებელს ეცნობება მიღებული ზომების შესახებ.',
        ],
      },
      {
        heading: 'განმეორებითი დარღვევა',
        paragraphs: [
          'მომხმარებლის ანგარიში, რომელზეც არაერთხელ დადასტურდა საავტორო უფლების დარღვევა, შეიძლება შეჩერდეს ან სამუდამოდ დაიხუროს.',
        ],
      },
      {
        heading: 'კონტაქტი',
        paragraphs: [`საავტორო უფლებებთან დაკავშირებული ყველა საკითხისთვის: ${CONTACT_EMAIL}`],
      },
    ],
  },
  en: {
    title: 'Copyright Policy',
    updated: 'Last updated: July 14, 2026',
    intro: [
      'Book Translator respects intellectual property rights. The Platform is a private translation workspace: users upload their own files, and each translation is available only to the user who uploaded it.',
    ],
    sections: [
      {
        heading: 'User Responsibility',
        paragraphs: [
          'By uploading a file, the user confirms that they have the right to translate this content for personal use. Uploading copyrighted material without authorization, or distributing translations, violates our Terms of Service.',
        ],
      },
      {
        heading: 'For Rights Holders — Submitting a Takedown Request',
        paragraphs: [
          `If you believe your copyright is being infringed on the Platform, contact us at ${CONTACT_EMAIL}. Your request should include:`,
        ],
        bullets: [
          'Identification of the protected work (title, author).',
          'A description of the infringement and, if possible, a relevant link or identifier.',
          'Your contact details.',
          'A good-faith statement that you are the rights holder or their authorized representative.',
        ],
      },
      {
        heading: 'Response Process',
        bullets: [
          'We will acknowledge your request within 48 hours.',
          'For substantiated requests, we will restrict access to or remove the content within 72 hours.',
          'The affected user will be notified of the action taken.',
        ],
      },
      {
        heading: 'Repeat Infringement',
        paragraphs: [
          'Accounts with multiple confirmed copyright violations may be suspended or permanently closed.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: [`For all copyright matters: ${CONTACT_EMAIL}`],
      },
    ],
  },
};
