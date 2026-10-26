# claude-npc

Un NPC de escritorio para Claude Code. Un personajillo (Postie, con un post-it de sombrero) camina por encima de tu barra de tareas, reacciona a lo que hace Claude, te pide permisos y **te deja mandarle tareas**, incluidas las que escribes en tus notas de Obsidian.

Estado: **MVP**. Probado en Windows 11; macOS y Linux están escritos pero sin probar.

## Qué hace

| | |
|---|---|
| Mascota con vida | Camina, se sienta, duerme, saluda. La puedes coger y soltar: cae con gravedad. Los ojos siguen al puntero y da un saltito si le haces clic. Ventana transparente que deja pasar los clics salvo sobre el personaje y sus paneles. |
| Temas | Personajes: Postie, y los alternativos Don Rana, Don Pato y Don Hámster (chaqueta, camisa y corbata cada uno). Cuatro paletas de Postie (Postie, Menta, Noche, Tostada), temas propios (un JSON por tema), temas instalables por URL y **Codex Pets** importados (ver *Temas y pets*). |
| Idiomas | Español, English, Português, Français y Deutsch; automático según el sistema, o a mano en Ajustes. |
| Modo mini | Se acopla al borde derecho de la pantalla y se asoma; sale si hay novedades o pasas el ratón. Doble clic para activarlo o quitarlo, o desde Ajustes. |
| Reacciona a Claude Code | Pensando, trabajando (portátil), malabares si hay subagentes, alerta si te necesita, contento al terminar, triste si algo falla. Se alimenta de los *hooks* de Claude Code. |
| Permisos | Tarjeta junto al NPC: **Permitir / Denegar**, atajos globales `Ctrl+Alt+Y` / `Ctrl+Alt+N`, o desde Telegram. Las preguntas de Claude (`AskUserQuestion`) y los planes (`ExitPlanMode`) no van en esa tarjeta: se responden en el panel de su sesión (opciones de selección única o múltiple, «Otra respuesta…», «Enviar respuestas»; o aprobar el plan). |
| Sesiones | Panel con todas tus sesiones (estado, herramienta actual, último mensaje). *Terminal* trae al frente la ventana de la sesión si la encuentra por el nombre de su carpeta; si no, abre un terminal que la reanuda. Al pulsar una fila (o el hijo de esa sesión, la copia pequeña del personaje que nace sola con cada sesión; *Quitar hijo* la despide y no vuelve a nacer) ves su detalle, con sus permisos y preguntas pendientes; *Escribir* envía un mensaje que continúa esa conversación (`claude --resume`) y se oculta mientras la sesión está trabajando. La sección *Recientes* lista las sesiones pasadas que Claude guardó en `~/.claude/projects`, sin repetir las activas. |
| Cuota | Anillos de uso de las ventanas de 5 h y 7 d y del contexto (ver *Cuota*). |
| Mandar tareas | Escribes una tarea y el NPC lanza `claude -p` en la carpeta que elijas, muestra el progreso y deja el resultado como una nota adhesiva. *Continuar* en una tarea terminada bien reanuda su conversación (`claude --resume`); *Reintentar* en una fallida reenvía el mismo prompt, carpeta y sesión. Las respuestas se muestran con Markdown básico (títulos, listas, código, tablas, enlaces), sin HTML. |
| Obsidian | Apunta a tu vault. Cualquier `- [ ] algo #claude` de tus notas aparece en el panel; con ▶ Claude lo hace y **escribe la respuesta bajo la tarea y la marca como hecha**. También puedes añadir tareas desde el NPC a una bandeja (`Claude NPC Inbox.md`). Funciona sobre los archivos, sin plugin. Además, el panel tiene botones para la nota diaria, buscar y crear una nota nueva (por URI `obsidian://`), y hasta 6 comandos favoritos de Obsidian que se ejecutan con su CLI oficial (ver *Obsidian*). |
| Otros agentes | Puentes para Gemini CLI, Cursor y Codex, y un endpoint HTTP genérico (`/agent`) para cualquier otra herramienta (ver más abajo). |
| Aprobar desde Telegram | Cada petición de permiso llega al bot con botones Permitir/Denegar. |
| Avisos en Slack y Feishu | Notificación cuando se pide un permiso y cuando una sesión termina. |
| Vista del móvil | Página de solo lectura (instalable como PWA) con tus sesiones y la cuota, opcional y con enlace secreto. |

