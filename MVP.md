# MVP definition

Original goal: "an MVP with a mascot that moves around the screen, with physics, with all the features of clawd-on-desk and with an Obsidian connection".

"All the features of clawd-on-desk" has no verifiable end (its per-agent and per-platform integrations keep growing), so the MVP is bounded to this closed list. Each item says how it was checked.

UI labels that the app shows in Spanish (the keys of `DICT` in `src/i18n.ts`) are kept verbatim, in italics, with an English gloss on first use.

## In the MVP

| # | Feature | Checked with |
|---|---|---|
| 1 | Mascot that walks, sits, sleeps and waves above the taskbar | Real Windows app (webview inspected) |
| 2 | Physics: drag, drop and fall with gravity | just-simple-npc physics + real app |
| 3 | Transparent overlay with click-through everywhere except over the character and its panels | Real app: the window switches from transparent to interactive when the cursor is over it |
| 4 | Reacts to Claude Code state (thinking, working, subagents, alert, success, error) | Real hook events against the app; test of every animation row with a synthetic pet |
| 5 | Allow/Deny permission cards, global shortcuts and Telegram | Hook → card → HTTP response flow in the real app; Telegram against a simulated bot; shortcut logic with tests |
| 6 | Sessions panel with jump to the terminal | Real app; real window found by folder name |
| 7 | Quota (5 h / 7 d / context) | `/usage` in the real app; rings rendered |
| 8 | Send tasks to Claude and see progress and result | Runner against a stand-in `claude` emitting the same JSON; parser with tests |
| 9 | **Obsidian:** `- [ ] … #claude` tasks in a vault → Claude → answer written under the task and task checked off | Real app with a temporary vault; 7 vault tests (safe rewrite if the note changed) |
| 10 | Mini mode, themes, Codex Pets, themes by URL, eye tracking | Real app |
| 11 | Slack/Feishu notices, read-only mobile view with token, 5 languages | Real app and simulated servers; translation test |
| 12 | Other agents: Gemini/Cursor/Codex bridges and the `/agent` endpoint | Sample payloads per their documentation against the real app |
| 13 | Answer Claude's questions and approve plans from the session panel; recent sessions; *Reintentar* (Retry) on failed tasks | Unit tests and preview with `mockIPC`; **not** tested with a real `claude` |
| 14 | Hook diagnostics: *Ver eventos recibidos* (View received events) in Settings > Claude > Conexión (count per event, latest lines, warning if `PermissionRequest` never arrives) | Unit tests (names only, cap of 80 events) and preview with `mockIPC`; **not** tested with real Claude Desktop events |
| 15 | Obsidian: quick actions (daily note, search, new note via `obsidian://` URI) and favorite palette commands through the official CLI; vault picker with filter | Unit tests (command parser, URIs, id validation, favorites cap, runner); preview with `mockIPC`; **not** tested with a real Obsidian or its CLI |
| 16 | Memory from the vault (optional, off by default): index of notes, tags and links; recall in NPC tasks and, if enabled, in Claude Code sessions via the `UserPromptSubmit` hook; session notes and *Recordar* (Remember) under `Claude NPC/`; *Cerebro* (Brain) tab | Unit tests (index, BM25 with link expansion, capture and rewrite only under `Claude NPC/`, exclusions); preview with `mockIPC`; **not** tested with a real Obsidian or real Claude Code |
| 17 | Suggestions for your notes (*Cerebro* tab, *Buscar enlaces y etiquetas* (Find links and tags)): link the first unlinked mention of another note's title and add a frequent tag to untagged notes; visible diff; written only with *Aplicar* (Apply) and only if the proposed line is unchanged | Unit tests (detection and exclusions, rejection of changed notes or notes outside the vault, CRLF); **not** tested with a real vault nor seen in the preview |
| 18 | Reflection at the end of a session (optional, off by default; *Reflexionar ahora* (Reflect now) in Cerebro): a read-only Haiku reads the end of the conversation and writes lessons and decisions to `Claude NPC/Memoria/`, to-dos to `Pendientes.md` (without `#claude`) and a linked reflection note; the response is validated and links only point to existing notes | Unit tests (JSON validation, sanitizing, links against the index, writing under `Claude NPC/` without duplicates, exclusions); **not** tested with a real `claude` or a real Obsidian |
| 19 | Forging a personality (optional, off by default; requires memory): the reflection notes how you work; what repeats in 2 distinct sessions is promoted to `Claude NPC/Personalidad.md` and added to the context of NPC tasks and, once per session, of Claude Code; switch and card in *Cerebro* | Unit tests (pending observations, promotion only after 2 distinct sessions, user edits, note without marker, bounded block, reflection context); preview with `mockIPC`; informally tried by the author with a real vault and a real `claude` (no formal record); not tested systematically |
| 20 | Obsidian: context in `#claude` tasks (`[[Note]]` that Claude must read first and `📁 folder` where it works, with the vault as `--add-dir`) and, with memory on, the answer as a note in `Claude NPC/Tareas/` with a `→ [[note]]` link on the task | Unit tests (reading `[[ ]]` and `📁`; a task note cannot launch new tasks); **not** tested with a real vault or a real `claude` |
| 21 | Cerebro: *Preguntar al cerebro* (Ask the brain: answer with `[[ ]]` citations and sources that exist in the index), weekly summary with Haiku (and its automatic trigger when a session closes), *Mantenimiento* (Maintenance; warnings only) and the Dataview panel `Claude NPC/Panel.md` | Unit tests (sources and prompt of the question, JSON and writing of the summary, maintenance warnings, panel that is never rewritten); **not** tested with a real `claude`, with Dataview or with a real Obsidian; the preview has not been opened with these sections |
| 22 | Cerebro: internal runs (reflection, question, summary) do not appear as sessions or in *Recientes* (Recent), and per-project relevance (notes from the working folder weigh more) | Unit tests of per-project relevance; hiding internal sessions has no test of its own; **not** tested with real Claude Code |
| 23 | Cerebro "like a brain": forgetting over time (`brainForget`; what is weak and unimportant moves to `Claude NPC/Archivo/`, never deleted) with reinforcement on recall and when a lesson repeats; per-turn log and `## Resumen` in session notes; dreaming (`brain_dream`, *😴 Consolidar* (Consolidate), weekly and automatic) with principles, habits, contradictions and the personality's story, with sources that exist; associations from joint recall over 3 days; two-hop recall; values in the personality | Unit tests (decay and archiving without deleting, reinforcement once per day, log that refreshes its last line, dreaming without overwriting or clobbering user notes, associations and `## Asociadas`, two hops); **not** tested with a real `claude` or a real Obsidian |

