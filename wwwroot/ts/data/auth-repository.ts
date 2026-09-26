// Layer: ts/data/auth-repository — registro y login contra /api/auth (devuelve JWT).
import type { Session } from "../domain/auth.js";
import { api } from "../services/api-config.js";
import { getSession } from "../services/session-store.js";

const API = api("/api/auth");

async function parseSession(res: Response): Promise<Session> {
  const data = await res.json();
  return {
    accessToken: String(data.accessToken ?? data.AccessToken ?? data.token ?? data.Token ?? ""),
    refreshToken: String(data.refreshToken ?? data.RefreshToken ?? ""),
    username: String(data.username ?? data.Username ?? ""),
    expiresAtUtc: String(data.expiresAtUtc ?? data.ExpiresAtUtc ?? ""),
  };
}

async function failMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    const m = data.message ?? data.title;
    return typeof m === "string" && m !== "" ? m : fallback;
  } catch {
    return fallback;
  }
}

export async function register(username: string, password: string): Promise<Session> {
  const res = await fetch(`${API}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (res.status === 409) throw new Error("Ese nombre ya está en uso. Prueba con otro.");
  if (!res.ok) throw new Error(await failMessage(res, "No se pudo crear la cuenta."));
  return parseSession(res);
}

export async function login(username: string, password: string): Promise<Session> {
  const res = await fetch(`${API}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (res.status === 401) throw new Error("Nombre o contraseña incorrectos.");
  if (!res.ok) throw new Error(await failMessage(res, "No se pudo entrar."));
  return parseSession(res);
}

export async function logoutRemote(refreshToken: string): Promise<void> {
  try {
    const s = getSession();
    await fetch(`${API}/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(s ? { Authorization: `Bearer ${s.accessToken}` } : {}),
      },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    /* salir local siempre funciona aunque falle la red */
  }
}

/** Pregunta al servidor si la sesión actual es la del admin configurado. */
export async function adminStatus(): Promise<{ username: string; isAdmin: boolean }> {
  const s = getSession();
  if (!s) throw new Error("NO_AUTH");
  const res = await fetch(`${API}/admin-status`, {
    headers: { Authorization: `Bearer ${s.accessToken}` },
  });
  if (res.status === 401) throw new Error("NO_AUTH");
  if (!res.ok) throw new Error("No se pudo verificar.");
  const data = await res.json();
  return {
    username: String(data.username ?? data.Username ?? ""),
    isAdmin: Boolean(data.isAdmin ?? data.IsAdmin ?? false),
  };
}