## Uso

Requisitos: Node 20+, Rust, WebView2 y `claude` en el PATH con sesión iniciada. Si `claude` no tiene sesión, el NPC lo avisa y ofrece *Iniciar sesión*, que abre una terminal con `claude auth login`.

```bash
npm install
npm run tauri dev
```

Pasa el ratón por encima del personaje para ver el menú (tareas, sesiones, Obsidian, ajustes). Se cierra desde el icono de la bandeja del sistema.

### Conectar con Claude Code

En **Sesiones** o **Ajustes**, pulsa *Conectar con Claude Code*. Añade hooks HTTP (hacia `127.0.0.1:47650`) a `~/.claude/settings.json`, conservando los tuyos y guardando una copia (`settings.json.claude-npc.bak`). *Quitar* los elimina. Reinicia las sesiones abiertas para que los noten. Sin los hooks, el NPC sigue sirviendo para lanzar tareas, pero no ve tus sesiones ni gestiona permisos.

Si una sesión no te muestra tarjetas de permiso (por ejemplo, una de Claude Desktop), ve a **Ajustes → Claude → Conexión** y pulsa *Ver eventos recibidos*: muestra cuántos eventos de cada tipo ha recibido el NPC, las últimas líneas y si ha llegado alguna petición de permiso (`PermissionRequest`). Solo guarda los últimos 80 eventos en memoria, sin prompts ni entradas de herramientas (solo el nombre del evento, los 8 primeros caracteres del id de sesión, la herramienta y, en las notificaciones, el mensaje); se borra al cerrar la app.

### Obsidian

En **Obsidian**, elige tu vault (se detectan los que Obsidian tiene registrados) o escribe la ruta. Las tareas lanzadas desde una nota se ejecutan con la vault como directorio de trabajo.

En el mismo panel:

- **Nota diaria**, **Buscar** y **Nota nueva** abren Obsidian con una URI `obsidian://`. *Buscar* y *Nota nueva* usan el texto del cuadro (*Nota nueva* no crea nada si está vacío).
- **★** elige hasta 6 comandos de la paleta de Obsidian como botones (por ejemplo, abrir la nota diaria). Se ejecutan con la CLI oficial de Obsidian (`obsidian vault=<tu vault> command id=<id>`), que requiere **Obsidian 1.12.7 o superior** con la CLI activada en Obsidian; en Windows el NPC usa `Obsidian.com`. Solo se ejecutan los comandos que hayas guardado como favoritos, con un tiempo máximo de 10 s.

Si la CLI no está instalada o no responde en 10 s, el NPC muestra el error.

### Cuota

Claude Code pasa la cuota a su *status line*. Para que llegue al NPC, añade esto a `~/.claude/settings.json` (sustituye cualquier `statusLine` que ya tengas; si tienes uno, añade la parte del `curl` a tu script):

```json
"statusLine": {
  "type": "command",
  "command": "curl -s -m 2 -X POST \"http://127.0.0.1:47650/usage\" --data-binary @- -o /dev/null; echo claude-npc"
}
```

Pensado para bash (Git Bash en Windows). Solo hay datos de cuota con suscripción Pro o Max.

### Telegram

1. Crea un bot con @BotFather y copia el token.
2. Escribe al bot y averigua el ID de tu chat.
3. Pégalos en **Ajustes → Aprobar desde Telegram**.

Solo se atienden los botones pulsados desde ese chat. El token se guarda en texto plano en la carpeta de configuración de la app.

