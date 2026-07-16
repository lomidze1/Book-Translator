import type { LegalDoc } from '@/components/LegalPage';

const CONTACT_EMAIL = 'info@booktranslator.ge';

export const privacyContent: Record<'ka' | 'en', LegalDoc> = {
  ka: {
    title: 'კონფიდენციალურობის პოლიტიკა',
    updated: 'ბოლო განახლება: 14 ივლისი 2026',
    intro: [
      'ეს დოკუმენტი აღწერს, რა პერსონალურ მონაცემებს აგროვებს Book Translator (შემდგომში — „პლატფორმა"), რისთვის იყენებს მათ და რა უფლებები გაქვთ თქვენ.',
    ],
    sections: [
      {
        heading: 'რა მონაცემებს ვაგროვებთ',
        bullets: [
          'ანგარიშის მონაცემები: ელფოსტა, სახელი, პაროლი (დაშიფრული ჰეშის სახით), Google-ით შესვლისას — Google-პროფილის ძირითადი მონაცემები.',
          'თქვენ მიერ ატვირთული ფაილები და მათი თარგმანები.',
          'გადახდის მეტამონაცემები: თანხა, თარიღი, სტატუსი, პროვაიდერის ტრანზაქციის ID. საბანკო ბარათის მონაცემები ჩვენთან არასდროს ინახება — მათ ამუშავებს საგადახდო პროვაიდერი.',
          'გამოყენების მონაცემები: კითხვის პროგრესი, სანიშნეები, ხაზგასმები, შენიშვნები, პარამეტრები.',
          'ტექნიკური მონაცემები: IP-მისამართი, ბრაუზერის ტიპი, შეცდომების ლოგები.',
          'Push-შეტყობინებების გამოწერა (თუ ჩართავთ).',
        ],
      },
      {
        heading: 'რისთვის ვიყენებთ მონაცემებს',
        bullets: [
          'მომსახურების გაწევა: თარგმნა, კითხვა, ხმოვანი წაკითხვა, ბიბლიოთეკის სინქრონიზაცია.',
          'გადახდების დამუშავება და ქვითრების გაგზავნა.',
          'შეტყობინებები (თარგმნის დასრულება, გადახდის დადასტურება) — თქვენი პარამეტრების შესაბამისად.',
          'უსაფრთხოება: თაღლითობის პრევენცია, ანგარიშის დაცვა.',
          'პლატფორმის გაუმჯობესება და შეცდომების აღმოფხვრა.',
        ],
      },
      {
        heading: 'მესამე მხარეები',
        paragraphs: [
          'მომსახურების გასაწევად ვიყენებთ შემდეგ სერვისებს, რომლებსაც მონაცემები გადაეცემა მხოლოდ საჭირო მოცულობით:',
        ],
        bullets: [
          'Anthropic (Claude API) — ტექსტის თარგმნა.',
          'Google Cloud, ElevenLabs, Microsoft Azure — ხმოვანი წაკითხვა (TTS).',
          'Amazon Web Services (S3) — ფაილების შენახვა.',
          'Google — ავტორიზაცია (Google Sign-In).',
          'Resend — ელფოსტის გაგზავნა.',
          'Sentry — შეცდომების მონიტორინგი.',
          'საგადახდო პროვაიდერები (Flitt/TBC, BOG) — გადახდების დამუშავება.',
        ],
      },
      {
        heading: 'შენახვის ვადები',
        paragraphs: [
          'მონაცემები ინახება, სანამ თქვენი ანგარიში აქტიურია. ანგარიშის წაშლისას წაიშლება თქვენი პერსონალური მონაცემები, ატვირთული ფაილები და თარგმანები, გარდა იმ ჩანაწერებისა, რომელთა შენახვასაც კანონი გვავალდებულებს (მაგ. ფინანსური დოკუმენტაცია).',
        ],
      },
      {
        heading: 'უსაფრთხოება',
        paragraphs: [
          'მონაცემები გადაიცემა დაშიფრული კავშირით (HTTPS/TLS). პაროლები ინახება მხოლოდ ჰეშირებული სახით. წვდომა მონაცემებზე შეზღუდულია.',
        ],
      },
      {
        heading: 'თქვენი უფლებები',
        bullets: [
          'მოითხოვოთ თქვენი მონაცემების ასლი.',
          'შეასწოროთ არაზუსტი მონაცემები.',
          'მოითხოვოთ ანგარიშისა და მონაცემების წაშლა.',
          'გამორთოთ არასავალდებულო შეტყობინებები პარამეტრებში.',
        ],
        outro: [`ამ უფლებების გამოსაყენებლად მოგვწერეთ: ${CONTACT_EMAIL}`],
      },
      {
        heading: 'ბავშვები',
        paragraphs: [
          'პლატფორმა არ არის განკუთვნილი 16 წლამდე პირებისთვის და მიზანმიმართულად არ აგროვებს მათ მონაცემებს.',
        ],
      },
      {
        heading: 'ცვლილებები',
        paragraphs: [
          'პოლიტიკის განახლების შემთხვევაში შეიცვლება „ბოლო განახლების" თარიღი; არსებით ცვლილებაზე დამატებით შეგატყობინებთ.',
        ],
      },
      {
        heading: 'კონტაქტი',
        paragraphs: [`კითხვების შემთხვევაში მოგვწერეთ: ${CONTACT_EMAIL}`],
      },
    ],
  },
  en: {
    title: 'Privacy Policy',
    updated: 'Last updated: July 14, 2026',
    intro: [
      'This document describes what personal data Book Translator (the "Platform") collects, how it is used, and what rights you have.',
    ],
    sections: [
      {
        heading: 'Data We Collect',
        bullets: [
          'Account data: email, name, password (stored as an encrypted hash); when signing in with Google — basic Google profile data.',
          'Files you upload and their translations.',
          'Payment metadata: amount, date, status, provider transaction ID. Card details are never stored with us — they are processed by the payment provider.',
          'Usage data: reading progress, bookmarks, highlights, notes, settings.',
          'Technical data: IP address, browser type, error logs.',
          'Push notification subscriptions (if you enable them).',
        ],
      },
      {
        heading: 'How We Use Data',
        bullets: [
          'Providing the service: translation, reading, text-to-speech, library sync.',
          'Processing payments and sending receipts.',
          'Notifications (translation finished, payment confirmed) — according to your preferences.',
          'Security: fraud prevention, account protection.',
          'Improving the Platform and fixing errors.',
        ],
      },
      {
        heading: 'Third Parties',
        paragraphs: [
          'We use the following services to provide the Platform; data is shared with them only to the extent necessary:',
        ],
        bullets: [
          'Anthropic (Claude API) — text translation.',
          'Google Cloud, ElevenLabs, Microsoft Azure — text-to-speech (TTS).',
          'Amazon Web Services (S3) — file storage.',
          'Google — authentication (Google Sign-In).',
          'Resend — email delivery.',
          'Sentry — error monitoring.',
          'Payment providers (Flitt/TBC, BOG) — payment processing.',
        ],
      },
      {
        heading: 'Data Retention',
        paragraphs: [
          'Data is retained while your account is active. When you delete your account, your personal data, uploaded files, and translations are deleted, except for records we are legally required to keep (e.g., financial documentation).',
        ],
      },
      {
        heading: 'Security',
        paragraphs: [
          'Data is transmitted over encrypted connections (HTTPS/TLS). Passwords are stored only as hashes. Access to data is restricted.',
        ],
      },
      {
        heading: 'Your Rights',
        bullets: [
          'Request a copy of your data.',
          'Correct inaccurate data.',
          'Request deletion of your account and data.',
          'Disable optional notifications in settings.',
        ],
        outro: [`To exercise these rights, contact us: ${CONTACT_EMAIL}`],
      },
      {
        heading: 'Children',
        paragraphs: [
          'The Platform is not intended for persons under 16 and does not knowingly collect their data.',
        ],
      },
      {
        heading: 'Changes',
        paragraphs: [
          'If this policy is updated, the "Last updated" date will change; we will additionally notify you of material changes.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: [`If you have questions, contact us: ${CONTACT_EMAIL}`],
      },
    ],
  },
};
