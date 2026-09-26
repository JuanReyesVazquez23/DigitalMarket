// POST /api/upload — sube imagen de producto a Vercel Blob (requiere login).
// Sin BLOB_READ_WRITE_TOKEN responde 501 y el admin usa base64 local (dev).
import { promises as fs } from "node:fs";
import type { IncomingMessage } from "node:http";
import { put } from "@vercel/blob";
import formidable, { type File as FormidableFile } from "formidable";
import { getAuthUser, isAdminUser, send } from "./_auth.js";
import type { Handler } from "./_types.js";

const MAX_BYTES = 4 * 1024 * 1024;

function safeName(original: unknown): string {
  const base = String(original || "imagen")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .slice(-80);
  return `productos/${Date.now()}-${Math.random().toString(36).slice(2)}-${base || "imagen"}`;
}

interface ParsedUpload {
  filepath: string;
  originalFilename?: string | null;
  mimetype?: string | null;
}

const handler: Handler = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { message: "Método no permitido." });
  }
  if (!getAuthUser(req)) return send(res, 401, { message: "No autorizado." });
  if (!isAdminUser(req)) return send(res, 403, { message: "Solo el administrador." });
  const token = process.env.BLOB_READ_WRITE_TOKEN || "";
  if (!token) return send(res, 501, { message: "Storage no configurado." });

  let file: ParsedUpload | undefined;
  try {
    const form = formidable({ multiples: false, maxFileSize: MAX_BYTES, maxTotalFileSize: MAX_BYTES });
    const [, files] = await form.parse(req as unknown as IncomingMessage);
    const raw = (files as Record<string, unknown>).file;
    const up = (Array.isArray(raw) ? raw[0] : raw) as FormidableFile | undefined;
    if (!up?.filepath) return send(res, 400, { message: "Falta el archivo (campo file)." });
    file = { filepath: up.filepath, originalFilename: up.originalFilename, mimetype: up.mimetype };
  } catch {
    return send(res, 400, { message: "Archivo inválido o mayor a 4MB." });
  }
  if (!String(file.mimetype || "").startsWith("image/")) {
    return send(res, 400, { message: "Solo se permiten imágenes (JPG, PNG, WEBP)." });
  }
  try {
    const data = await fs.readFile(file.filepath);
    const blob = await put(safeName(file.originalFilename), data, {
      access: "public",
      contentType: file.mimetype || "image/jpeg",
      token,
    });
    try {
      await fs.unlink(file.filepath);
    } catch {
      /* temporal, da igual */
    }
    return send(res, 201, { url: blob.url });
  } catch {
    return send(res, 500, { message: "No se pudo subir la imagen." });
  }
};

export default handler;
