// GET /api/photo?id=...  ->  {photo: "data:image/jpeg;base64,..."}  (the large header picture)
import { route, db, HttpError } from "./_lib.js";

export default route(async (req, res) => {
  if (req.method !== "GET") throw new HttpError(405, "Use GET.");
  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) throw new HttpError(400, "Missing recipe id.");
  const photo = await db().get("photo:" + id);
  if (!photo) throw new HttpError(404, "No photo for this recipe.");
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.status(200).json({ photo });
});
