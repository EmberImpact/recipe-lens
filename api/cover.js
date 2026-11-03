// The family photo shown on the home screen. Kept in the database, not in the code,
// so it's only visible to people with the family code.
//   GET /api/cover            -> {photo} or 404
//   PUT /api/cover  {photo}   -> {ok: true}
import { route, db, HttpError } from "./_lib.js";

const KEY = "cover-photo";
const MAX_PHOTO = 1_200_000; // data URL length

export default route(async (req, res) => {
  if (req.method === "GET") {
    const photo = await db().get(KEY);
    if (!photo) throw new HttpError(404, "No family photo yet.");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ photo });
  }
  if (req.method === "PUT") {
    const photo = req.body?.photo;
    if (typeof photo !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(photo)) throw new HttpError(400, "That isn't a JPEG, PNG or WebP image.");
    if (photo.length > MAX_PHOTO) throw new HttpError(413, "That photo is too large.");
    await db().set(KEY, photo);
    return res.status(200).json({ ok: true });
  }
  throw new HttpError(405, "Method not allowed.");
});
