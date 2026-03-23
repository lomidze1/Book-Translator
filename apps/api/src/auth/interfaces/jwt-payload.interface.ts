export interface JwtPayload {
  sub: string;
  email: string | null;
  iat?: number;
  exp?: number;
}
