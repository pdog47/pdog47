#!/usr/bin/env node
/* codex-usage-mcp.js — a tiny MCP server that reports your ChatGPT Codex usage limits.

   Built for StarNet's "Connected apps" widgets: add this as an HTTP connector, then make a
   Progress widget that reads the `codex_usage` tool. No npm install — Node 18+ only.

   Where the numbers come from (first one that works wins):
     1. live   — GET https://chatgpt.com/backend-api/wham/usage, the same endpoint Codex's
                 /status uses, authenticated with the login Codex saved in ~/.codex/auth.json.
     2. logs   — the last `token_count` event Codex wrote to ~/.codex/sessions/**\/rollout-*.jsonl
                 (these carry the same rate-limit snapshot; as fresh as your last Codex turn).

   Your token is only ever sent to chatgpt.com, and is never printed or returned.

   Usage:
     node codex-usage-mcp.js --http [port]   MCP server at http://127.0.0.1:<port>/mcp (default 8765) —
                                             this is what StarNet connects to on Windows
     node codex-usage-mcp.js                 MCP server over stdio (for other MCP clients)
     node codex-usage-mcp.js --print         print the current reading once, for testing
   Options:
     --codex-home <dir>   where Codex keeps auth.json and sessions (default: $CODEX_HOME or ~/.codex)
     --offline            skip the live request; use session logs only
     --warn <pct>         "slow down" threshold (default 70)
     --stop <pct>         "stop" threshold (default 90) */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';

function parseArgs(argv) {
  const opts = { print: false, offline: false, codexHome: null, warn: 70, stop: 90, port: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--print') opts.print = true;
    else if (a === '--offline') opts.offline = true;
    else if (a === '--http') opts.port = Number(argv[i + 1]) > 0 ? Number(argv[++i]) : 8765;
    else if (a === '--codex-home') opts.codexHome = argv[++i];
    else if (a === '--warn') opts.warn = Number(argv[++i]);
    else if (a === '--stop') opts.stop = Number(argv[++i]);
  }
  opts.codexHome = opts.codexHome || process.env.CODEX_HOME
    || path.join(process.env.USERPROFILE || process.env.HOME || os.homedir(), '.codex');
  return opts;
}

// ---------- reading the limits ----------

// One window in a common shape: { usedPercent, windowMinutes, resetsAt (unix seconds) }.
function windowFromApi(w) {
  if (!w || typeof w.used_percent !== 'number') return null;
  return {
    usedPercent: w.used_percent,
    windowMinutes: w.limit_window_seconds ? Math.round(w.limit_window_seconds / 60) : null,
    resetsAt: w.reset_at || (w.reset_after_seconds != null ? Math.floor(Date.now() / 1000) + w.reset_after_seconds : null)
  };
}

function windowFromLog(w, loggedAtMs) {
  if (!w || typeof w.used_percent !== 'number') return null;
  let resetsAt = w.resets_at != null ? Number(w.resets_at) : null;
  // older Codex versions logged a relative countdown instead of a timestamp
  if (resetsAt == null && w.resets_in_seconds != null) resetsAt = Math.floor(loggedAtMs / 1000) + Number(w.resets_in_seconds);
  return { usedPercent: w.used_percent, windowMinutes: w.window_minutes != null ? Number(w.window_minutes) : null, resetsAt };
}

async function readLive(codexHome) {
  let auth;
  try { auth = JSON.parse(fs.readFileSync(path.join(codexHome, 'auth.json'), 'utf8')); }
  catch (e) { throw new Error('no Codex login found at ' + path.join(codexHome, 'auth.json')); }
  const tokens = auth && auth.tokens;
  if (!tokens || !tokens.access_token) throw new Error('Codex is logged in with an API key, not ChatGPT, so there are no plan limits to read');
  const headers = { Authorization: 'Bearer ' + tokens.access_token, 'User-Agent': 'codex-cli', Accept: 'application/json' };
  if (tokens.account_id) headers['ChatGPT-Account-Id'] = tokens.account_id;
  const res = await fetch(USAGE_URL, { headers, signal: AbortSignal.timeout(10000) });
  if (res.status === 401 || res.status === 403) throw new Error('Codex login has expired (run any codex command to refresh it)');
  if (!res.ok) throw new Error('usage request failed with HTTP ' + res.status);
  const body = await res.json();
  const rl = body.rate_limit || {};
  return {
    source: 'live',
    observedAt: Date.now(),
    plan: body.plan_type || null,
    limitReached: rl.limit_reached === true || rl.allowed === false,
    primary: windowFromApi(rl.primary_window),
    secondary: windowFromApi(rl.secondary_window)
  };
}

function listRollouts(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listRollouts(p, out);
    else if (/^rollout-.*\.jsonl$/.test(e.name)) {
      try { out.push({ p, mtime: fs.statSync(p).mtimeMs }); } catch (_) {}
    }
  }
  return out;
}

