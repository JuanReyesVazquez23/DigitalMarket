// Capa compartida: hash PBKDF2 (mismo formato que el backend C#), JWT y helpers HTTP.
import crypto from "node:crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { VercelReq, VercelRes } from "./_types.js";

const ITERATIONS = 210_000;
export const CATEGORIES = ["Consolas", "Videojuegos", "Accesorios", "PC", "Monitores"];

function jwtKey(): string {
  const k = process.env.JWT_KEY || "";
  if (k.length < 32) throw new Error("Falta JWT_KEY (mínimo 32 caracteres) en variables de entorno.");
  return k;
}

export function jwtOpts(): {
  issuer: string;
  audience: string;
  accessExpiryMinutes: number;
  refreshDays: number;
} {
  return {
    issuer: process.env.JWT_ISSUER || "DigitalGaming",
    audience: process.env.JWT_AUDIENCE || "DigitalGaming",
    accessExpiryMinutes: Number(process.env.JWT_ACCESS_MINUTES || 15),
    refreshDays: Number(process.env.JWT_REFRESH_DAYS || 30),
  };
}

/** Mismo formato que PasswordHasher.cs: pbkdf2-sha256$iter$salt$hash */
export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const h = crypto.pbkdf2Sync(pw, salt, ITERATIONS, 32, "sha256");
  return `pbkdf2-sha256$${ITERATIONS}$${salt.toString("base64")}$${h.toString("base64")}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  if (!pw || !stored) return false;
  const parts = String(stored).split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return false;
  const iter = Number(parts[1]);
  if (!Number.isInteger(iter)) return false;
  const salt = Buffer.from(parts[2], "base64");
  const expected = Buffer.from(parts[3], "base64");
  const actual = crypto.pbkdf2Sync(pw, salt, iter, expected.length, "sha256");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/** "Consolas" -> 0. Lanza 400 si no es válida. */
export function categoryToInt(c: unknown): number {
  const i = CATEGORIES.indexOf(String(c));
  if (i === -1) {
    const e = new Error("Categoría inválida.") as Error & { status?: number };
    e.status = 400;
    throw e;
  }
  return i;
}

export function categoryToName(n: unknown): string {
  return CATEGORIES[Number(n)] ?? String(n);
}

export interface TokenUser {
  id: string;
  username: string;
  role: string;
}

export function signToken(user: TokenUser): { token: string; expiresAtUtc: string } {
  const o = jwtOpts();
  const token = jwt.sign(
    { sub: user.id, unique_name: user.username, name: user.username, role: user.role },
    jwtKey(),
    { issuer: o.issuer, audience: o.audience, expiresIn: `${Math.max(5, o.accessExpiryMinutes)}m`, jwtid: crypto.randomUUID() }
  );
  const decoded = jwt.decode(token) as { exp: number };
  return { token, expiresAtUtc: new Date(decoded.exp * 1000).toISOString() };
}

/** Token opaco + su hash SHA256 hex (solo el hash se guarda). */
export function newRefreshToken(): { opaque: string; hash: string } {
  const opaque = crypto.randomBytes(64).toString("base64");
  const hash = crypto.createHash("sha256").update(opaque, "utf8").digest("hex");
  return { opaque, hash };
}

export function sha256hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function refreshExpiresAt(): string {
  const o = jwtOpts();
  return new Date(Date.now() + Math.max(1, o.refreshDays) * 86_400_000).toISOString();
}

/** Usuario del Bearer o null (token ausente/inválido/vencido). */
export function getAuthUser(req: VercelReq): TokenUser | null {
  const h = String(req.headers?.authorization ?? "");
  const m = /^Bearer (.+)$/.exec(h);
  if (!m) return null;
  try {
    const o = jwtOpts();
    const p: string | JwtPayload = jwt.verify(m[1], jwtKey(), { issuer: o.issuer, audience: o.audience });
    if (typeof p !== "object" || !p.sub || !p.name) return null;
    return { id: String(p.sub), username: String(p.name), role: String(p.role ?? "cliente") };
  } catch {
    return null;
  }
}

export function send(res: VercelRes, status: number, obj: unknown): unknown {
  return res.status(status).json(obj);
}

/** Nombre del único admin, desde env ADMIN_USERNAME (default "admin" local). */
export function adminUsername(): string {
  return (process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
}

/** True si el Bearer es del usuario admin configurado. */
export function isAdminUser(req: VercelReq): boolean {
  const u = getAuthUser(req);
  return !!u && u.username.trim().toLowerCase() === adminUsername();
}

/** Lee JSON del body (Vercel ya lo parsea; fallback manual). */
export async function readBody(req: VercelReq): Promise<Record<string, unknown>> {
  if (req.body !== undefined) return req.body as Record<string, unknown>;
  const chunks: Uint8Array[] = [];
  for await (const c of req as unknown as AsyncIterable<Uint8Array>) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw === "" ? {} : (JSON.parse(raw) as Record<string, unknown>);
}
