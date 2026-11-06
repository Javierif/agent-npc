# Themes and pets

Part of [claude-npc](../README.md).

**Install by URL.** In Settings, paste the URL (https) of a palette JSON and press *Instalar* (Install). It is downloaded to the `themes` folder (64 KB at most). There is no official catalog: you choose where from.

**Codex Pets.** In Settings, type the path of a Codex pet folder (with `pet.json` and its 1536×1872 spritesheet, 8 columns × 9 rows of 192×208) and press *Importar* (Import). It is copied to the config and the NPC uses it: the *idle* row for resting, *running-right/left* when walking, *waving* when greeting, *running* if Claude is working, *review* if it is thinking, *waiting* if it needs you, *jumping* when done and *failed* if something fails. The format and row order come from community documentation, not from an official OpenAI specification.

**Custom themes.** Create `themes/<name>.json` inside the app's config folder (`%APPDATA%\dev.claudenpc.app` on Windows):

```json
{ "label": "Rosa", "colors": { "b": "#f9a8d4", "s": "#e879a9", "y": "#a7f3d0", "Y": "#6ee7b7" } }
```

Keys: `b` body, `s` shadow, `y`/`Y` sticky note and its shadow, `p` cheeks, `o` outline, `e` eyes… (the ones defined in `src/sprite.ts`). Restart the NPC to see it in Settings.