function readLogs(codexHome) {
  const files = listRollouts(path.join(codexHome, 'sessions'), []).sort((a, b) => b.mtime - a.mtime);
  if (!files.length) throw new Error('no Codex session logs found in ' + path.join(codexHome, 'sessions'));
  // the newest few sessions are plenty; the latest snapshot is almost always in the newest file
  for (const f of files.slice(0, 10)) {
    let lines;
    try { lines = fs.readFileSync(f.p, 'utf8').split('\n'); } catch (_) { continue; }
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line.indexOf('"rate_limits"') < 0) continue;
      let ev;
      try { ev = JSON.parse(line); } catch (_) { continue; }
      const payload = ev.payload || ev.msg || ev;
      const rl = payload && payload.rate_limits;
      if (!rl || (!rl.primary && !rl.secondary)) continue;
      const loggedAt = ev.timestamp ? Date.parse(ev.timestamp) : f.mtime;
      return {
        source: 'logs',
        observedAt: isFinite(loggedAt) ? loggedAt : f.mtime,
        plan: rl.plan_type || null,
        limitReached: !!rl.rate_limit_reached_type,
        primary: windowFromLog(rl.primary, loggedAt),
        secondary: windowFromLog(rl.secondary, loggedAt)
      };
    }
  }
  throw new Error('Codex session logs have no usage-limit data yet (run one Codex prompt first)');
}

// ---------- turning it into an answer ----------

function windowName(w, fallback) {
  const m = w && w.windowMinutes;
  if (!m) return fallback;
  if (m >= 10000 && m <= 10200) return 'weekly';
  if (m % 1440 === 0) return (m / 1440) + '-day';
  if (m % 60 === 0) return (m / 60) + '-hour';
  return m + '-minute';
}

function fmtDuration(sec) {
  if (sec <= 0) return 'now';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  if (d) return d + 'd ' + h + 'h';
  if (h) return h + 'h ' + m + 'm';
  return Math.max(1, m) + 'm';
}

function describeWindow(w, fallbackName, nowSec) {
  if (!w) return null;
  const reset = w.resetsAt != null && w.resetsAt <= nowSec;   // the window rolled over since we read it
  const used = reset ? 0 : Math.max(0, Math.min(100, Math.round(w.usedPercent)));
  const out = {
    name: windowName(w, fallbackName),
    usedPercent: used,
    remainingPercent: 100 - used,
    resetsIn: w.resetsAt != null && !reset ? fmtDuration(w.resetsAt - nowSec) : null,
    resetsAtLocal: w.resetsAt != null && !reset ? new Date(w.resetsAt * 1000).toLocaleString() : null
  };
  // Pace: how far ahead of an even burn rate you are. Positive = using it faster than the window refills.
  if (w.windowMinutes && w.resetsAt != null && !reset) {
    const total = w.windowMinutes * 60, elapsed = total - (w.resetsAt - nowSec);
    if (elapsed > 0 && elapsed <= total) out.paceDelta = Math.round(used - (elapsed / total) * 100);
  }
  return out;
}

function summarize(reading, opts) {
  const nowSec = Math.floor(Date.now() / 1000);
  const short = describeWindow(reading.primary, 'short', nowSec);
  const weekly = describeWindow(reading.secondary, 'long', nowSec);
  const worst = Math.max(short ? short.usedPercent : 0, weekly ? weekly.usedPercent : 0);
  const binding = weekly && (!short || weekly.usedPercent >= short.usedPercent) ? weekly : short;

  let verdict, tone;
  if (reading.limitReached || worst >= 100) { verdict = 'STOP — limit reached'; tone = 'bad'; }
  else if (worst >= opts.stop) { verdict = 'STOP — almost out'; tone = 'bad'; }
  else if (worst >= opts.warn || (weekly && weekly.paceDelta >= 15)) { verdict = 'SLOW DOWN'; tone = 'warn'; }
  else { verdict = 'OK — keep going'; tone = 'ok'; }

  const pct = w => w ? w.usedPercent + '%' : '–';
  const widget = {
    label: 'CODEX USAGE',
    value: (short ? '5h ' + pct(short) : '') + (short && weekly ? ' · ' : '') + (weekly ? 'wk ' + pct(weekly) : ''),
    sub: verdict.split(' — ')[0] + (binding && binding.resetsIn ? ' · resets ' + binding.resetsIn : ''),
    progress: worst,
    tone
  };
  if (short && short.name !== '5-hour') widget.value = widget.value.replace(/^5h/, short.name);

  return {
    verdict, tone,
    usedPercent: worst,
    windows: [short, weekly].filter(Boolean),
    plan: reading.plan,
    source: reading.source === 'live' ? 'live from chatgpt.com' : 'Codex session log',
    observedAt: new Date(reading.observedAt).toLocaleString(),
    widget
  };
}

async function getUsage(opts) {
  let liveError = null;
  if (!opts.offline) {
    try { return summarize(await readLive(opts.codexHome), opts); }
    catch (e) { liveError = e.message; }
  }
  try {
    const s = summarize(readLogs(opts.codexHome), opts);
    if (liveError) s.note = 'Live read failed (' + liveError + '); showing your last logged reading.';
    return s;
  } catch (e) {
    throw new Error((liveError ? 'Live read failed: ' + liveError + '. ' : '') + 'Log read failed: ' + e.message);
  }
}

