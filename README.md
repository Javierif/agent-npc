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
| Obsidian | Apunta a tu vault. Cualquier `- [ ] algo #claude` de tus notas aparece en el panel; con ▶ Claude lo hace y **escribe la respuesta bajo la tarea y la marca como hecha**. La tarea puede llevar contexto: `[[Nota]]` (Claude lee esa nota primero) y `📁 carpeta` (trabaja en esa carpeta); ver *Obsidian*. También puedes añadir tareas desde el NPC a una bandeja (`Claude NPC Inbox.md`). Funciona sobre los archivos, sin plugin. Además, el panel tiene botones para la nota diaria, buscar y crear una nota nueva (por URI `obsidian://`), y hasta 6 comandos favoritos de Obsidian que se ejecutan con su CLI oficial (ver *Obsidian*). |
| Propuestas para tus notas | En *Obsidian → Cerebro*, sugiere enlazar menciones de otras notas y añadir etiquetas frecuentes a las que no tienen. Muestra el diff y solo escribe con *Aplicar*. Ver *Cerebro*. |
| Memoria | Opcional (apagada por defecto): tu vault de Obsidian como memoria. Antes de cada tarea del NPC, y en tus sesiones de Claude Code si lo activas, añade las notas relevantes al contexto; al terminar una sesión escribe una nota enlazada en `Claude NPC/` y, si lo activas, reflexiona al cerrarla (lecciones, decisiones y pendientes) y forja una personalidad con lo que aprende de cómo trabajas. Puedes también hacerle preguntas con citas y pedir un resumen semanal y un aviso de mantenimiento. Con el tiempo olvida (archiva, sin borrar) lo que no usa, consolida lo aprendido en principios y hábitos y une las notas que recuerda juntas. Ver *Cerebro*. |
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

En **Obsidian**, elige tu vault (se detectan los que Obsidian tiene registrados) o escribe la ruta. Las tareas lanzadas desde una nota se ejecutan con la vault como directorio de trabajo, salvo que la tarea indique otra carpeta con `📁`.

En el mismo panel:

- **Nota diaria**, **Buscar** y **Nota nueva** abren Obsidian con una URI `obsidian://`. *Buscar* y *Nota nueva* usan el texto del cuadro (*Nota nueva* no crea nada si está vacío).
- **★** elige hasta 6 comandos de la paleta de Obsidian como botones (por ejemplo, abrir la nota diaria). Se ejecutan con la CLI oficial de Obsidian (`obsidian vault=<tu vault> command id=<id>`), que requiere **Obsidian 1.12.7 o superior** con la CLI activada en Obsidian; en Windows el NPC usa `Obsidian.com`. Solo se ejecutan los comandos que hayas guardado como favoritos, con un tiempo máximo de 10 s.

**Contexto en una tarea.** Además del texto, una tarea `- [ ] … #claude` puede llevar:

- `[[Nota]]` (hasta 5): se le pide a Claude que lea esas notas antes de responder (si no están, las busca por nombre).
- `📁 carpeta` o `📁 "carpeta con espacios"`: la tarea se ejecuta en esa carpeta, absoluta o relativa a la vault (tiene que existir). La vault se añade como directorio extra. Sigue siendo de solo lectura salvo que actives *Permitir que Claude edite archivos*.

Con la memoria activa (ver *Cerebro*), la respuesta también se guarda como nota en `Claude NPC/Tareas/` y la tarea termina con un enlace `→ [[nota]]`.

Si la CLI no está instalada o no responde en 10 s, el NPC muestra el error.

### Cerebro (memoria del vault)

Opcional y apagado por defecto. Con el vault configurado, en el panel **Obsidian → Cerebro** activa *Memoria activada* (`brainEnabled`):

