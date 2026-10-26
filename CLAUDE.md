# CLAUDE.md

Guía del proyecto para Claude Code. Para la documentación de usuario completa (configuración de Telegram, Slack, puentes, etc.) ver [README.md](README.md); para el alcance del MVP, [MVP.md](MVP.md).

## Qué es

**claude-npc** es un NPC de escritorio para Claude Code. Un personajillo original (*Postie*, un blob color melocotón con un post-it de sombrero) camina por encima de la barra de tareas, reacciona a lo que hace Claude, te pide permisos y **te deja mandarle tareas**, incluidas las que escribes en tus notas de Obsidian.

- Estado: **MVP** (v0.1.0). Probado en Windows 11; macOS y Linux están escritos pero sin compilar ni probar.
- Stack: **Tauri 2** (Rust, edición 2024) + frontend en **TypeScript sin framework** + **Vite**. Ventana overlay transparente, siempre encima, sin barra de tareas, con click-through salvo sobre el personaje y sus paneles.
- Idioma del proyecto: documentación, comentarios de cara al usuario y cadenas de UI en **español** (con 5 idiomas de interfaz). Los comentarios de código y los doc-comments Rust están en inglés.
- Licencia MIT. `src/physics.ts` está adaptado de just-simple-npc (MIT, David Hurtado); ver `NOTICE`. El personaje es original. clawd-on-desk (AGPL-3.0) fue solo inspiración conceptual: **no copiar código ni arte de él**.

## Filosofía

1. **Local primero, sin servicios propios.** Todo corre en la máquina del usuario. El NPC usa el `claude` CLI del propio usuario (`claude -p`), su sesión y su suscripción. No hay backend, telemetría ni cuentas.
2. **Sin plugins ni dependencias en las otras herramientas.** Claude Code se conecta con *hooks HTTP* en `~/.claude/settings.json`; Obsidian se maneja directamente sobre los archivos Markdown de la vault (sin plugin); otros agentes entran por un endpoint HTTP genérico.
3. **Degradación elegante.** Si el NPC no está abierto, los puentes no estorban (respuesta neutra) y el agente sigue como siempre. Sin hooks, el NPC sigue sirviendo para lanzar tareas.
4. **Seguro por defecto.** Las tareas lanzadas desde el NPC son de solo lectura (`Read`, `Glob`, `Grep`, `LS`) salvo que se active *Permitir que Claude edite archivos*. La aprobación automática está desactivada por defecto. Los servidores escuchan solo en `127.0.0.1` (la vista del móvil es opt-in, solo `GET` y con token). Las URLs de webhooks y de temas deben ser `https`.
5. **No tocar lo ajeno sin red.** Los hooks se añaden conservando los del usuario y guardando copia (`settings.json.claude-npc.bak`); se identifican con el marcador `src=claude-npc` para poder quitarlos limpiamente. Al escribir en una nota de Obsidian, si cambió mientras Claude trabajaba, se relocaliza la tarea por su texto y, si ya no está, **no se escribe nada**.
6. **Honestidad sobre lo probado.** El README distingue lo comprobado en la app real de lo que no. Mantén esa distinción: no marques como verificado lo que solo se ha probado contra simulaciones.
7. **Original y contenido.** El personaje se dibuja desde código (una base, todas las poses derivadas). El MVP tiene alcance cerrado (ver `MVP.md`): lo que queda fuera está decidido, no olvidado.

## Instalación y comandos

Requisitos: **Node 20+**, **Rust** (toolchain estable reciente, edición 2024), **WebView2** (Windows) y `claude` en el `PATH` con sesión iniciada. El NPC comprueba esa sesión con `claude auth status` y, si falta, ofrece *Iniciar sesión* (abre una terminal con `claude auth login`).

```bash
npm install
npm run tauri dev      # app completa (arranca Vite en :1420 y la ventana Tauri)
npm run build          # tsc + vite build (frontend a dist/)
npm run tauri build    # empaquetado
npm run bridge         # compila npc-bridge -> src-tauri/target/debug/npc-bridge
```

