// Shared helpers for the API routes. Files starting with "_" are not routes on Vercel.
import Anthropic from "@anthropic-ai/sdk";
import { Redis } from "@upstash/redis";
import { timingSafeEqual, randomBytes } from "node:crypto";

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const EFFORT = process.env.CLAUDE_EFFORT || "low";

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ---------- storage ----------
// Recipes live in one Redis hash ("recipes": id -> JSON). Each recipe's large photo
// is kept under its own key ("photo:<id>") so the recipe list stays small.
let redis;
export function db() {
  if (!redis) {
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) throw new HttpError(500, "The recipe database isn't connected yet. See step 4 of the setup guide.");
    redis = new Redis({ url, token, automaticDeserialization: false });
  }
  return redis;
}
export const newId = () => "r" + Date.now().toString(36) + randomBytes(3).toString("hex");

// ---------- family code ----------
function checkFamily(req) {
  const want = process.env.FAMILY_CODE;
  if (!want) throw new HttpError(500, "FAMILY_CODE isn't set. See step 3 of the setup guide.");
  const got = Buffer.from(String(req.headers["x-family-code"] || ""));
  const expected = Buffer.from(want);
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) throw new HttpError(401, "That family code isn't right.");
}

// Wraps a route: checks the family code, turns errors into JSON responses.
export function route(handler) {
  return async (req, res) => {
    try {
      try { checkFamily(req); }
      catch (e) { await new Promise((r) => setTimeout(r, 800)); throw e; } // slow down guessing
      await handler(req, res);
    } catch (e) {
      if (!(e instanceof HttpError)) console.error(e);
      const status = e instanceof HttpError ? e.status : 500;
      res.status(status).json({ error: e instanceof HttpError ? e.message : "Something went wrong on the server." });
    }
  };
}

// ---------- Claude ----------
let client;

export async function askClaude(content) {
  if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(500, "ANTHROPIC_API_KEY isn't set. See step 3 of the setup guide.");
  client ??= new Anthropic(); // reads ANTHROPIC_API_KEY
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: EFFORT },
      // If a safety check declines the request, Anthropic retries it on a suitable model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new HttpError(500, "The Anthropic API key is missing or wrong. See step 3 of the setup guide.");
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "Claude is busy. Wait a minute, then try again.");
    if (e instanceof Anthropic.BadRequestError) { console.error(e); throw new HttpError(502, "Claude couldn't take this request: " + e.message); }
    if (e instanceof Anthropic.APIError) { console.error(e); throw new HttpError(502, "Claude is having trouble right now. Try again shortly."); }
    throw e;
  }
  if (response.stop_reason === "refusal") throw new HttpError(422, "Claude declined to read this.");
  if (response.stop_reason === "max_tokens") throw new HttpError(422, "The recipe was too long to read in one go. Try fewer pages.");
  return response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

export function parseJson(text) {
  const t = String(text || "").trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1);
  try { return JSON.parse(body); } catch { return null; }
}

// ---------- recipe shape ----------
const num = (v) => (typeof v === "number" && isFinite(v) ? v : isFinite(parseFloat(v)) ? parseFloat(v) : null);
const str = (v, max = 2000) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const list = (v, max) => (Array.isArray(v) ? v : []).slice(0, max);

// The recipe fields Claude produces and people may edit.
export function normalise(o) {
  return {
    title: str(o.title, 200) || "Untitled recipe",
    description: str(o.description, 500),
    servings: num(o.servings), yield: str(o.yield, 100),
    prepTime: str(o.prepTime, 50), cookTime: str(o.cookTime, 50), totalTime: str(o.totalTime, 50),
    ingredients: list(o.ingredients, 120).filter((i) => i && str(i.item)).map((i) => ({
      group: str(i.group, 100), qty: num(i.qty), qtyMax: num(i.qtyMax), unit: str(i.unit, 40), item: str(i.item, 200), note: str(i.note, 300),
    })),
    steps: list(o.steps, 80).map((s) => str(s)).filter(Boolean),
    notes: list(o.notes, 40).map((s) => str(s, 1000)).filter(Boolean),
    tags: [...new Set(list(o.tags, 12).map((t) => str(t, 30)).filter(Boolean).map((t) => t.toLowerCase()))],
    missing: list(o.missing, 20).map((s) => str(s, 300)).filter(Boolean),
  };
}

export const PROMPT = `These photos show one recipe (a cookbook page, handwritten card, magazine cutting or screen). Photos are pages in order. Read everything carefully, including handwriting and margin notes.

Reply with only one JSON object in this shape:
{"title": string, "description": string|null (one short sentence), "servings": number|null, "yield": string|null (e.g. "12 biscuits"), "prepTime": string|null, "cookTime": string|null, "totalTime": string|null (times like "25 min" or "1 hr 10 min"),
 "ingredients": [{"group": string|null (sub-heading such as "For the sauce"), "qty": number|null (decimal, e.g. 0.5 for 1/2), "qtyMax": number|null (for ranges like 2-3), "unit": string|null (as written, e.g. "g", "tbsp", "cup", "cloves"), "item": string, "note": string|null (prep like "finely chopped")}],
 "steps": [string] (one instruction per item, numbering removed),
 "notes": [string] (tips, oven temperatures not in steps, storage, variations),
 "tags": [string] (up to 4 short lowercase tags such as the meal, main ingredient or cuisine),
 "missing": [string] (anything unreadable or cut off; empty if none)}
Copy wording faithfully; do not invent quantities or steps. If no recipe is visible reply {"error": "<short reason>"}.`;