- **Tareas del NPC:** antes de lanzar `claude -p`, busca en el vault las notas relacionadas con lo que pides y las añade al prompt en un bloque «Memoria del usuario (Obsidian)», que Claude debe tratar como datos y no como instrucciones. Si la vault no es la carpeta de trabajo, se le da acceso con `--add-dir`.
- **Sesiones de Claude Code:** con *También en tus sesiones de Claude Code* (`brainInjectSessions`, que exige lo anterior), cada mensaje que escribes recibe notas relevantes a través del hook `UserPromptSubmit`. No se aplica a las ejecuciones en segundo plano, a los comandos `/` ni a las tareas que ya llevan ese bloque.
- **Lo que escribe:** al terminar un turno de Claude Code (`Stop`) o cerrar la sesión, crea o actualiza `Claude NPC/Sesiones/<fecha> <tema> (<id>).md`, una bitácora con una línea por turno (hora, lo pedido y el inicio de la respuesta; máx. 60 líneas) que tras una reflexión lleva un resumen arriba; enlazada desde `Claude NPC/Proyectos/` y `Claude NPC/Diario/<fecha>.md`. *Recordar* guarda un dato en `Claude NPC/Memoria/`. Solo actualiza las notas que generó el NPC: si borras la línea `<!-- claude-npc:auto -->` de una nota de sesión, deja de tocarla. Las respuestas de las tareas del vault van a `Claude NPC/Tareas/`, el panel de Dataview a `Claude NPC/Panel.md` (se crea si falta y no se vuelve a escribir) y los resúmenes semanales a `Claude NPC/Semanal/`. Nunca escribe fuera de `Claude NPC/` ni edita tus notas por su cuenta (la excepción son las propuestas de abajo, que solo aplicas tú).
- **Reflexión al terminar una sesión:** con *Reflexionar al terminar cada sesión* (`brainReflect`, apagado por defecto y con *Memoria activada*), al cerrar una sesión de Claude Code un agente pequeño (Haiku, con tu `claude` y tu cuota) lee el final de la conversación y escribe, bajo `Claude NPC/`: las lecciones y decisiones en `Memoria/` (si ya existe una nota del NPC con ese título, añade una línea con la fecha), los pendientes en `Pendientes.md` (sin la etiqueta `#claude`, así que no se lanzan solos) y una nota `Reflexiones/<fecha> <tema> (<id>).md` enlazada a la sesión y al proyecto. Admite hasta 4 lecciones, 3 decisiones y 5 pendientes; cada lección y decisión lleva una importancia de 1 a 5 (3 por defecto), que decide cuánto tarda en desvanecerse; los enlaces solo apuntan a notas que existen. No reflexiona sobre las carpetas de *Carpetas a excluir* ni sobre conversaciones muy cortas. *Reflexionar ahora* lo lanza sobre la sesión más reciente (no reflexiona sobre otra reflexión) y solo exige *Memoria activada*. Gasta cuota y envía a Claude el final de la conversación (hasta 12 000 caracteres). Las reflexiones se hacen en `Claude NPC/` y nunca editan tus notas.
- **Propuestas para tus notas:** en la sección *✨ Propuestas para tus notas* pulsa *Buscar enlaces y etiquetas*. No depende de *Memoria activada* (solo necesita el vault configurado) y no escribe nada hasta que pulses *Aplicar*. Hay dos tipos, cada uno con su diff:
  - **Enlazar:** envuelve en `[[enlace]]` la primera mención sin enlazar del título de otra nota (por ejemplo, «atlas» → `[[Atlas]]`). Ignora código, enlaces que ya existen, URLs, encabezados y las notas de `Claude NPC/`. Solo usa títulos únicos de al menos 4 letras, hasta 3 por nota.
  - **Etiquetar:** añade al frontmatter una etiqueta frecuente (usada en al menos 3 notas) a las notas que no tienen ninguna. Si la nota no tiene cabecera, la crea.

  Se revisan hasta 400 notas, las más recientes, y se proponen como máximo 40 cambios. *Aplicar* relee la nota y solo escribe si la línea propuesta sigue exactamente igual; si la nota ha cambiado, no escribe y te pide que busques de nuevo. Nunca toca `Claude NPC/`, conserva los saltos de línea CRLF y guarda de forma atómica. *Descartar* quita la propuesta de la lista sin tocar nada.
