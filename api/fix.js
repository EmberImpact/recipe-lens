// POST /api/fix  {recipe, instruction}  ->  {recipe}
// Applies a cook's correction ("step 3 should be 180°C") to a recipe. Does not save it.
import { route, askClaude, parseJson, normalise, HttpError } from "./_lib.js";

export default route(async (req, res) => {
  if (req.method !== "POST") throw new HttpError(405, "Use POST.");
  const instruction = String(req.body?.instruction || "").trim().slice(0, 1000);
  if (!instruction) throw new HttpError(400, "Say what needs changing.");
  const recipe = normalise(req.body?.recipe || {});

  const text = await askClaude(
    `Here is a recipe as JSON:\n${JSON.stringify(recipe)}\n\n` +
    `Apply this correction from the cook:\n<correction>\n${instruction}\n</correction>\n\n` +
    `Reply with only the full corrected JSON object, same shape and field names. Change nothing else.`
  );
  const out = parseJson(text);
  if (!out || !Array.isArray(out.ingredients)) throw new HttpError(422, "Claude's answer came back garbled. Try rewording the correction.");
  res.status(200).json({ recipe: normalise(out) });
});