Telegram solo aprueba o deniega permisos. Las preguntas de Claude (`AskUserQuestion`) y los planes (`ExitPlanMode`) no se contestan desde Telegram: sus peticiones muestran Permitir/Denegar, así que para responderlas de verdad usa el panel de la sesión en el escritorio. Un «Permitir» desde Telegram (o el atajo) sobre una pregunta no contesta nada: la pregunta sigue abierta en la terminal.

### Slack y Feishu

Pega la URL de un *incoming webhook* en **Ajustes**. Son solo avisos: esos webhooks no admiten botones, así que aprobar se hace en el escritorio o en Telegram. Solo se aceptan URLs `https`.

### Vista del móvil

**Ajustes → Vista del móvil (solo lectura)** abre un servidor en el puerto 47651 de la red local y muestra un enlace con un token aleatorio. Solo atiende `GET`; todas las rutas con datos exigen el token. Va **sin cifrar** (HTTP): úsalo solo en una red de confianza. Windows pedirá permiso de firewall la primera vez.

### Temas y pets

**Instalar por URL.** En Ajustes, pega la URL (https) de un JSON de paleta y pulsa *Instalar*. Se descarga a la carpeta `themes` (64 KB como máximo). No hay catálogo oficial: tú eliges de dónde.

**Codex Pets.** En Ajustes, escribe la ruta de una carpeta de pet de Codex (con `pet.json` y su spritesheet de 1536×1872, 8 columnas × 9 filas de 192×208) y pulsa *Importar*. Se copia a la configuración y el NPC lo usa: la fila *idle* para reposar, *running-right/left* al caminar, *waving* al saludar, *running* si Claude trabaja, *review* si piensa, *waiting* si te necesita, *jumping* al terminar y *failed* si algo falla. El formato y el orden de filas salen de documentación de la comunidad, no de una especificación oficial de OpenAI.

**Temas propios.** Crea `themes/<nombre>.json` dentro de la carpeta de configuración de la app (`%APPDATA%\dev.claudenpc.app` en Windows):

```json
{ "label": "Rosa", "colors": { "b": "#f9a8d4", "s": "#e879a9", "y": "#a7f3d0", "Y": "#6ee7b7" } }
```

Claves: `b` cuerpo, `s` sombra, `y`/`Y` post-it y su sombra, `p` mejillas, `o` contorno, `e` ojos… (las definidas en `src/sprite.ts`). Reinicia el NPC para verlo en Ajustes.

### Otra máquina, WSL y SSH

En **Sesiones**, *Copiar hooks para otra máquina o WSL* copia el bloque de hooks al portapapeles. Pégalo en `~/.claude/settings.json` de la otra máquina:

- **SSH:** abre la conexión con un túnel inverso, `ssh -R 47650:127.0.0.1:47650 usuario@servidor`, y los hooks del servidor llegarán a tu NPC.
- **WSL2:** con `networkingMode=mirrored` en `.wslconfig`, `127.0.0.1` es compartido y funciona igual. Sin ese modo, el NPC (que solo escucha en loopback) no es alcanzable desde WSL.

Ambos caminos son configuración, no código nuevo, y no los he podido probar aquí (sin servidor SSH y sin una distribución de WSL).

### Otros agentes

El comando `npc-bridge` traduce los hooks de otras herramientas al NPC. Compílalo con `npm run bridge` (queda en `src-tauri/target/debug/npc-bridge`). Las configuraciones siguen la documentación de cada herramienta; sustituye `<ruta>` por la ruta completa del ejecutable.

**Gemini CLI** (`~/.gemini/settings.json`):

```json
{ "hooks": {
  "BeforeTool":   [{ "matcher": "*", "hooks": [{ "type": "command", "command": "<ruta> gemini" }] }],
  "AfterTool":    [{ "matcher": "*", "hooks": [{ "type": "command", "command": "<ruta> gemini" }] }],
  "Notification": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "<ruta> gemini" }] }],
  "AfterAgent":   [{ "matcher": "*", "hooks": [{ "type": "command", "command": "<ruta> gemini" }] }]
} }
```

