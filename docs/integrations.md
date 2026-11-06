# Integrations

Part of [claude-npc](../README.md). Connecting Claude Code, quota, Telegram, Slack/Feishu, the mobile view, other machines and other agents.

## Connect to Claude Code

In **Sesiones** (Sessions) or **Ajustes** (Settings), press *Conectar con Claude Code* (Connect to Claude Code). It adds HTTP hooks (to `127.0.0.1:47650`) to `~/.claude/settings.json`, keeping yours and saving a backup (`settings.json.claude-npc.bak`). *Quitar* (Remove) deletes them. Restart your open sessions so they pick them up. Without the hooks, the NPC is still useful for launching tasks, but it does not see your sessions or handle permissions.

If a session does not show you permission cards (for example, one from Claude Desktop), go to **Ajustes → Claude → Conexión** (Settings → Claude → Connection) and press *Ver eventos recibidos* (View received events): it shows how many events of each type the NPC has received, the latest lines and whether any permission request (`PermissionRequest`) has arrived. It keeps only the last 80 events in memory, with no prompts or tool inputs (only the event name, the first 8 characters of the session id, the tool and, for notifications, the message); it is cleared when the app closes.

## Quota

Claude Code passes the quota to its *status line*. For it to reach the NPC, add this to `~/.claude/settings.json` (replace any `statusLine` you already have; if you have one, add the `curl` part to your script):

```json
"statusLine": {
  "type": "command",
  "command": "curl -s -m 2 -X POST \"http://127.0.0.1:47650/usage\" --data-binary @- -o /dev/null; echo claude-npc"
}
```

Meant for bash (Git Bash on Windows). Quota data is only available with a Pro or Max subscription.

## Telegram

1. Create a bot with @BotFather and copy the token.
2. Write to the bot and find out your chat ID.
3. Paste them in **Ajustes → Aprobar desde Telegram** (Settings → Approve from Telegram).

Only buttons pressed from that chat are served. The token is stored in plain text in the app's config folder.

Telegram only approves or denies permissions. Claude's questions (`AskUserQuestion`) and plans (`ExitPlanMode`) are not answered from Telegram: their requests show Allow/Deny, so to really answer them use the session panel on the desktop. An "Allow" from Telegram (or the shortcut) on a question answers nothing: the question stays open in the terminal.

## Slack and Feishu

Paste the URL of an *incoming webhook* in **Ajustes**. They are notices only: those webhooks do not support buttons, so approving is done on the desktop or in Telegram. Only `https` URLs are accepted.

## Mobile view

**Ajustes → Vista del móvil (solo lectura)** (Settings → Mobile view (read-only)) opens a server on port 47651 of the local network and shows a link with a random token. It only serves `GET`; every route with data requires the token. It is **unencrypted** (HTTP): use it only on a trusted network. Windows will ask for a firewall permission the first time.

## Another machine, WSL and SSH

In **Sesiones**, *Copiar hooks para otra máquina o WSL* (Copy hooks for another machine or WSL) copies the hooks block to the clipboard. Paste it in `~/.claude/settings.json` on the other machine:

- **SSH:** open the connection with a reverse tunnel, `ssh -R 47650:127.0.0.1:47650 user@server`, and the server's hooks will reach your NPC.
- **WSL2:** with `networkingMode=mirrored` in `.wslconfig`, `127.0.0.1` is shared and it works the same. Without that mode, the NPC (which only listens on loopback) is not reachable from WSL.

Both paths are configuration, not new code, and I could not test them here (no SSH server and no WSL distribution).

## Other agents

The `npc-bridge` command translates other tools' hooks to the NPC. Build it with `npm run bridge` (it ends up in `src-tauri/target/debug/npc-bridge`). The configurations follow each tool's documentation; replace `<path>` with the full path of the executable.

**Gemini CLI** (`~/.gemini/settings.json`):

```json
{ "hooks": {
  "BeforeTool":   [{ "matcher": "*", "hooks": [{ "type": "command", "command": "<path> gemini" }] }],
  "AfterTool":    [{ "matcher": "*", "hooks": [{ "type": "command", "command": "<path> gemini" }] }],
  "Notification": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "<path> gemini" }] }],
  "AfterAgent":   [{ "matcher": "*", "hooks": [{ "type": "command", "command": "<path> gemini" }] }]
} }
```

**Cursor** (`~/.cursor/hooks.json`):

```json
{ "version": 1, "hooks": {
  "beforeSubmitPrompt": [{ "command": "<path> cursor" }],
  "afterFileEdit":      [{ "command": "<path> cursor" }],
  "stop":               [{ "command": "<path> cursor" }]
} }
```

**Codex** (`~/.codex/config.toml`): `notify = ["<path>", "codex"]`

By adding `--ask` (`<path> gemini --ask`, or `beforeShellExecution` with `<path> cursor --ask`) the tool asks the NPC for permission instead of using its own prompt. If the NPC is not open, the bridge stays out of the way: it returns a neutral response and the agent carries on as usual.

Any other tool can use the HTTP endpoint directly:

```bash
# shows up as a "codex" session
curl -X POST http://127.0.0.1:47650/agent -d '{"agent":"codex","session_id":"1","cwd":"/path/project","state":"working","tool":"shell","detail":"pytest"}'

# asks for permission and waits for the answer: {"allow": true|false}
curl -X POST http://127.0.0.1:47650/agent -d '{"agent":"codex","session_id":"1","permission":true,"tool":"shell","detail":"rm -rf dist"}'
```

`state` is one of `idle thinking working waiting attention done error ended`.
