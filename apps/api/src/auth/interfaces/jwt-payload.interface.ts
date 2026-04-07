export interface JwtPayload {
  sub: string;
  email: string | null;
  tokenVersion?: number;
  iat?: number;
  exp?: number;
}
