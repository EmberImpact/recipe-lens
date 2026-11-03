// The shared family recipe box.
//   GET    /api/recipes              -> {recipes: [...]}
//   POST   /api/recipes              {recipe, photo, addedBy}  -> {recipe}
//   PATCH  /api/recipes?id=...       {favourite?, tags?, recipe?, cooked?: true}  -> {recipe}
//   DELETE /api/recipes?id=...       -> {ok: true}
import { route, db, newId, normalise, HttpError } from "./_lib.js";

const KEY = "recipes";
const MAX_THUMB = 120_000;   // small grid picture, as a data URL
const MAX_PHOTO = 900_000;   // large header picture, as a data URL
const isImage = (s, max) => typeof s === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(s) && s.length <= max;

async function load(id) {
  const raw = await db().hget(KEY, id);
  if (!raw) throw new HttpError(404, "That recipe has been deleted.");
  return JSON.parse(raw);
}
const save = (r) => db().hset(KEY, { [r.id]: JSON.stringify(r) });

export default route(async (req, res) => {
  const id = typeof req.query.id === "string" ? req.query.id : null;

  if (req.method === "GET") {
    const all = (await db().hgetall(KEY)) || {};
    const recipes = Object.values(all).map((v) => { try { return JSON.parse(v); } catch { return null; } }).filter(Boolean);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ recipes });
  }

  if (req.method === "POST") {
    const body = req.body || {};
    const now = new Date().toISOString();
    const recipe = {
      ...normalise(body.recipe || {}),
      id: newId(), createdAt: now, updatedAt: now,
      addedBy: String(body.addedBy || "").trim().slice(0, 40) || null,
      thumb: isImage(body.recipe?.thumb, MAX_THUMB) ? body.recipe.thumb : null,
      hasPhoto: isImage(body.photo, MAX_PHOTO),
      favourite: false, cookedCount: 0, lastCooked: null,
    };
    await save(recipe);
    if (recipe.hasPhoto) await db().set("photo:" + recipe.id, body.photo);
    return res.status(201).json({ recipe });
  }

  if (!id) throw new HttpError(400, "Missing recipe id.");

  if (req.method === "PATCH") {
    const body = req.body || {};
    const r = await load(id);
    if (body.recipe) Object.assign(r, normalise(body.recipe));
    if (typeof body.favourite === "boolean") r.favourite = body.favourite;
    if (Array.isArray(body.tags)) r.tags = normalise({ tags: body.tags }).tags;
    if (body.cooked === true) { r.cookedCount = (r.cookedCount || 0) + 1; r.lastCooked = new Date().toISOString(); }
    r.updatedAt = new Date().toISOString();
    await save(r);
    return res.status(200).json({ recipe: r });
  }

  if (req.method === "DELETE") {
    await db().hdel(KEY, id);
    await db().del("photo:" + id);
    return res.status(200).json({ ok: true });
  }

  throw new HttpError(405, "Method not allowed.");
});
