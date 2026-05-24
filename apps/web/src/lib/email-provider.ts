const WEBMAIL_BY_DOMAIN: Record<string, string> = {
  'gmail.com': 'https://mail.google.com',
  'googlemail.com': 'https://mail.google.com',
  'yahoo.com': 'https://mail.yahoo.com',
  'yahoo.co.uk': 'https://mail.yahoo.com',
  'ymail.com': 'https://mail.yahoo.com',
  'outlook.com': 'https://outlook.live.com',
  'hotmail.com': 'https://outlook.live.com',
  'live.com': 'https://outlook.live.com',
  'msn.com': 'https://outlook.live.com',
  'icloud.com': 'https://www.icloud.com/mail',
  'me.com': 'https://www.icloud.com/mail',
  'mac.com': 'https://www.icloud.com/mail',
  'proton.me': 'https://mail.proton.me',
  'protonmail.com': 'https://mail.proton.me',
  'mail.ru': 'https://e.mail.ru',
  'yandex.ru': 'https://mail.yandex.ru',
  'yandex.com': 'https://mail.yandex.com',
  'gmx.com': 'https://www.gmx.com/mail',
  'gmx.net': 'https://www.gmx.net/mail',
  'zoho.com': 'https://mail.zoho.com',
  'aol.com': 'https://mail.aol.com',
};

export function getWebmailUrl(email?: string | null): string {
  if (!email) return 'https://mail.google.com';
  const at = email.lastIndexOf('@');
  if (at === -1) return 'https://mail.google.com';
  const domain = email.slice(at + 1).toLowerCase().trim();
  return WEBMAIL_BY_DOMAIN[domain] ?? 'https://mail.google.com';
}
