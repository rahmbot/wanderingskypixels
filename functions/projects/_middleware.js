/**
 * Projects gate — runs on Cloudflare Pages for every request under /projects.
 *
 * Visitors must enter the access code once. A signed cookie then unlocks every
 * Projects page (overviews, apps, and /projects/api/*) for 30 days. Nothing under
 * /projects is served without it, including direct links to app pages.
 *
 * Set in Cloudflare → Workers & Pages → wanderingskypixels → Settings →
 * Variables and Secrets (Production, type: Secret):
 *   PROJECTS_PASSWORD   the access code you give testers
 * Changing it logs everyone out.
 */

const COOKIE = "wsp_projects";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const enc = new TextEncoder();

async function accessToken(secret) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("wsp-projects-v1"));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function sameText(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return "";
}

function safeNext(value) {
  const v = String(value || "");
  return v.startsWith("/projects") && !v.startsWith("//") && !v.includes("\\") ? v : "/projects/";
}

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function gatePage({ next = "/projects/", error = "" } = {}, status = 401) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>Projects Access | WanderingSkyPixels</title>
<link rel="icon" href="/logo.png">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400&family=DM+Mono:wght@400&family=Outfit:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  :root{--night:#050b18;--card:#0d1a2e;--star:#e8e0cc;--gold:#c8a96e;--aurora:#4fc4a0;--muted:#8193ad;--dim:#2a3d5a;--no:#e07a6a}
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{min-height:100%;background:var(--night);color:var(--star)}
  body{font-family:'Outfit',system-ui,sans-serif;font-weight:300;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:32px max(16px,env(safe-area-inset-right,0px)) 48px max(16px,env(safe-area-inset-left,0px));
    background:radial-gradient(1px 1px at 12% 18%,#fff8,transparent),radial-gradient(1px 1px at 68% 9%,#fff6,transparent),radial-gradient(1px 1px at 84% 42%,#fff5,transparent),radial-gradient(1px 1px at 27% 72%,#fff4,transparent),radial-gradient(1px 1px at 52% 88%,#fff5,transparent),var(--night)}
  .box{width:100%;max-width:400px;display:flex;flex-direction:column;gap:22px}
  .logo img{height:42px;width:auto;display:block}
  .label{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold)}
  h1{font-family:'Cormorant Garamond',Georgia,serif;font-weight:300;font-size:40px;line-height:1.1;margin-top:8px}
  p{color:var(--muted);font-size:15px;line-height:1.7}
  form{display:flex;flex-direction:column;gap:12px;background:var(--card);border:1px solid var(--dim);border-radius:2px;padding:20px}
  label{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
  input{width:100%;min-height:46px;font:400 16px 'DM Mono',monospace;color:var(--star);background:var(--night);border:1px solid var(--dim);border-radius:2px;padding:10px 12px}
  input:focus{outline:2px solid var(--gold);outline-offset:1px}
  button{min-height:46px;border:0;border-radius:2px;background:linear-gradient(135deg,var(--gold),#a07840);color:var(--night);font:500 13px 'DM Mono',monospace;letter-spacing:.14em;text-transform:uppercase;cursor:pointer}
  button:focus-visible{outline:2px solid var(--star);outline-offset:2px}
  .err{color:var(--no);font-size:14px}
  .foot{font-size:13px;color:var(--muted)}
  .foot a{color:var(--gold);text-decoration:none}
</style>
</head>
<body>
  <div class="box">
    <a class="logo" href="/index.html"><img src="/logo.png" alt="WanderingSkyPixels"></a>
    <div>
      <div class="label">Projects · Invite only</div>
      <h1>Enter your access code</h1>
    </div>
    <p>My projects and beta apps are open to invited testers while they're in development. Enter the code I shared with you.</p>
    <form method="POST" action="/projects/unlock">
      <input type="hidden" name="next" value="${escapeHtml(next)}">
      <label for="secret">Access code</label>
      <input id="secret" name="secret" type="password" autocomplete="current-password" autocapitalize="none" autocorrect="off" spellcheck="false" required autofocus>
      ${error ? `<div class="err" role="alert">${escapeHtml(error)}</div>` : ""}
      <button type="submit">Unlock projects</button>
    </form>
    <div class="foot">Want to try something? <a href="/contact.html">Ask me for access</a> · <a href="/index.html">Back to the site</a></div>
  </div>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const isApi = path.startsWith("/projects/api/");

  const secret = String(env.PROJECTS_PASSWORD || "").trim();
  if (!secret) {
    // Fail closed: nothing under /projects is served until the code is configured.
    if (isApi) return Response.json({ error: { message: "Projects access is not configured." } }, { status: 503 });
    return gatePage({ error: "Projects are closed right now. Please check back soon." }, 503);
  }
  const token = await accessToken(secret);

  // Submit the access code
  if (path === "/projects/unlock" && request.method === "POST") {
    let form; try { form = await request.formData(); } catch { form = new FormData(); }
    const entered = String(form.get("secret") || "").trim().toLowerCase();
    const dest = safeNext(form.get("next"));
    if (entered && sameText(entered, secret.toLowerCase())) {
      return new Response(null, {
        status: 303,
        headers: {
          Location: dest,
          "Set-Cookie": `${COOKIE}=${token}; Path=/projects; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
          "Cache-Control": "no-store",
        },
      });
    }
    await new Promise(r => setTimeout(r, 900)); // slow down guessing
    return gatePage({ next: dest, error: "That code didn't work. Check it and try again." }, 401);
  }

  // Sign out
  if (path === "/projects/lock") {
    return new Response(null, {
      status: 303,
      headers: { Location: "/projects/", "Set-Cookie": `${COOKIE}=; Path=/projects; Max-Age=0; HttpOnly; Secure; SameSite=Lax`, "Cache-Control": "no-store" },
    });
  }

  // Already unlocked
  if (sameText(readCookie(request, COOKIE), token)) {
    const res = await next();
    const out = new Response(res.body, res);
    out.headers.set("Cache-Control", "private, no-store");
    out.headers.set("X-Robots-Tag", "noindex, nofollow");
    return out;
  }

  if (isApi) return Response.json({ error: { message: "Access code required." } }, { status: 401 });
  return gatePage({ next: path + url.search });
}
