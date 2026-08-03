/**
 * Curated English→Georgian literary style rules, injected into every
 * translation and editor prompt.
 *
 * The model already knows Georgian grammar; what it lacks is the set of
 * conventions a Georgian literary editor would enforce. Each rule here comes
 * from an observed failure mode, so keep this file short and concrete —
 * a long list dilutes attention and costs tokens on every chunk.
 *
 * Add a rule only when a real translation shows the mistake, and add it as a
 * contrast pair (wrong → right) rather than an abstract instruction.
 */
export const GEORGIAN_STYLE_RULES = `GEORGIAN STYLE RULES (mandatory):

1. DIALOGUE PUNCTUATION
   Georgian literary dialogue opens a line with an em dash, not quotation marks.
   WRONG: "გამარჯობა," თქვა ჯონმა.
   RIGHT: — გამარჯობა, — თქვა ჯონმა.
   Quotation marks around quoted speech inside a paragraph use „ " (Georgian
   quotes), never English " " or Russian « ».

2. NO CALQUES OF ENGLISH VERB PHRASES
   Georgian expresses with one verb what English expresses with verb + noun.
   WRONG: მან მიიღო გადაწყვეტილება        RIGHT: მან გადაწყვიტა
   WRONG: მან გააკეთა განცხადება           RIGHT: მან განაცხადა
   WRONG: ადგილი ჰქონდა შეხვედრას          RIGHT: შეხვედრა გაიმართა

3. WORD ORDER IS NOT ENGLISH WORD ORDER
   Do not preserve English SVO order mechanically. Georgian normally places
   the verb late and allows the subject to be dropped when it is clear from
   the verb form. Rebuild the sentence; do not transpose it word by word.

4. PRONOUNS
   Georgian "ის" carries no gender. When an English passage relies on he/she
   to distinguish two characters, repeat the name in Georgian instead of
   letting "ის" make the referent ambiguous. Do not invent gender markers.

5. ADDRESS FORM (შენ / თქვენ)
   Choose per character pair, based on their relationship and the era, and
   keep it consistent for the whole book. Intimates, children, and inferiors
   in older texts take "შენ"; strangers, superiors, and formal settings take
   "თქვენ". Never switch mid-scene without a reason in the source.

6. PROPER NOUNS
   Transliterate personal names and add the Georgian nominative ending where
   Georgian requires one (John → ჯონი, Mary → მერი), then decline normally
   (ჯონმა, ჯონს). Places with an established Georgian form use it
   (London → ლონდონი, not ლონდონ).

7. NUMBERS, DATES, UNITS
   Keep all digits from the source exactly. Dates read as "1847 წელს".
   Do not convert imperial units to metric — a translation is not a
   conversion; keep miles as მილი, feet as ფუტი.

8. REGISTER
   Match the source's register. Do not modernize archaic prose and do not
   elevate plain prose. Colloquial dialogue stays colloquial in Georgian.`;