Pruebas:

```bash
npm run test:ui        # node --test tests/*.test.mjs  (traducciones completas y coherentes en los 5 idiomas)
npm run test           # cargo test: hooks, permisos, vault, Telegram/webhooks (servidores simulados), puentes, vista móvil, temas, parser de claude
npx tsc --noEmit       # tipos del frontend
```

Previsualizar la UI sin Tauri: `npx vite` y abrir `http://localhost:1420/tests/preview.html` (backend simulado con `mockIPC` en `tests/mock.ts`). Al añadir un comando Tauri que use la UI, añade también su caso a `tests/mock.ts`.

Tras instalarlo, el usuario pulsa **Conectar con Claude Code** (Sesiones o Ajustes) para instalar los hooks y reinicia sus sesiones abiertas. La cuota (anillos 5 h / 7 d / contexto) requiere además una `statusLine` que haga `curl` a `/usage` (ver README).

## Arquitectura

```
Claude Code ──hooks HTTP──▶ 127.0.0.1:47650 (hooks.rs) ──eventos Tauri──▶ frontend (main.ts → npc.ts / ui.ts)
Otros agentes ──npc-bridge──▶ /agent                                              │
statusLine ──curl──▶ /usage                                         invoke() ◀────┘ (api.ts)
frontend ──start_task──▶ runner.rs ──spawn──▶ `claude -p` (stream-json) ──▶ progreso/resultado
vault.rs ◀── vigila *.md de la vault (`- [ ] … #claude`) ──▶ runner ──▶ reescribe la nota
```

### Backend Rust (`src-tauri/src/`)

| Archivo | Responsabilidad |
|---|---|
| `lib.rs` | Ventana overlay, hit-test/click-through, bandeja, atajos globales `Ctrl+Alt+Y/N`, registro de comandos Tauri, arranque de servicios. |
| `main.rs` | Punto de entrada mínimo. |
| `state.rs` | `Settings` (serde, camelCase, persistido en `settings.json` del dir de config de la app) y `Shared` (sesiones, cuota, permisos pendientes, respuestas a preguntas `answers`, tareas). `Session` lleva `topic` (primer prompt) y `prompt` (último), tomados del hook `UserPromptSubmit`. |
| `hooks.rs` | Servidor HTTP local (`tiny_http`): recibe hooks de Claude Code, deriva el estado de sesión, retiene las `PermissionRequest` hasta que el usuario responde, `/agent`, `/usage`; instala/quita hooks en `~/.claude/settings.json` (11 eventos en `HOOK_EVENTS`). Las `PermissionRequest` de `AskUserQuestion` y `ExitPlanMode` llevan `questions` / `plan`; `answer_question` permite la llamada con `decision.updatedInput.answers` (`{pregunta: etiqueta(s)}`). La aprobación automática nunca responde `AskUserQuestion`. |
| `runner.rs` | Lanza `claude -p --output-format stream-json`, parsea el JSON en streaming, emite progreso y resultado. `start_task` acepta `resume` (`--resume <id>`, solo ids tipo UUID) y captura el `session_id` del evento `system/init`, que emite como `task-update {kind:"session"}`. `auth_status` ejecuta `claude auth status` y lee `loggedIn`. |
| `vault.rs` | Obsidian: detecta vaults, escanea tareas `#claude`, vigila cambios, bandeja `Claude NPC Inbox.md`, reescritura segura de la nota. |
| `bridge.rs` + `bin/npc-bridge.rs` | Traduce hooks de Gemini CLI, Cursor y Codex al endpoint `/agent`. |
| `history.rs` | `recent_sessions`: lista sesiones pasadas leyendo `~/.claude/projects/*/*.jsonl` (solo cabecera y cola; título del último `custom-title` o último prompt; cwd de los registros). Alimenta «Recientes» en Sesiones. |
| `telegram.rs` | Long-polling; aprobar/denegar permisos desde un único chat configurado. No responde preguntas (`AskUserQuestion`) ni planes: esas peticiones muestran Permitir/Denegar. |
| `notify.rs` | Avisos de un solo sentido a Slack y Feishu (incoming webhooks). Sin respuestas. |
| `remote.rs` | Vista de móvil de solo lectura (PWA) en el puerto 47651 con token aleatorio. Sirve el snapshot de sesiones (incluidos `topic` y `prompt`) y la cuota. |
| `themes.rs` | Temas propios (`themes/<nombre>.json`) e instalación por URL (máx. 64 KB). |
| `pets.rs` | Importación de Codex Pets (spritesheet 1536×1872, 8×9 celdas de 192×208). |
| `platform.rs` | Las pocas diferencias Windows/macOS/Linux (home, registro de Obsidian, terminal, enfocar ventana). Abre terminales para reanudar una sesión (`open_terminal`) o para `claude auth login` (`open_login_terminal`), ambas sobre `launch_terminal`. |

