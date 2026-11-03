// POST /api/read  {images: ["data:image/jpeg;base64,...", ...]}  ->  {recipe} or {error}
import { route, askClaude, parseJson, normalise, PROMPT, HttpError } from "./_lib.js";

const MAX_PAGES = 5;
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

export default route(async (req, res) => {
  if (req.method !== "POST") throw new HttpError(405, "Use POST.");
  const images = Array.isArray(req.body?.images) ? req.body.images : [];
  if (!images.length) throw new HttpError(400, "Add at least one photo.");
  if (images.length > MAX_PAGES) throw new HttpError(400, `Up to ${MAX_PAGES} pages per recipe.`);

  const content = images.map((img) => {
    const m = DATA_URL.exec(String(img));
    if (!m) throw new HttpError(400, "One of the photos isn't a JPEG, PNG or WebP image.");
    return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } };
  });
  content.push({ type: "text", text: PROMPT });

  const out = parseJson(await askClaude(content));
  if (!out || typeof out !== "object") throw new HttpError(422, "Claude's answer came back garbled. Try again, or retake the photos closer.");
  if (out.error || !Array.isArray(out.ingredients)) {
    return res.status(200).json({ error: out.error ? `No recipe found: ${out.error}` : "Claude couldn't find a recipe in these photos. Try a sharper, closer shot." });
  }
  res.status(200).json({ recipe: normalise(out) });
});
