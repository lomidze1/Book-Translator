export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: {
    id: string;
    email: string | null;
    name: string | null;
    avatar: string | null;
  };
}

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface JwtPayload {
  sub: string;
  email: string | null;
  iat?: number;
  exp?: number;
}