- **Personalidad:** con *Forjar una personalidad* (`brainPersona`, apagado por defecto y con *Memoria activada*), la reflexión anota hasta 3 observaciones sobre cómo te gusta trabajar y cómo te gusta que te hablen. Una observación no cambia nada hasta que aparece en 2 sesiones distintas; entonces pasa a `Claude NPC/Personalidad.md` (secciones *Rasgos*, *Sobre ti* y *Valores*, lo que te importa al trabajar, con su *Historial*; la historia que escribe el sueño va en *Mi historia*) y se añade al contexto de las tareas del NPC y, una vez por sesión, a tus sesiones de Claude Code (si está activo *También en tus sesiones de Claude Code*). Aprende solo al reflexionar: con *Reflexionar al terminar cada sesión* o con *Reflexionar ahora*. Las observaciones pendientes se ven en la nota (*Observaciones*). Es un archivo que puedes editar: lo que añadas o quites se respeta y, si quitas la marca `<!-- claude-npc:auto -->`, el NPC deja de tocarlo (el bloque sigue usándose). El prompt pide no anotar salud, finanzas, política, religión, identidad ni relaciones; no hay garantía de que el modelo lo cumpla.
- **Preguntar al cerebro:** el botón *💬 Preguntar*, junto a *Buscar*, pasa tu pregunta a tu `claude` con las notas que el cerebro recuerda para ella (hasta 8). Responde solo con lectura, con la vault como directorio de trabajo, cita las notas con `[[ ]]` y debajo aparece un botón por cada nota citada para abrirla. No escribe nada y no guarda historial: cada pregunta es suelta. Exige *Memoria activada* y gasta cuota.
- **Resumen semanal** (*📅 Resumen semanal*): Haiku lee las reflexiones de los últimos 7 días (mínimo 2) y tus pendientes abiertos, y escribe `Claude NPC/Semanal/Semana <lunes>.md` con un resumen, lo que se repite, lo que se contradice, lo atascado y los siguientes pasos. Al terminar una sesión con reflexión también se genera solo, si aún no existe el de esta semana. Exige *Memoria activada*. Si ya existe, el botón lo vuelve a escribir.
- **Mantenimiento** (*🧹 Mantenimiento*): solo avisos, sin cambiar nada: pendientes abiertos desde hace 14 días o más, lecciones con títulos casi iguales y hasta 10 notas tuyas sin enlaces. No hay botón para fusionar ni borrar; eso lo decides tú, con el botón que abre cada nota.
- **Olvido** (*Olvidar con el tiempo*, `brainForget`, apagado por defecto y con *Memoria activada*): las lecciones y decisiones que el NPC escribe en `Claude NPC/Memoria/` pierden fuerza con el tiempo. Se refuerzan cada vez que una tarea o una sesión las recuerda, o cuando se repiten en otra sesión, y duran más las que se usan más o son importantes. Al cerrar una sesión, las que quedan muy débiles (y no son de importancia 5) pasan a `Claude NPC/Archivo/`: no se borran, conservan su nombre (sus `[[enlaces]]` siguen valiendo) y ya no se recuerdan. El uso se guarda en `Claude NPC/.memoria.json`. Tus notas nunca se olvidan. La pestaña *Cerebro* cuenta cuántos recuerdos hay archivados.
- **Sueño** (*😴 Consolidar*; además, una vez por semana tras una reflexión): Haiku lee hasta 40 notas de `Memoria/` (las más importantes primero) y escribe **principios** (en `Memoria/`), **hábitos** «cuando X, haz Y» (en `Claude NPC/Hábitos/`, que el recuerdo pondera algo más), **contradicciones** entre lecciones y, con *Forjar una personalidad*, una historia en primera persona en la personalidad. Cada principio o hábito enlaza al menos a 2 lecciones existentes. Lo que ya existe no se sobrescribe, y cada semana queda una nota en `Claude NPC/Sueños/`. Exige *Memoria activada*.
- **Asociaciones:** si el NPC recuerda dos notas juntas en 3 días distintos, quedan asociadas: el recuerdo las sigue como si estuvieran enlazadas y, si una es nota del NPC, la otra aparece en su sección `## Asociadas` como enlace. Tus notas no se editan.
- **Panel de Dataview** (*📊 Abrir panel*): crea `Claude NPC/Panel.md` si falta, con consultas sobre las notas del NPC (pendientes, últimas reflexiones, lecciones y decisiones, sesiones por proyecto, tareas resueltas y resúmenes semanales). Las consultas necesitan el plugin Dataview; sin él se ven como texto. No requiere *Memoria activada*.
- **Sesiones internas:** las ejecuciones del propio cerebro (reflexión, preguntas, resumen semanal y sueño) no deberían aparecer en *Sesiones* ni en *Recientes*, ni generar notas o avisos. Está implementado, pero no comprobado con un `claude` real.
- **Lo que lee:** títulos, alias, `#etiquetas` y `[[enlaces]]` (con sus backlinks) de hasta 20 000 notas, sin embeddings: búsqueda BM25 que además sigue enlaces y asociaciones hasta dos saltos (con menos peso en cada salto). Se salta las carpetas de *Carpetas a excluir*, las notas con `claude: false` en su cabecera y los archivos de más de 1 MB; no toma enlaces ni etiquetas de los bloques de código. Las notas del proyecto de la carpeta de trabajo (la nota `Proyecto - <carpeta>` y las que la enlazan) suben en el recuerdo. El índice vive en memoria y se reconstruye en segundo plano cada 60 s.
- Las fechas y horas de las notas están en UTC.

