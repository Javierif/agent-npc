# Security

Part of [claude-npc](../README.md).

- Tasks launched from the NPC can only read (`Read`, `Glob`, `Grep`, `LS`) unless you enable *Permitir que Claude edite archivos* (Allow Claude to edit files). Any other tool goes through the permission card if the hooks are connected; otherwise it is denied.
- *Aprobar permisos automáticamente* (Approve permissions automatically) answers "Allow" to everything, except Claude's questions (`AskUserQuestion`), which are always shown so that you answer them yourself. It is off by default.
- The hooks server listens only on `127.0.0.1` and carries no token: any local process can send it events (it can show fake cards, but not approve anything: decisions only go out to the agent that asked).
- Telegram tokens and webhook URLs are stored in plain text in the app's config.
- When writing to a note, if it changed while Claude was working, the task is relocated by its text; if it is no longer there, nothing is written.
- Obsidian commands do not go through a shell: only ids saved as favorites are run, validated (letters, numbers, `-`, `_`, `.` and `:`).
- The event diagnostics (*Ver eventos recibidos*) live only in memory and store no prompts or tool inputs.
- Vault memory is off by default. What it retrieves (fragments of your notes) is sent to Claude, and a note may contain text that tries to give instructions: the block marks it as data, but there is no guarantee. Turn on *También en tus sesiones de Claude Code* only if you trust the content of your notes. The `UserPromptSubmit` hook only returns context with that option on.
- The reflection (off by default) sends the end of a conversation to Claude through your own `claude`, with `Haiku` and read-only tools (`Read`, `Glob`, `Grep`, `LS`) inside the vault. The model writes nothing: what it returns is validated and only the NPC writes, under `Claude NPC/`. Notes or the conversation may contain text that tries to give instructions; the prompt treats it as data, but there is no guarantee.
- The personality (off by default) is generated with the same Haiku reflection: its observations are validated and sanitized, and only the NPC writes `Claude NPC/Personalidad.md`. It is injected as data, not as instructions, but the prompt is the only barrier against private data.
- Questions to the brain and maintenance only read; the weekly summary writes only to `Claude NPC/Semanal/`. Dreaming sends Haiku fragments of up to 40 notes from `Memoria/` (never conversations) and writes only under `Claude NPC/` (and to the personality's story); forgetting only moves auto notes to `Claude NPC/Archivo/`, deleting nothing. A vault task's `📁` can take Claude to any existing folder, including outside the vault, with the same permission rules: read-only unless *Permitir que Claude edite archivos*.
- Memory writes only inside `Claude NPC/`, with sanitized names, and never edits your notes. The only exception is the suggestions for your notes: they change one line of a note (or add a tag to its header) only when you press *Aplicar*, and only if the note has not changed since it was proposed.