## Out of the MVP (decided, not forgotten)

- Native integrations with the remaining 25+ clawd-on-desk agents (they can be added with `/agent` or a bridge).
- Official theme catalog and Live2D.
- WSL and remote SSH as tested features (there is a button that copies the hooks and the recipe is in docs/integrations.md).
- macOS and Linux (the code is written but neither compiled nor tested).
- Cerebro, next milestone (not started): multi-question chat with history and a mini-graph. Today there is a single question with citations (*Preguntar al cerebro*), without history.
- Personality: jokes and bubbles generated from the traits (today they are fixed lists) and change proposals with an *Aplicar* button (today traits enter on their own once they repeat).

## Still to verify by whoever has the environment

These checks cannot be done without your session and your machine:

1. A real task with a signed-in `claude` (the development environment had expired OAuth).
2. A real Obsidian vault (reading the vault registry and the *Abrir en Obsidian* (Open in Obsidian) button use the documented format, without Obsidian installed to see it).
3. Real Gemini CLI, Cursor and Codex, and real Telegram, Slack and Feishu bots.
4. The `Ctrl+Alt+Y/N` shortcuts with a physical keyboard.
5. Continuing a conversation with `--resume` (*Continuar* (Continue) in tasks and *Escribir* (Write) in a session) with a real `claude`, also over a session created in Claude Desktop; and that the resumed session keeps showing in *Sesiones* (Sessions) during a real task (fixed, untested).
6. Login from the NPC (*Iniciar sesión* (Sign in) opens a terminal with `claude auth login`) and the `claude auth status` polling after it closes.
7. That Claude Code accepts the answers to `AskUserQuestion` (`updatedInput.answers`) and that approving `ExitPlanMode` behaves as expected.
8. That Claude Desktop sessions send the `PermissionRequest` hook (the *Ver eventos recibidos* diagnostic in Settings > Claude > Conexión shows which events arrive).
9. The *Recientes* section with a real, large history, and *Reintentar* with a real `claude`.
10. The Obsidian actions in a real Obsidian: the `obsidian://` shortcuts and the favorite commands with the official CLI (`obsidian vault=<name> command id=<id>`, Obsidian 1.12.7+). The format of `obsidian commands` is an assumption; there are only unit tests.
11. Memory from the vault (*Cerebro*) with real Obsidian and real Claude Code: that Claude Code accepts `hookSpecificOutput.additionalContext` from an HTTP hook on `UserPromptSubmit`, the effect of recall on tasks and sessions, the session notes written by `Stop`/`SessionEnd`, and the indexing time of a large vault. There are only unit tests and the preview.
12. Suggestions for your notes (*Cerebro* → *Buscar enlaces y etiquetas*) with a real vault: that the proposed mentions and tags are useful and that *Aplicar* leaves the note exactly as the diff shows. There are only unit tests.
13. Reflection at the end of a session (*Reflexionar al terminar cada sesión* (Reflect when each session ends) and *Reflexionar ahora* in Cerebro) with a real `claude`: that `--model haiku` and `--allowedTools Read,Glob,Grep,LS` behave as expected, that the reflection's session does not appear in *Sesiones* or *Recientes* (it probably does, because its hooks still arrive), that the notes are useful and not repetitive, and the quota cost. Informally tried by the author with a real vault and a real `claude` ("looks good"), with no formal record of what was checked; the rest is not checked systematically.
14. The personality (*Forjar una personalidad* (Forge a personality), in *Cerebro*) with a real `claude` and vault: that Haiku returns useful observations without private data (the prompt asks for it; there is no guarantee), that they repeat with sufficiently similar wording to be promoted (matching is almost literal), the effect of the block on tasks and sessions (once per session, via `additionalContext`) and that Claude Code accepts it. Informally tried by the author with a real vault and a real `claude`, with no formal record of what was checked; the rest is not checked systematically.
15. Brain improvements from the latest batch, with unit tests only and not checked with a real `claude` or Obsidian: that internal sessions (reflection, question, summary) do not appear in *Sesiones* or *Recientes* (including the `SessionStart` that may arrive before the first prompt); *Preguntar al cerebro* (that citations and sources are correct, and the quota cost); tasks with `[[ ]]` and `📁` (that Claude reads the notes and works in the folder, and that `--add-dir` works); the answer note in `Claude NPC/Tareas/`; the panel with real Dataview queries; the weekly summary with Haiku and its automatic trigger; *Mantenimiento* on a real vault; and per-project relevance. The preview has not been opened with these sections.
16. Cerebro "like a brain" (forgetting, log, dreaming, associations, two-hop recall and personality values), with unit tests only and not checked with a real `claude` or Obsidian: that what is archived in `Claude NPC/Archivo/` is what truly does not matter and the `[[links]]` to it still resolve; that reinforcement works with real use; that dreaming returns useful principles, habits and contradictions, with real sources (and that the weekly trigger does not repeat or overwrite anything); that associations show up in `## Asociadas` and two-hop recall does not add noise; and that values are promoted only after 2 distinct sessions.

Telegram and Slack do not answer questions or plans (Telegram shows Allow/Deny); that stays on the desktop.

If any of them fails, open an issue with the symptom: items 1–16 are the most likely to need an adjustment.