Salvo la reflexión y la personalidad, que el autor ha probado de forma informal con una vault y un `claude` reales, nada de esto está probado con Obsidian ni con Claude Code reales (ver *Qué se ha comprobado*).

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
- La memoria del vault está apagada por defecto. Lo que recupera (fragmentos de tus notas) se envía a Claude, y una nota puede contener texto que intente dar instrucciones: el bloque lo marca como datos, pero no hay garantía. Activa *También en tus sesiones de Claude Code* solo si confías en el contenido de tus notas. El hook `UserPromptSubmit` solo devuelve contexto con esa opción activa.
- La reflexión (apagada por defecto) envía el final de una conversación a Claude a través de tu propio `claude`, con `Haiku` y solo herramientas de lectura (`Read`, `Glob`, `Grep`, `LS`) dentro de la vault. El modelo no escribe nada: lo que devuelve se valida y solo el NPC escribe, bajo `Claude NPC/`. Las notas o la conversación pueden contener texto que intente dar instrucciones; el prompt lo trata como datos, pero no hay garantía.
- La personalidad (apagada por defecto) se genera con la misma reflexión de Haiku: sus observaciones se validan y sanean, y solo el NPC escribe `Claude NPC/Personalidad.md`. Se inyecta como datos, no como instrucciones, pero el prompt es la única barrera frente a datos privados.
- Las preguntas al cerebro y el mantenimiento solo leen; el resumen semanal escribe solo en `Claude NPC/Semanal/`. El sueño envía a Haiku fragmentos de hasta 40 notas de `Memoria/` (nunca conversaciones) y escribe solo bajo `Claude NPC/` (y en la historia de la personalidad); el olvido solo mueve notas auto a `Claude NPC/Archivo/`, sin borrar nada. El `📁` de una tarea del vault puede llevar a Claude a cualquier carpeta existente, también fuera de la vault, con las mismas reglas de permisos: solo lectura salvo *Permitir que Claude edite archivos*.
- La memoria escribe solo dentro de `Claude NPC/`, con nombres saneados, y nunca edita tus notas. La única excepción son las propuestas para tus notas: cambian una línea de una nota (o añaden una etiqueta a su cabecera) solo cuando pulsas *Aplicar*, y solo si la nota no ha cambiado desde que se propuso.

## Pruebas

```bash
npm run test:ui       # interfaz: traducciones completas y coherentes en los 5 idiomas
npm run test          # Rust: hooks, permisos, vault, memoria del vault (índice, recall, captura y bitácora, reflexión, personalidad, olvido, asociaciones, sueño), propuestas para tus notas, preguntas al cerebro, resumen semanal, mantenimiento, tareas con contexto (`[[ ]]` y `📁`), panel, acciones de Obsidian (URIs, parser de comandos), Telegram y webhooks (contra servidores simulados), puentes, vista móvil, temas, parser de claude
npx tsc --noEmit      # tipos del frontend
```

Para ver la interfaz sin Tauri: `npx vite` y abre `http://localhost:1420/tests/preview.html` (backend simulado en `tests/mock.ts`).

### Qué se ha comprobado de verdad