Puertos: **47650** (hooks, `/agent`, `/usage`; solo loopback), **47651** (vista móvil, opcional, red local), **1420** (Vite en desarrollo).

### Frontend TypeScript (`src/`)

| Archivo | Responsabilidad |
|---|---|
| `main.ts` | Cableado: estado global (`store`), suscripción a eventos del backend, traducción de estados de Claude a `Mood`. |
| `api.ts` | Tipos compartidos con Rust y wrappers tipados de `invoke`/`listen`. Si cambias una struct serde en Rust, actualiza aquí. |
| `npc.ts` | Bucle de comportamiento del personaje (andar, sentarse, dormir, saludar, esconderse, modo mini, arrastrar/soltar, ojos que siguen el puntero). |
| `physics.ts` | Cuerpo rígido 2D mínimo: gravedad, rebotes, impactos. Adaptado de just-simple-npc. |
| `sprite.ts` | Personaje Postie dibujado desde código; poses y paletas/temas (claves de color `obswepmyYfLKtrzq123`). |
| `petsprite.ts` | Render de Codex Pets por filas de spritesheet. |
| `ui.ts` | Menú, paneles (tareas, sesiones, Obsidian, ajustes), tarjetas de permiso; helper `h()` para crear DOM. `sessionCard` (`pickSession`): panel de una sesión, abierto al pulsar su fila o su hijo, con estado/actividad, sus permisos pendientes, preguntas con opciones (única/múltiple, «Otra respuesta…», «Enviar respuestas»), aprobación de plan y cuadro *Escribir* (`--resume`, oculto mientras la sesión piensa, trabaja o espera). Sesiones muestra la sección *Recientes* (`history.rs`, sin duplicar las activas). En tareas, *Reintentar* (fallidas, reenvía prompt, carpeta y sesión) y *Continuar* (terminadas bien); aviso/botón *Iniciar sesión* y estado del CLI en Ajustes > Claude > Conexión. Las tarjetas de permiso se cachean para no perder el foco. |
| `activity.ts` | `describeActivity`: convierte una llamada de herramienta cruda (`mcp__…`, rutas, URLs) en una frase legible para burbujas, filas de sesión y el panel. |
| `children.ts` | «Hijos»: copias pequeñas del personaje que el usuario asigna a una sesión; cuáles tienen y cómo se ven se guarda en `localStorage`. |
| `followers.ts` | Dibuja los hijos que siguen al personaje principal; cada uno repite lo que hace su sesión y, al pulsarlo, abre el panel de esa sesión (`pickSession`). |
| `frog.ts` | Personaje alternativo «Don Rana» (rana con chaqueta azul marino, camisa blanca y corbata roja), como `Character` de `sprite.ts`. |
| `duck.ts` | Personaje alternativo «Don Pato» (pato con chaqueta gris carbón, camisa blanca y corbata granate), como `Character` de `sprite.ts`. |
| `i18n.ts` | Diccionario es/en/pt/fr/de. |
| `styles.css` | Estilos. |

