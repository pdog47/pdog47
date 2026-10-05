#!/usr/bin/env node
/* codex-usage-web.js — a phone-friendly page showing your Codex usage, served over Tailscale.

   Runs on your PC next to the StarNet connector and reuses the same reading code. It listens only
   on your PC's Tailscale address (100.x.y.z), so only your own devices signed in to your Tailscale
   network can open it, never the internet or other machines on your Wi-Fi. No npm install, Node 18+.

   Usage:
     node codex-usage-web.js                 serve at http://<tailscale-ip>:8766 (waits for Tailscale to come up)
   Options:
     --port <port>        port to listen on (default 8766)
     --bind <address>     listen on this address instead of the Tailscale one (e.g. 127.0.0.1 to test on the PC)
     --codex-home, --offline, --warn, --stop   same as codex-usage-mcp.js */
'use strict';

const os = require('os');
const { getUsage, parseArgs } = require('./codex-usage-mcp.js');

const CACHE_MS = 60 * 1000;        // reuse a reading for a minute so reloads don't hit chatgpt.com each time
const FORCE_MIN_MS = 10 * 1000;    // the Refresh button can skip the cache, at most once every 10 seconds

function parseWebArgs(argv) {
  const opts = parseArgs(argv);
  opts.webPort = 8766;
  opts.bind = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port') opts.webPort = Number(argv[++i]);
    else if (argv[i] === '--bind') opts.bind = argv[++i];
  }
  return opts;
}

// Tailscale gives each device an address in 100.64.0.0/10.
function isTailscaleIp(ip) {
  const m = /^100\.(\d+)\.\d+\.\d+$/.exec(ip);
  return !!m && Number(m[1]) >= 64 && Number(m[1]) <= 127;
}

function findTailscaleIp() {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) if (a.family === 'IPv4' && isTailscaleIp(a.address)) return a.address;
  }
  return null;
}

// Guards against DNS rebinding: only answer to names that can only mean this PC.
function hostAllowed(hostHeader, bindIp) {
  const host = String(hostHeader || '').replace(/:\d+$/, '').toLowerCase();
  if (!host) return false;
  if (host === bindIp || isTailscaleIp(host)) return true;
  if (['127.0.0.1', 'localhost', '[::1]'].includes(host)) return true;
  if (host.endsWith('.ts.net')) return true;                 // Tailscale MagicDNS full name
  return /^[a-z0-9-]+$/.test(host);                          // MagicDNS short name, e.g. "home-pc"
}

let cache = null;   // { at, body }
let inflight = null;

async function readUsage(opts, force) {
  const age = cache ? Date.now() - cache.at : Infinity;
  if (cache && (age < (force ? FORCE_MIN_MS : CACHE_MS))) return cache.body;
  if (!inflight) {
    inflight = getUsage(opts)
      .then(u => ({ ok: true, usage: u }), e => ({ ok: false, error: e.message }))
      .then(body => { cache = { at: Date.now(), body }; inflight = null; return body; });
  }
  return inflight;
}

const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#14161a"/>'
  + '<rect x="12" y="27" width="40" height="10" rx="5" fill="#2b2f36"/><rect x="12" y="27" width="26" height="10" rx="5" fill="#3ccf8e"/></svg>';

