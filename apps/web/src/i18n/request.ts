import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

const messageImports = {
  ka: () => import('../../messages/ka.json'),
  en: () => import('../../messages/en.json'),
} as const;

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale;
  }

  const messages = (await messageImports[locale as keyof typeof messageImports]()).default;

  return {
    locale,
    messages,
  };
});
