/**
 * POST /projects/api/advise — Claude call for the Camera & Framing Advisor
 * and Night Sky Post Studio (both send one user message: up to 2 photos + text).
 *
 * Lives under /projects, so the Projects gate (../_middleware.js) only lets
 * unlocked visitors reach it. Calls Anthropic directly from the site; the
 * public wsp-api Worker is no longer involved for this app.
 *
 * Needs, in Cloudflare Pages → Settings → Variables and Secrets (Production, Secret):
 *   ANTHROPIC_API_KEY   same key the wsp-api Worker uses
 */

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS_CAP = 3000;
const MAX_BODY_BYTES = 6 * 1024 * 1024; // two phone photos at 1280px fit easily
const MAX_IMAGES = 2;

const fail = (status, message) => Response.json({ error: { message } }, { status, headers: { "Cache-Control": "no-store" } });

export async function onRequestPost({ request, env }) {
  if (!env.ANTHROPIC_API_KEY) return fail(500, "The app isn't configured yet.");

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return fail(413, "Photo too large.");
  let body; try { body = JSON.parse(raw); } catch { return fail(400, "Bad request."); }

  // Only the shape this app sends: one user message with up to 2 images + text.
  const msgs = body.messages;
  if (!Array.isArray(msgs) || msgs.length !== 1 || msgs[0].role !== "user" || !Array.isArray(msgs[0].content)) return fail(400, "Bad request.");
  const content = msgs[0].content;
  const images = content.filter(c => c && c.type === "image");
  const texts = content.filter(c => c && c.type === "text" && typeof c.text === "string");
  if (images.length > MAX_IMAGES || texts.length < 1 || images.length + texts.length !== content.length) return fail(400, "Bad request.");
  if (images.some(i => i.source?.type !== "base64" || !/^image\/(jpeg|png|webp)$/.test(i.source?.media_type || ""))) return fail(400, "Unsupported photo type.");

  const asked = Number(body.max_tokens);
  const maxTokens = Number.isFinite(asked) && asked > 0 ? Math.min(Math.round(asked), MAX_TOKENS_CAP) : 2500;

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": String(env.ANTHROPIC_API_KEY).trim(), "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: "user", content }] }),
  });
  const data = await upstream.text();
  // A rejected API key must not look like the Projects gate's 401 to the apps.
  if (upstream.status === 401 || upstream.status === 403) {
    console.error("Anthropic auth failed", upstream.status, data.slice(0, 300));
    return Response.json({ error: { type: "upstream_auth", message: "The site's Claude API key was rejected." } }, { status: 500, headers: { "Cache-Control": "no-store" } }); // not 502: Cloudflare replaces 502 bodies with its own page
  }
  return new Response(data, { status: upstream.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