const MANIFEST = JSON.stringify({
  name: 'Codex usage', short_name: 'Codex', start_url: '/', display: 'standalone',
  background_color: '#14161a', theme_color: '#14161a',
  icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }]
});

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Codex">
<meta name="theme-color" content="#14161a">
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="/icon.svg">
<title>Codex usage</title>
<style>
  :root { --bg:#f4f5f7; --card:#fff; --text:#16181d; --muted:#626a76; --track:#e3e6eb;
          --ok:#1f9d63; --warn:#c98a00; --bad:#d6453d; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#14161a; --card:#1d2026; --text:#eef0f3; --muted:#9aa2ad; --track:#2b2f36;
            --ok:#3ccf8e; --warn:#f0b429; --bad:#ff6b61; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
         font:16px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         padding: max(16px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom)); }
  main { max-width: 480px; margin: 0 auto; }
  h1 { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 8px 0 12px; }
  .card { background: var(--card); border-radius: 16px; padding: 18px; margin-bottom: 12px; }
  .verdict { font-size: 30px; font-weight: 700; margin: 0; }
  .verdict.ok { color: var(--ok); } .verdict.warn { color: var(--warn); } .verdict.bad { color: var(--bad); }
  .lead { color: var(--muted); margin: 4px 0 0; }
  .win-head { display:flex; justify-content:space-between; align-items:baseline; }
  .win-name { font-weight: 600; text-transform: capitalize; }
  .win-pct { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .track { height: 12px; background: var(--track); border-radius: 6px; overflow: hidden; margin: 10px 0 8px; }
  .fill { height: 100%; border-radius: 6px; background: var(--ok); transition: width .4s; }
  .fill.warn { background: var(--warn); } .fill.bad { background: var(--bad); }
  .detail { color: var(--muted); font-size: 14px; margin: 0; }
  .note { font-size: 14px; color: var(--warn); }
  .error { color: var(--bad); }
  .meta { color: var(--muted); font-size: 13px; text-align: center; margin: 14px 0; }
  button { width: 100%; font: inherit; font-weight: 600; padding: 14px; border: 0; border-radius: 12px;
           background: var(--text); color: var(--bg); cursor: pointer; }
  button:disabled { opacity: .5; }
</style>
</head>
<body>
<main>
  <h1>Codex usage</h1>
  <div id="out"><div class="card"><p class="lead">Loading…</p></div></div>
  <p class="meta" id="meta"></p>
  <button id="refresh" type="button">Refresh</button>
</main>
<script>
  const out = document.getElementById('out'), meta = document.getElementById('meta'), btn = document.getElementById('refresh');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  const toneFor = p => p >= 90 ? 'bad' : p >= 70 ? 'warn' : '';
  let lastLoad = 0;

  function render(body) {
    if (!body.ok) {
      out.innerHTML = '<div class="card"><p class="verdict bad">Can\\'t read usage</p><p class="lead error">' + esc(body.error) + '</p></div>';
      return;
    }
    const u = body.usage;
    let html = '<div class="card"><p class="verdict ' + esc(u.tone) + '">' + esc(u.verdict) + '</p>'
      + '<p class="lead">' + esc(u.usedPercent) + '% of your tightest limit used</p>'
      + (u.note ? '<p class="note">' + esc(u.note) + '</p>' : '') + '</div>';
    for (const w of u.windows) {
      const pace = w.paceDelta == null ? '' : w.paceDelta === 0 ? ' · on an even pace'
        : w.paceDelta > 0 ? ' · ' + w.paceDelta + ' pts ahead of pace' : ' · ' + (-w.paceDelta) + ' pts under pace';
      html += '<div class="card"><div class="win-head"><span class="win-name">' + esc(w.name) + ' limit</span>'
        + '<span class="win-pct">' + esc(w.usedPercent) + '%</span></div>'
        + '<div class="track"><div class="fill ' + toneFor(w.usedPercent) + '" style="width:' + Number(w.usedPercent) + '%"></div></div>'
        + '<p class="detail">' + esc(w.remainingPercent) + '% left'
        + (w.resetsIn ? ' · resets in ' + esc(w.resetsIn) : '') + esc(pace) + '</p></div>';
    }
    out.innerHTML = html;
    meta.textContent = (u.source === 'live from chatgpt.com' ? 'Live' : 'From your last Codex session')
      + ' · as of ' + u.observedAt + (u.plan ? ' · ' + u.plan + ' plan' : '');
  }

  async function load(force) {
    btn.disabled = true; btn.textContent = 'Refreshing…';
    try {
      const res = await fetch('/api/usage' + (force ? '?fresh=1' : ''), { cache: 'no-store' });
      render(await res.json());
      lastLoad = Date.now();
    } catch (e) {
      out.innerHTML = '<div class="card"><p class="verdict bad">Can\\'t reach your PC</p>'
        + '<p class="lead">Check that the PC is on and awake, and that Tailscale is connected on both devices.</p></div>';
      meta.textContent = '';
    } finally { btn.disabled = false; btn.textContent = 'Refresh'; }
  }

  btn.addEventListener('click', () => load(true));
  // Refresh when you come back to the page, and every 5 minutes while it's open.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastLoad > 60000) load(false); });
  setInterval(() => { if (!document.hidden) load(false); }, 5 * 60 * 1000);
  load(false);
</script>
</body>
</html>`;

function serve(opts, bindIp) {
  const http = require('http');
  const send = (res, code, type, body) => {
    res.writeHead(code, {
      'Content-Type': type, 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer'
    });
    res.end(body);
  };
  const server = http.createServer(async (req, res) => {
    if (!hostAllowed(req.headers.host, bindIp)) return send(res, 403, 'text/plain', 'forbidden');
    if (req.method !== 'GET') return send(res, 405, 'text/plain', 'method not allowed');
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/') return send(res, 200, 'text/html; charset=utf-8', PAGE);
    if (url.pathname === '/api/usage') {
      const body = await readUsage(opts, url.searchParams.has('fresh'));
      return send(res, 200, 'application/json', JSON.stringify(body));
    }
    if (url.pathname === '/manifest.json') return send(res, 200, 'application/manifest+json', MANIFEST);
    if (url.pathname === '/icon.svg') return send(res, 200, 'image/svg+xml', ICON);
    send(res, 404, 'text/plain', 'not found');
  });
  server.on('error', e => {
    console.error(e.code === 'EADDRINUSE' ? 'Port ' + opts.webPort + ' is already in use (is it already running?)' : String(e));
    process.exit(1);
  });
  server.listen(opts.webPort, bindIp, () => {
    console.log('Codex usage page running. Open this on your phone: http://' + bindIp + ':' + opts.webPort);
    console.log('Leave this window open (or use install-phone-startup.cmd to start it hidden at login).');
  });
}

if (require.main === module) {
  const opts = parseWebArgs(process.argv.slice(2));
  if (opts.bind) {
    serve(opts, opts.bind);
  } else {
    // At login Tailscale may not be connected yet, so keep checking until it is.
    let waited = false;
    const tryStart = () => {
      const ip = findTailscaleIp();
      if (ip) return serve(opts, ip);
      if (!waited) console.log('Waiting for Tailscale to connect (no 100.x.y.z address on this PC yet)...');
      waited = true;
      setTimeout(tryStart, 15000);
    };
    tryStart();
  }
}

module.exports = { isTailscaleIp, hostAllowed };