function toText(u) {
  const lines = [u.verdict + '  (' + u.usedPercent + '% of your tightest limit used)'];
  for (const w of u.windows) {
    lines.push('- ' + w.name + ' limit: ' + w.usedPercent + '% used, ' + w.remainingPercent + '% left'
      + (w.resetsIn ? ', resets in ' + w.resetsIn + ' (' + w.resetsAtLocal + ')' : '')
      + (w.paceDelta == null ? '' : w.paceDelta === 0 ? ', right on an even pace'
        : ', ' + (w.paceDelta > 0 ? w.paceDelta + ' pts ahead of' : Math.abs(w.paceDelta) + ' pts under') + ' an even pace'));
  }
  lines.push('Source: ' + u.source + ', as of ' + u.observedAt + (u.plan ? ' · plan: ' + u.plan : ''));
  if (u.note) lines.push(u.note);
  lines.push('', 'Suggested widget.set fields: ' + JSON.stringify(u.widget));
  return lines.join('\n');
}

// ---------- MCP (JSON-RPC 2.0) over stdio or loopback HTTP ----------

const TOOL = {
  name: 'codex_usage',
  title: 'Codex usage limits',
  description: 'Read how much of the ChatGPT Codex usage limits (5-hour and weekly windows) has been used, when each resets, '
    + 'and whether to keep going, slow down, or stop. The result ends with ready-to-use widget fields '
    + '(value, sub, progress 0-100, tone) for a StarNet Progress widget.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, openWorldHint: true }
};

// Returns the JSON-RPC response for one message, or null for a notification.
async function handle(msg, opts) {
  const id = msg && msg.id;
  const isRequest = id !== undefined && id !== null;
  const ok = result => ({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id: isRequest ? id : null, error: { code, message } });
  const params = msg && msg.params;
  switch (msg && msg.method) {
    case 'initialize':
      return ok({
        protocolVersion: (params && params.protocolVersion) || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'codex-usage', version: '1.0.0' }
      });
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: [TOOL] });
    case 'tools/call': {
      if (!params || params.name !== TOOL.name) return fail(-32602, 'Unknown tool: ' + (params && params.name));
      try {
        const u = await getUsage(opts);
        return ok({ content: [{ type: 'text', text: toText(u) }], structuredContent: u, isError: false });
      } catch (e) {
        return ok({ content: [{ type: 'text', text: 'Could not read Codex usage: ' + e.message }], isError: true });
      }
    }
    default:
      // notifications (initialized, cancelled, ...) need no reply
      return isRequest ? fail(-32601, 'Method not found: ' + (msg && msg.method)) : null;
  }
}

function serveStdio(opts) {
  const send = msg => process.stdout.write(JSON.stringify(msg) + '\n');
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch (_) { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); continue; }
      handle(msg, opts).then(r => { if (r) send(r); });
    }
  });
  process.stdin.on('end', () => process.exit(0));
}

// Streamable HTTP, the transport StarNet uses for connectors on the desktop. Listens on
// 127.0.0.1 only, and refuses browser requests (Origin header) and non-local Host headers so
// a web page can't read your usage through it.
function serveHttp(opts) {
  const http = require('http');
  const json = (res, code, body) => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const server = http.createServer((req, res) => {
    const host = String(req.headers.host || '').replace(/:\d+$/, '');
    if (req.headers.origin || !['127.0.0.1', 'localhost', '[::1]'].includes(host)) return json(res, 403, { error: 'forbidden' });
    if (req.url.split('?')[0] !== '/mcp') return json(res, 404, { error: 'not_found' });
    if (req.method === 'DELETE') { res.writeHead(204); return res.end(); }   // session teardown; we keep no sessions
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST, DELETE' }); return res.end(); }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', c => { body += c; if (body.length > 65536) req.destroy(); });
    req.on('end', async () => {
      let msg;
      try { msg = JSON.parse(body); } catch (_) { return json(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
      if (Array.isArray(msg)) {
        const out = (await Promise.all(msg.map(m => handle(m, opts)))).filter(Boolean);
        if (!out.length) { res.writeHead(202); return res.end(); }
        return json(res, 200, out);
      }
      const r = await handle(msg, opts);
      if (!r) { res.writeHead(202); return res.end(); }
      json(res, 200, r);
    });
  });
  server.on('error', e => {
    console.error(e.code === 'EADDRINUSE' ? 'Port ' + opts.port + ' is already in use (is it already running?)' : String(e));
    process.exit(1);
  });
  server.listen(opts.port, '127.0.0.1', () => {
    console.log('Codex usage MCP server running. StarNet connector URL: http://127.0.0.1:' + opts.port + '/mcp');
    console.log('Leave this window open (or use install-startup.cmd to start it hidden at login).');
  });
}

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.print) {
    getUsage(opts).then(u => console.log(toText(u)), e => { console.error('Could not read Codex usage: ' + e.message); process.exit(1); });
  } else if (opts.port) {
    serveHttp(opts);
  } else {
    serveStdio(opts);
  }
}

module.exports = { getUsage, summarize, readLogs, toText, parseArgs, handle };
