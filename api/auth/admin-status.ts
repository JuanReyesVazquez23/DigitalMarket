// GET /api/auth/admin-status — dice si el logueado es el admin configurado.
import { adminUsername, getAuthUser, send } from "../_auth.js";
import type { Handler } from "../_types.js";

const handler: Handler = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { message: "Método no permitido." });
  }
  const u = getAuthUser(req);
  if (!u) return send(res, 401, { message: "No autorizado." });
  const isAdmin = u.username.trim().toLowerCase() === adminUsername();
  return send(res, 200, { username: u.username, isAdmin });
};

export default handler;
