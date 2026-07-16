import type { LegalDoc } from '@/components/LegalPage';

const CONTACT_EMAIL = 'info@booktranslator.ge';

export const termsContent: Record<'ka' | 'en', LegalDoc> = {
  ka: {
    title: 'მომსახურების პირობები',
    updated: 'ბოლო განახლება: 14 ივლისი 2026',
    intro: [
      'ეს დოკუმენტი განსაზღვრავს Book Translator-ის (შემდგომში — „პლატფორმა") გამოყენების წესებსა და პირობებს. პლატფორმაზე რეგისტრაციით ან მისი გამოყენებით თქვენ ეთანხმებით ამ პირობებს. თუ არ ეთანხმებით, გთხოვთ, არ ისარგებლოთ პლატფორმით.',
    ],
    sections: [
      {
        heading: 'მომსახურების აღწერა',
        paragraphs: [
          'Book Translator არის პირადი სამუშაო სივრცე წიგნების AI-თარგმნისთვის: მომხმარებელი ატვირთავს საკუთარ ფაილს (PDF, EPUB, TXT, DOCX), პლატფორმა ხელოვნური ინტელექტის დახმარებით თარგმნის მას ქართულ ენაზე, ხოლო შედეგი ხელმისაწვდომია ჩაშენებულ ონლაინ რიდერში და ხმოვანი წაკითხვის (TTS) ფუნქციით.',
          'თარგმანი განკუთვნილია მხოლოდ ატვირთვის ავტორი მომხმარებლის პირადი, არაკომერციული გამოყენებისთვის.',
        ],
      },
      {
        heading: 'ანგარიში',
        bullets: [
          'რეგისტრაციისას ვალდებული ხართ მიუთითოთ ზუსტი ინფორმაცია.',
          'პასუხისმგებელი ხართ თქვენი ანგარიშის უსაფრთხოებაზე (პაროლი, წვდომა).',
          'პლატფორმით სარგებლობა შეუძლიათ 18 წელს მიღწეულ პირებს, ან არასრულწლოვნებს მშობლის/მეურვის თანხმობით.',
        ],
      },
      {
        heading: 'მომხმარებლის კონტენტი და გარანტიები',
        paragraphs: [
          'ფაილის ატვირთვით თქვენ ადასტურებთ, რომ გაქვთ ამ კონტენტის პირადი გამოყენებისთვის თარგმნის უფლება. საავტორო უფლებებით დაცული მასალის უფლების გარეშე ატვირთვა და მისი გავრცელება არღვევს ამ პირობებს და შესაძლოა — მოქმედ კანონმდებლობასაც.',
          'ატვირთული ფაილები და მათი თარგმანები რჩება თქვენს საკუთრებაში. პლატფორმას ანიჭებთ შეზღუდულ ლიცენზიას, დაამუშაოს და შეინახოს ეს კონტენტი მხოლოდ მომსახურების გაწევის მიზნით.',
        ],
      },
      {
        heading: 'აკრძალული გამოყენება',
        bullets: [
          'ნათარგმნი მასალის გავრცელება, გაყიდვა ან საჯარო გამოქვეყნება უფლების მფლობელის თანხმობის გარეშე.',
          'უკანონო, მავნე ან სხვისი უფლებების დამრღვევი კონტენტის ატვირთვა.',
          'პლატფორმის ტექნიკური ბოროტად გამოყენება (ავტომატიზებული მასობრივი ატვირთვა, უსაფრთხოების გვერდის ავლა, სერვისის ხელშეშლა).',
        ],
      },
      {
        heading: 'ფასები და გადახდა',
        paragraphs: [
          'თარგმნის მომსახურება ანაზღაურდება ერთჯერადი გადახდით, ყოველი წიგნისთვის ცალ-ცალკე. ზუსტი ფასი გამოჩნდება გადახდის დაწყებამდე და დამოკიდებულია წიგნის მოცულობასა და არჩეულ ტარიფზე. გადახდა ხორციელდება ლიცენზირებული საგადახდო პროვაიდერების მეშვეობით; საბანკო ბარათის მონაცემები პლატფორმაზე არ ინახება.',
        ],
      },
      {
        heading: 'AI-თარგმანის ხარისხი',
        paragraphs: [
          'თარგმანი გენერირებულია ხელოვნური ინტელექტის მიერ. ხარისხი შეიძლება განსხვავდებოდეს ტექსტის ტიპისა და სირთულის მიხედვით. ეს არ არის პროფესიული ადამიანური თარგმანი და პლატფორმა არ იძლევა გარანტიას თარგმანის უზუსტობებისგან სრულ დაცვაზე.',
        ],
      },
      {
        heading: 'თანხის დაბრუნება',
        paragraphs: [
          'თანხის დაბრუნების წესები აღწერილია ცალკე დოკუმენტში — „თანხის დაბრუნების პოლიტიკა" (/refund).',
        ],
      },
      {
        heading: 'ინტელექტუალური საკუთრება',
        paragraphs: [
          'პლატფორმის პროგრამული უზრუნველყოფა, დიზაინი, ლოგო და სავაჭრო ნიშნები Book Translator-ის საკუთრებაა და დაცულია მოქმედი კანონმდებლობით.',
        ],
      },
      {
        heading: 'მომსახურების შეჩერება და შეწყვეტა',
        paragraphs: [
          'პირობების დარღვევის შემთხვევაში პლატფორმას უფლება აქვს შეზღუდოს ან შეწყვიტოს თქვენი ანგარიშის მოქმედება. საავტორო უფლებების დარღვევაზე რეაგირება ხდება „საავტორო უფლებების პოლიტიკის" (/copyright) შესაბამისად.',
        ],
      },
      {
        heading: 'პასუხისმგებლობის შეზღუდვა',
        paragraphs: [
          'პლატფორმა მოწოდებულია პრინციპით „როგორც არის" (as is). კანონით დაშვებულ მაქსიმალურ ფარგლებში, პლატფორმის ჯამური პასუხისმგებლობა შემოიფარგლება იმ თანხით, რომელიც თქვენ გადაიხადეთ შესაბამისი მომსახურებისთვის.',
        ],
      },
      {
        heading: 'პირობების ცვლილება',
        paragraphs: [
          'პლატფორმას შეუძლია განაახლოს ეს პირობები. არსებითი ცვლილების შემთხვევაში შეგატყობინებთ პლატფორმაზე ან ელფოსტით. განახლების შემდეგ პლატფორმის გამოყენება ნიშნავს ახალ პირობებზე თანხმობას.',
        ],
      },
      {
        heading: 'მარეგულირებელი კანონმდებლობა',
        paragraphs: [
          'ეს პირობები რეგულირდება საქართველოს კანონმდებლობით. დავები განიხილება საქართველოს სასამართლოებში.',
        ],
      },
      {
        heading: 'კონტაქტი',
        paragraphs: [`კითხვების შემთხვევაში მოგვწერეთ: ${CONTACT_EMAIL}`],
      },
    ],
  },
  en: {
    title: 'Terms of Service',
    updated: 'Last updated: July 14, 2026',
    intro: [
      'These Terms of Service govern your use of Book Translator (the "Platform"). By registering or using the Platform you agree to these terms. If you do not agree, please do not use the Platform.',
    ],
    sections: [
      {
        heading: 'Service Description',
        paragraphs: [
          'Book Translator is a private workspace for AI-powered book translation: you upload your own file (PDF, EPUB, TXT, DOCX), the Platform translates it into Georgian using artificial intelligence, and the result is available in the built-in online reader and via text-to-speech (TTS).',
          'Translations are intended solely for the personal, non-commercial use of the user who uploaded the file.',
        ],
      },
      {
        heading: 'Your Account',
        bullets: [
          'You must provide accurate information when registering.',
          'You are responsible for keeping your account secure (password, access).',
          'The Platform may be used by persons aged 18 or older, or by minors with parental/guardian consent.',
        ],
      },
      {
        heading: 'User Content and Warranties',
        paragraphs: [
          'By uploading a file you confirm that you have the right to translate this content for personal use. Uploading copyrighted material without authorization, or distributing it, violates these terms and may violate applicable law.',
          'Uploaded files and their translations remain your property. You grant the Platform a limited license to process and store this content solely for the purpose of providing the service.',
        ],
      },
      {
        heading: 'Prohibited Use',
        bullets: [
          'Distributing, selling, or publicly publishing translated material without the rights holder’s consent.',
          'Uploading illegal, harmful, or infringing content.',
          'Technical abuse of the Platform (automated mass uploads, circumventing security, disrupting the service).',
        ],
      },
      {
        heading: 'Pricing and Payment',
        paragraphs: [
          'Translation is paid for with a one-time payment per book. The exact price is shown before payment and depends on the book’s length and the selected tier. Payments are processed by licensed payment providers; card details are never stored on the Platform.',
        ],
      },
      {
        heading: 'AI Translation Quality',
        paragraphs: [
          'Translations are generated by artificial intelligence. Quality may vary depending on the type and complexity of the text. This is not a professional human translation, and the Platform does not guarantee the absence of inaccuracies.',
        ],
      },
      {
        heading: 'Refunds',
        paragraphs: ['Refund rules are described in a separate document — the Refund Policy (/refund).'],
      },
      {
        heading: 'Intellectual Property',
        paragraphs: [
          'The Platform’s software, design, logo, and trademarks are the property of Book Translator and are protected by applicable law.',
        ],
      },
      {
        heading: 'Suspension and Termination',
        paragraphs: [
          'If you violate these terms, the Platform may restrict or terminate your account. Copyright complaints are handled under the Copyright Policy (/copyright).',
        ],
      },
      {
        heading: 'Limitation of Liability',
        paragraphs: [
          'The Platform is provided "as is". To the maximum extent permitted by law, the Platform’s total liability is limited to the amount you paid for the relevant service.',
        ],
      },
      {
        heading: 'Changes to These Terms',
        paragraphs: [
          'We may update these terms. For material changes we will notify you on the Platform or by email. Continued use after an update constitutes acceptance of the new terms.',
        ],
      },
      {
        heading: 'Governing Law',
        paragraphs: [
          'These terms are governed by the laws of Georgia. Disputes are subject to the jurisdiction of the courts of Georgia.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: [`If you have questions, contact us: ${CONTACT_EMAIL}`],
      },
    ],
  },
};
