import { I18n } from 'i18n-js';
import ka from './locales/ka.json';
import en from './locales/en.json';

const i18n = new I18n({ ka, en });

i18n.defaultLocale = 'ka';
i18n.locale = 'ka';
i18n.enableFallback = true;

export default i18n;
