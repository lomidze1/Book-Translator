import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  // English is hidden for launch. The [locale] segment and messages/en.json
  // are kept, so re-enabling is one entry in this array plus un-hiding the
  // LanguageSwitcher in Navbar and SettingsPage.
  locales: ['ka'],
  defaultLocale: 'ka',
});