**Cursor** (`~/.cursor/hooks.json`):

```json
{ "version": 1, "hooks": {
  "beforeSubmitPrompt": [{ "command": "<ruta> cursor" }],
  "afterFileEdit":      [{ "command": "<ruta> cursor" }],
  "stop":               [{ "command": "<ruta> cursor" }]
} }
```

**Codex** (`~/.codex/config.toml`): `notify = ["<ruta>", "codex"]`

Añadiendo `--ask` (`<ruta> gemini --ask`, o `beforeShellExecution` con `<ruta> cursor --ask`) la herramienta pide el permiso al NPC en vez de a su propio aviso. Si el NPC no está abierto, el puente no estorba: devuelve una respuesta neutra y el agente sigue como siempre.

Cualquier otra herramienta puede usar el endpoint HTTP directamente:

```bash
# aparece como sesión “codex”
curl -X POST http://127.0.0.1:47650/agent -d '{"agent":"codex","session_id":"1","cwd":"/ruta/proyecto","state":"working","tool":"shell","detail":"pytest"}'

# pide permiso y espera la respuesta: {"allow": true|false}
curl -X POST http://127.0.0.1:47650/agent -d '{"agent":"codex","session_id":"1","permission":true,"tool":"shell","detail":"rm -rf dist"}'
```

`state` es uno de `idle thinking working waiting attention done error ended`.

## Seguridad

- Las tareas lanzadas desde el NPC solo pueden leer (`Read`, `Glob`, `Grep`, `LS`) salvo que actives *Permitir que Claude edite archivos*. Cualquier otra herramienta pasa por la tarjeta de permisos si los hooks están conectados; si no, se deniega.
- *Aprobar permisos automáticamente* responde “Permitir” a todo, salvo a las preguntas de Claude (`AskUserQuestion`), que siempre se muestran para que contestes tú. Está desactivado por defecto.
- El servidor de hooks escucha solo en `127.0.0.1` y no lleva token: cualquier proceso local puede enviarle eventos (puede mostrar tarjetas falsas, pero no aprobar nada: las decisiones solo salen hacia el agente que preguntó).
- Los tokens de Telegram y las URL de webhooks se guardan en texto plano en la configuración de la app.
- Al escribir en una nota, si cambió mientras Claude trabajaba, se vuelve a localizar la tarea por su texto; si ya no está, no se escribe nada.
- Los comandos de Obsidian no pasan por una shell: solo se ejecutan los ids guardados como favoritos, validados (letras, números, `-`, `_`, `.` y `:`).
- El diagnóstico de eventos (*Ver eventos recibidos*) vive solo en memoria y no guarda prompts ni entradas de herramientas.

## Pruebas

```bash
npm run test:ui       # interfaz: traducciones completas y coherentes en los 5 idiomas
npm run test          # Rust: hooks, permisos, vault, acciones de Obsidian (URIs, parser de comandos), Telegram y webhooks (contra servidores simulados), puentes, vista móvil, temas, parser de claude
npx tsc --noEmit      # tipos del frontend
```

Para ver la interfaz sin Tauri: `npx vite` y abre `http://localhost:1420/tests/preview.html` (backend simulado en `tests/mock.ts`).

### Qué se ha comprobado de verdad

