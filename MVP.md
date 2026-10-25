# Definición del MVP

Objetivo original: «un MVP con una mascota que se mueve por la pantalla, con físicas, con todas las funcionalidades de clawd-on-desk y con conexión a Obsidian».

«Todas las funcionalidades de clawd-on-desk» no tiene un final comprobable (sus integraciones por agente y por plataforma crecen), así que el MVP se acota a esta lista cerrada. Cada punto indica cómo se comprobó.

## Dentro del MVP

| # | Funcionalidad | Comprobado con |
|---|---|---|
| 1 | Mascota que camina, se sienta, duerme y saluda por encima de la barra de tareas | App real de Windows (webview inspeccionado) |
| 2 | Físicas: arrastrar, soltar y caer con gravedad | Física de just-simple-npc + app real |
| 3 | Overlay transparente con click-through solo sobre el personaje y sus paneles | App real: la ventana pasa de transparente a interactiva al poner el cursor encima |
| 4 | Reacciona al estado de Claude Code (pensar, trabajar, subagentes, alerta, éxito, error) | Eventos reales de hook contra la app; test de cada fila de animación con un pet sintético |
| 5 | Tarjetas de permiso Permitir/Denegar, atajos globales y Telegram | Flujo hook → tarjeta → respuesta HTTP en la app real; Telegram contra un bot simulado; lógica de atajos con tests |
| 6 | Panel de sesiones con saltar a la terminal | App real; ventana real encontrada por nombre de carpeta |
| 7 | Cuota (5 h / 7 d / contexto) | `/usage` en la app real; anillos renderizados |
| 8 | Mandar tareas a Claude y ver progreso y resultado | Runner contra un `claude` de pega con el mismo JSON; parser con tests |
| 9 | **Obsidian:** tareas `- [ ] … #claude` en una vault → Claude → respuesta escrita bajo la tarea y tarea marcada | App real con una vault temporal; 7 tests de vault (reescritura segura si la nota cambió) |
| 10 | Modo mini, temas, Codex Pets, temas por URL, seguimiento de ojos | App real |
| 11 | Avisos Slack/Feishu, vista móvil de solo lectura con token, 5 idiomas | App real y servidores simulados; test de traducciones |
| 12 | Otros agentes: puentes Gemini/Cursor/Codex y endpoint `/agent` | Cargas de ejemplo según su documentación contra la app real |

## Fuera del MVP (decidido, no olvidado)

- Integraciones nativas con los 25+ agentes restantes de clawd-on-desk (se pueden añadir con `/agent` o un puente).
- Catálogo oficial de temas y Live2D.
- WSL y SSH remoto como funciones probadas (hay un botón que copia los hooks y la receta en el README).
- macOS y Linux (el código está escrito pero sin compilar ni probar).

## Pendiente de verificar por quien tenga el entorno

Estas comprobaciones no se pueden hacer sin tu sesión y tu equipo:

1. Una tarea real con `claude` con sesión iniciada (el entorno de desarrollo tenía el OAuth caducado).
2. Una vault real de Obsidian (la lectura del registro de vaults y el botón *Abrir en Obsidian* usan el formato documentado, sin Obsidian instalado para verlo).
3. Gemini CLI, Cursor y Codex reales, y los bots reales de Telegram, Slack y Feishu.
4. Los atajos `Ctrl+Alt+Y/N` con teclado físico.

Si alguno falla, abre un issue con el síntoma: los puntos 1–4 son los candidatos más probables a necesitar un ajuste.
