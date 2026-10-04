# Codex usage widget for StarNet

A StarNet widget that shows how much of your ChatGPT Codex usage limit you've used, so you can tell at a glance whether to keep going or stop.

```
CODEX USAGE                    [█████████████░░░░░░]
5h 38% · wk 74%                SLOW DOWN · resets 2d 7h
```

- **5h**: your rolling 5-hour limit. **wk**: your weekly limit.
- **The bar** shows whichever limit is closer to running out.
- **Verdict**:
  - **OK**: under 70% on both limits.
  - **SLOW DOWN**: 70% or more on either limit, or you're more than 15 points ahead of an even pace for the week.
  - **STOP**: 90% or more, or a limit has been hit.
- **resets in**: how long until the tighter limit refills.

## How it works

StarNet widgets read from a *connected app*. `codex-usage-mcp.js` is a small connected app (an MCP server) that runs on your PC. It needs only Node, with no `npm install`. It gives StarNet one read-only tool, `codex_usage`.

It gets your numbers from the first of these that works:

1. **Live**: it asks chatgpt.com for your usage, the same way Codex's `/status` does. It uses the login Codex already saved in `%USERPROFILE%\.codex\auth.json`. Your token is sent only to chatgpt.com and is never shown to StarNet.
2. **Session logs**: if the live request fails (say your login expired), it reads the most recent usage snapshot Codex wrote to `%USERPROFILE%\.codex\sessions\`. These numbers are as fresh as your last Codex prompt.

You need to be signed in to Codex with your ChatGPT account. An API-key login has no plan limits to show.

## Setup (Windows)

1. **Install Node.js 18 or newer** from https://nodejs.org if you don't have it already. To check, run `node -v`.
2. **Put this folder somewhere permanent**, for example `C:\Tools\codex-usage-widget`.
3. **Test it.** Double-click `check-usage.cmd`. It should print your current usage. If it shows an error, see Troubleshooting below.
4. **Start the server.** Choose one:
   - Double-click `install-startup.cmd` (recommended). The server starts now, runs hidden, and starts again each time you log in.
   - Or double-click `start.cmd` whenever you want it, and keep that window open.
5. **Add it to StarNet as a connector.** Open the **Connectors** panel and add an HTTP connector:
   - Name: `Codex Usage`
   - URL: `http://127.0.0.1:8765/mcp`
   - Token: leave empty

   It should come up with one tool, `codex_usage`.
6. **Create the widget.** Open the widget rail's **＋** menu, go to **Your widgets**, then **Add widget**, then **Connected apps**, and pick **Codex Usage**. Fill in:
   - Name: `Codex usage`
   - What should it show?: `Call codex_usage and publish the "Suggested widget.set fields" it returns: value, sub, progress and tone, exactly as given.`
   - Display: **Progress**

   Then click **Create & fetch**. StarNet may ask you once to approve the tool call.
7. **Keep it fresh (optional).** In the widget's details, click **Schedule updates**. Pick something like every 30 minutes, save it, and turn on scheduling. Otherwise, click **Refresh now** whenever you want a new reading.

## Options

You can add these to the `node` line in `start.cmd`, or to the `.vbs` file in your Startup folder:

| Option | Default | What it does |
|---|---|---|
| `--http <port>` | `8765` | The port the server listens on (127.0.0.1 only) |
| `--warn <pct>` | `70` | When the verdict switches to SLOW DOWN |
| `--stop <pct>` | `90` | When the verdict switches to STOP |
| `--offline` | off | Skip chatgpt.com and read session logs only |
| `--codex-home <dir>` | `%CODEX_HOME%` or `%USERPROFILE%\.codex` | Where Codex keeps its files |

## Troubleshooting

- **"Codex login has expired"**: run any `codex` command (or open the Codex app) so it refreshes your login. In the meantime the widget falls back to your last logged reading.
- **"no Codex session logs found"**: run one Codex prompt so a log exists, and check that `--codex-home` points to the right folder.
- **"Port 8765 is already in use"**: the server is probably already running from `install-startup.cmd`. To use a different port, add `--http 8790` and change the StarNet URL to match.
- **To uninstall the auto-start**: press Win+R, type `shell:startup`, and delete `codex-usage-mcp.vbs`.

## Security

- The server only listens on `127.0.0.1`, so other machines can't reach it.
- It rejects requests from web browsers (any request with an `Origin` header) and any request where the `Host` header isn't local.
- It only reads files. It never changes anything in Codex or your ChatGPT account.
