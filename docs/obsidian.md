# Obsidian

Part of [claude-npc](../README.md). Vault memory is described in [Cerebro](cerebro.md).

In **Obsidian**, choose your vault (the ones Obsidian has registered are detected) or type the path. Tasks launched from a note run with the vault as working directory, unless the task names another folder with `📁`.

In the same panel:

- **Nota diaria** (Daily note), **Buscar** (Search) and **Nota nueva** (New note) open Obsidian with an `obsidian://` URI. *Buscar* and *Nota nueva* use the text in the box (*Nota nueva* creates nothing if it is empty).
- **★** picks up to 6 Obsidian palette commands as buttons (for example, open the daily note). They run with Obsidian's official CLI (`obsidian vault=<your vault> command id=<id>`), which requires **Obsidian 1.12.7 or later** with the CLI enabled in Obsidian; on Windows the NPC uses `Obsidian.com`. Only commands you saved as favorites are run, with a maximum time of 10 s.

**Context in a task.** Besides the text, a `- [ ] … #claude` task can carry:

- `[[Note]]` (up to 5): Claude is asked to read those notes before answering (if they are not found, it looks them up by name).
- `📁 folder` or `📁 "folder with spaces"`: the task runs in that folder, absolute or relative to the vault (it must exist). The vault is added as an extra directory. It is still read-only unless you enable *Permitir que Claude edite archivos* (Allow Claude to edit files).

With memory on (see *Cerebro*), the answer is also saved as a note in `Claude NPC/Tareas/` and the task ends with a `→ [[note]]` link.

If the CLI is not installed or does not answer within 10 s, the NPC shows the error.