## Convenciones

- **i18n:** la cadena en español es la clave del diccionario (`DICT` en `src/i18n.ts`); una traducción que falte cae al español. Toda cadena visible nueva debe llevar `e(en, pt, fr, de)` con **los mismos placeholders** `{nombre}`; `npm run test:ui` lo comprueba. No añadas texto de UI sin pasar por `t()`.
- **Rust:** errores sin `panic` en caminos de usuario; los comandos Tauri devuelven `Result<_, String>` y el frontend los muestra con `errorText`. Cada módulo lleva tests unitarios junto al código; los servicios de red se prueban contra servidores simulados (por ejemplo `CLAUDE_NPC_TELEGRAM_API` redirige la API de Telegram).
- **Frontend:** sin framework; DOM con `h()`. Las regiones interactivas se reportan al backend con `set_hit_regions` para el click-through; un panel nuevo debe registrarse ahí o no recibirá clics.
- **Formato y límites:** los archivos de vault se limitan (`MAX_FILES`, `MAX_FILE_BYTES`, `MAX_RESULT_CHARS`); respeta ese tipo de topes en entradas externas (temas, pets, webhooks).
- **Seguridad:** nunca guardar secretos fuera de la config de la app (Telegram y webhooks van en texto plano ahí, y está documentado); no ampliar el servidor de hooks más allá de loopback; no añadir rutas de escritura a la vista del móvil.
- Idioma de documentación: español. Mantén README y MVP coherentes con cualquier cambio de funcionalidad o de lo verificado.
- Commits en el estilo del repo; `dist/`, `node_modules/` y `src-tauri/target/` están ignorados.

## Estados del NPC

`Mood`: `idle | thinking | working | juggling (subagentes) | waiting (necesita permiso) | done | error`. Los agentes externos usan `state` ∈ `idle thinking working waiting attention done error ended` en `/agent`. Un Codex Pet mapea cada estado a su fila de animación (idle, running-right/left, waving, running, review, waiting, jumping, failed).

## Documentación y push

- Agente **`doc-keeper`** (`.claude/agents/doc-keeper.md`, modelo Haiku): revisa que CLAUDE.md, README.md y MVP.md reflejen el código real sin perder información. Invócalo tras cambios de arquitectura, comandos, ajustes, puertos o idiomas.
- Hook **PreToolUse** (`.claude/settings.json` → `.claude/hooks/require-doc-review.mjs`): bloquea `git push` mientras `.claude/.doc-review-ok` (ignorado por git) no contenga el SHA del HEAD actual. `doc-keeper` escribe esa marca al terminar la revisión; si haces nuevos commits, hay que repetirla. Si cambia documentación, commitéala antes del push.

## Pendiente de verificar (necesita el entorno del usuario)

1. Una tarea real con `claude` con sesión iniciada (el desarrollo se probó con un `claude` de pega que emite el mismo `stream-json`).
2. Una vault real de Obsidian.
3. Gemini CLI, Cursor y Codex reales, y bots reales de Telegram/Slack/Feishu.
4. Atajos `Ctrl+Alt+Y/N` con teclado físico; macOS, Linux, WSL y SSH remoto.
5. Continuar una conversación con `--resume` (*Continuar* en tareas y *Escribir* en una sesión) con un `claude` real, también sobre una sesión creada en Claude Desktop.
6. El login desde la NPC (*Iniciar sesión* abre una terminal con `claude auth login`) y el sondeo de `claude auth status` al cerrarla.
7. Que Claude Code acepte `decision.updatedInput.answers` en `AskUserQuestion` (respuestas desde el panel de la sesión) y que la aprobación de `ExitPlanMode` se comporte como se espera.
8. Que las sesiones de Claude Desktop envíen el hook `PermissionRequest` (y, por tanto, aparezcan sus permisos y preguntas en el NPC).
9. La sección *Recientes* con un historial real grande (límites de lectura de `history.rs`) y *Reintentar* con un `claude` real.
