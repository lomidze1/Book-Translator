export type Role = 'USER' | 'ADMIN';

export interface User {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  avatar: string | null;
  role: Role;
  locale: string;
  emailVerified: Date | null;
  phoneVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  avatar: string | null;
  role: Role;
  locale: string;
  emailVerified: Date | null;
  phoneVerified: boolean;
  createdAt: Date;
}

export interface UpdateProfileInput {
  name?: string;
  locale?: string;
  avatar?: string;
}
