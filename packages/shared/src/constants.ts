// Pricing (in GEL)
export const PRICING = {
  NEW_TRANSLATION: 10,
  EXISTING_TRANSLATION: 5,
  ENGLISH_ORIGINAL: 1, // in USD
} as const;

// File upload limits
export const FILE_LIMITS = {
  MAX_SIZE_MB: 50,
  MAX_SIZE_BYTES: 50 * 1024 * 1024,
  ALLOWED_FORMATS: ['pdf', 'epub', 'txt', 'docx'] as const,
  ALLOWED_MIME_TYPES: [
    'application/pdf',
    'application/epub+zip',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ] as const,
} as const;

// JWT
export const JWT = {
  ACCESS_EXPIRY: '15m',
  REFRESH_EXPIRY: '30d',
} as const;

// Supported languages
export const LANGUAGES = {
  SOURCE: ['en'] as const,
  TARGET: ['ka'] as const,
} as const;

// API
export const API = {
  DEFAULT_PORT: 4000,
  PREFIX: 'api',
} as const;