- **En la app real de Windows** (inspeccionando su webview): el overlay se carga, el click-through se activa solo sobre el personaje, el flujo hook → tarjeta → Permitir/Denegar → respuesta HTTP, el flujo de tareas con escritura en una vault temporal, Telegram, Slack y Feishu contra servidores simulados, los puentes de Gemini, Cursor y Codex con cargas de ejemplo, los endpoints `/agent` y `/usage`, la vista del móvil en loopback, los temas (incluido uno propio), el modo mini, el seguimiento de ojos, que *Terminal* encuentra una ventana real por el nombre de la carpeta, la importación de un pet de Codex (sintético) con cada estado en la fila de animación que le toca, la instalación de un tema por URL, el cambio de idioma y su persistencia.
- **Con un `claude` de pega** que emite el mismo JSON (`--output-format stream-json`): el runner y la reescritura de la nota. No con el modelo real: la sesión de este entorno tenía el OAuth caducado.
- **Sin comprobar:** Don Hámster (y su chiste propio) solo se ha verificado con `tsc`, `npm run test:ui` y la vista previa con `mockIPC`; no se ha visto en la app real. Obsidian real (solo carpetas con el mismo formato); los atajos *Nota diaria*, *Buscar* y *Nota nueva* (`obsidian://`) y los comandos favoritos por la CLI oficial de Obsidian (`command id=`, Obsidian 1.12.7+): solo tienen tests unitarios del parser, las URIs, la validación de ids y el runner, y el formato de `obsidian commands` es una suposición; que Claude Code, Gemini CLI, Cursor y Codex reales llamen a los hooks tal como indica su documentación, la `statusLine` en una sesión viva, *Continuar* / *Escribir* (`--resume`) con un `claude` real, también sobre sesiones creadas en Claude Desktop, el login desde la NPC (*Iniciar sesión*), los atajos globales pulsados con teclado real, los bots reales de Telegram/Slack/Feishu, la vista del móvil desde un teléfono, que una sesión retomada con `--resume` siga viva durante una tarea real (la ejecución en segundo plano no debe hacerla desaparecer de *Sesiones*; arreglado, sin probar en la app), que Windows conceda el foco al traer una ventana al frente (si lo niega, parpadea en la barra de tareas), macOS y Linux.
- **Solo con tests unitarios y la vista previa con `mockIPC`** (no con Claude real): responder preguntas (`AskUserQuestion`, con `updatedInput.answers`) y aprobar planes (`ExitPlanMode`) desde el panel de la sesión; que las sesiones de Claude Desktop envíen el hook `PermissionRequest`; la sección *Recientes* con un historial grande; *Reintentar*; el diagnóstico *Ver eventos recibidos* con eventos reales de Claude Desktop (probado con tests unitarios y la vista previa, no con eventos reales); la memoria del vault (*Cerebro*: índice, recall, notas de sesión y el contexto que se inyecta por el hook), que solo tiene tests unitarios y la vista previa con `mockIPC`: no se ha comprobado con Obsidian real ni con Claude Code real, incluido que Claude Code acepte `additionalContext` de un hook HTTP y el efecto del recall en las respuestas; las propuestas para tus notas (enlaces y etiquetas, y *Aplicar* sobre notas reales), que solo tienen tests unitarios y no se han visto en la vista previa; las mejoras del cerebro de la última tanda (preguntar al cerebro con citas, tareas con `[[ ]]` y `📁`, la nota de respuesta de cada tarea, el panel de Dataview, el resumen semanal, *Mantenimiento*, la ocultación de las sesiones internas y la relevancia por proyecto): solo tests unitarios y sin ver en la vista previa, así que no se sabe si el prompt de una tarea hace que Claude lea las notas y trabaje en la carpeta indicada, si las citas son correctas, si el panel funciona con Dataview, ni si las sesiones internas realmente no aparecen en *Sesiones* ni en *Recientes*. La última tanda (el olvido y el refuerzo con `brainForget` y `Archivo/`, la bitácora con resumen en las notas de sesión, el sueño con principios, hábitos, contradicciones e historia, las asociaciones, el recuerdo a dos saltos y los valores de la personalidad) solo tiene tests unitarios: no se ha visto con Obsidian ni con Claude Code reales.
- **Probado de forma informal por el autor** (sin registro formal de lo comprobado): la reflexión al terminar una sesión (*Reflexionar al terminar cada sesión* y *Reflexionar ahora*) y la personalidad (*Forjar una personalidad*), con una vault y un `claude` reales. Lo que no se ha comprobado de forma sistemática sigue sin verificar: que `--model haiku` y `--allowedTools` se comporten como se espera, que la personalidad respete la privacidad, si las observaciones se repiten con redacción suficientemente parecida para promoverse (la coincidencia es casi literal) y el efecto real del bloque en tareas y sesiones.

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
| **Memoria desde el vault** | ◐ opcional; reflexión y personalidad probadas a mano por el autor con una vault y un `claude` reales, sin comprobación formal; el resto sin probar con Obsidian ni Claude Code reales (clawd-on-desk no lo tiene) |

## Licencias

MIT. `src/physics.ts` está adaptado de [just-simple-npc](https://github.com/DavidHurtadoAI/just-simple-npc) (MIT, © 2026 David Hurtado); ver `NOTICE`. El personaje es original.