- **En la app real de Windows** (inspeccionando su webview): el overlay se carga, el click-through se activa solo sobre el personaje, el flujo hook → tarjeta → Permitir/Denegar → respuesta HTTP, el flujo de tareas con escritura en una vault temporal, Telegram, Slack y Feishu contra servidores simulados, los puentes de Gemini, Cursor y Codex con cargas de ejemplo, los endpoints `/agent` y `/usage`, la vista del móvil en loopback, los temas (incluido uno propio), el modo mini, el seguimiento de ojos, que *Terminal* encuentra una ventana real por el nombre de la carpeta, la importación de un pet de Codex (sintético) con cada estado en la fila de animación que le toca, la instalación de un tema por URL, el cambio de idioma y su persistencia.
- **Con un `claude` de pega** que emite el mismo JSON (`--output-format stream-json`): el runner y la reescritura de la nota. No con el modelo real: la sesión de este entorno tenía el OAuth caducado.
- **Sin comprobar:** Don Hámster (y su chiste propio) solo se ha verificado con `tsc`, `npm run test:ui` y la vista previa con `mockIPC`; no se ha visto en la app real. Obsidian real (solo carpetas con el mismo formato); los atajos *Nota diaria*, *Buscar* y *Nota nueva* (`obsidian://`) y los comandos favoritos por la CLI oficial de Obsidian (`command id=`, Obsidian 1.12.7+): solo tienen tests unitarios del parser, las URIs, la validación de ids y el runner, y el formato de `obsidian commands` es una suposición; que Claude Code, Gemini CLI, Cursor y Codex reales llamen a los hooks tal como indica su documentación, la `statusLine` en una sesión viva, *Continuar* / *Escribir* (`--resume`) con un `claude` real, también sobre sesiones creadas en Claude Desktop, el login desde la NPC (*Iniciar sesión*), los atajos globales pulsados con teclado real, los bots reales de Telegram/Slack/Feishu, la vista del móvil desde un teléfono, que una sesión retomada con `--resume` siga viva durante una tarea real (la ejecución en segundo plano no debe hacerla desaparecer de *Sesiones*; arreglado, sin probar en la app), que Windows conceda el foco al traer una ventana al frente (si lo niega, parpadea en la barra de tareas), macOS y Linux.
- **Solo con tests unitarios y la vista previa con `mockIPC`** (no con Claude real): responder preguntas (`AskUserQuestion`, con `updatedInput.answers`) y aprobar planes (`ExitPlanMode`) desde el panel de la sesión; que las sesiones de Claude Desktop envíen el hook `PermissionRequest`; la sección *Recientes* con un historial grande; *Reintentar*; el diagnóstico *Ver eventos recibidos* con eventos reales de Claude Desktop (probado con tests unitarios y la vista previa, no con eventos reales).

## Alcance frente a clawd-on-desk

[clawd-on-desk](https://github.com/rullerzhou-afk/clawd-on-desk) fue una inspiración conceptual; no se ha copiado código ni arte (es AGPL-3.0).

| Función de clawd-on-desk | Aquí |
|---|---|
| Estados animados según el agente | ✅ Claude Code; puentes para Gemini, Cursor y Codex; endpoint genérico |
| Burbujas de permisos + atajo global | ✅ |
| Aprobar desde Telegram | ✅ |
| Avisos en Slack / Feishu | ✅ solo avisos (Feishu sin aprobación interactiva) |
| Panel de sesiones + saltar a la terminal | ✅ por nombre de carpeta; si no la encuentra, abre una que reanuda la sesión |
| Anillos de cuota | ✅ requiere configurar la `statusLine` |
| Vista del móvil | ✅ solo lectura, PWA |
| Mini modo | ✅ borde derecho |
| Seguimiento de ojos, dormir, reacción al clic | ✅ |
| Temas | ✅ 4 paletas, temas propios, instalables por URL e importación de Codex Pets (probado con uno sintético). Sin catálogo oficial ni Live2D |
| +25 agentes con integración propia | ◐ Claude Code, Gemini, Cursor y Codex; el resto por el endpoint genérico |
| macOS / Linux | ◐ código escrito, sin probar |
| WSL / SSH remoto | ◐ copiar los hooks + túnel `ssh -R` o WSL2 *mirrored*; sin probar |
| Varios idiomas | ✅ 5 idiomas |
| **Enviar tareas a Claude** | ✅ (clawd-on-desk no lo hace) |
| **Obsidian** | ✅ (clawd-on-desk no lo tiene) |

## Licencias

MIT. `src/physics.ts` está adaptado de [just-simple-npc](https://github.com/DavidHurtadoAI/just-simple-npc) (MIT, © 2026 David Hurtado); ver `NOTICE`. El personaje es original.
