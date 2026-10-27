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
| 13 | Responder preguntas de Claude y aprobar planes desde el panel de la sesión; sesiones recientes; *Reintentar* en tareas fallidas | Tests unitarios y vista previa con `mockIPC`; **no** probado con un `claude` real |
| 14 | Diagnóstico de hooks: *Ver eventos recibidos* en Ajustes > Claude > Conexión (recuento por evento, últimas líneas, aviso si nunca llega `PermissionRequest`) | Tests unitarios (solo nombres, tope de 80 eventos) y vista previa con `mockIPC`; **no** probado con eventos reales de Claude Desktop |
| 15 | Obsidian: acciones rápidas (nota diaria, buscar, nota nueva por URI `obsidian://`) y comandos favoritos de la paleta por la CLI oficial; elegir vault con filtro | Tests unitarios (parser de comandos, URIs, validación de ids, tope de favoritos, runner); vista previa con `mockIPC`; **no** probado con Obsidian real ni con su CLI |
| 16 | Memoria desde el vault (opcional, apagada por defecto): índice de notas, tags y enlaces; recall en tareas del NPC y, si se activa, en sesiones de Claude Code por el hook `UserPromptSubmit`; notas de sesión y *Recordar* bajo `Claude NPC/`; pestaña *Cerebro* | Tests unitarios (índice, BM25 con expansión por enlaces, captura y reescritura solo bajo `Claude NPC/`, exclusiones); vista previa con `mockIPC`; **no** probado con Obsidian real ni con Claude Code real |
| 17 | Propuestas para tus notas (pestaña *Cerebro*, *Buscar enlaces y etiquetas*): enlazar la primera mención sin enlazar del título de otra nota y añadir una etiqueta frecuente a las notas sin etiquetas; diff visible; se escribe solo con *Aplicar* y solo si la línea propuesta sigue igual | Tests unitarios (detección y exclusiones, rechazo de notas cambiadas o fuera de la vault, CRLF); **no** probado con una vault real ni visto en la vista previa |
| 18 | Reflexión al terminar una sesión (opcional, apagada por defecto; *Reflexionar ahora* en Cerebro): un Haiku de solo lectura lee el final de la conversación y escribe lecciones y decisiones en `Claude NPC/Memoria/`, pendientes en `Pendientes.md` (sin `#claude`) y una nota de reflexión enlazada; validación de la respuesta y enlaces solo a notas existentes | Tests unitarios (validación del JSON, saneado, enlaces contra el índice, escritura bajo `Claude NPC/` sin duplicados, exclusiones); **no** probado con un `claude` real ni con Obsidian real |
| 19 | Forjar una personalidad (opcional, apagada por defecto; exige memoria): la reflexión anota cómo trabajas; lo que se repite en 2 sesiones distintas pasa a `Claude NPC/Personalidad.md` y se añade al contexto de las tareas del NPC y, una vez por sesión, al de Claude Code; interruptor y tarjeta en *Cerebro* | Tests unitarios (observaciones pendientes, promoción solo tras 2 sesiones distintas, ediciones del usuario, nota sin marca, bloque acotado, contexto de la reflexión); vista previa con `mockIPC`; **no** probado con un `claude` real ni con Obsidian real |

## Fuera del MVP (decidido, no olvidado)

- Integraciones nativas con los 25+ agentes restantes de clawd-on-desk (se pueden añadir con `/agent` o un puente).
- Catálogo oficial de temas y Live2D.
- WSL y SSH remoto como funciones probadas (hay un botón que copia los hooks y la receta en el README).
- macOS y Linux (el código está escrito pero sin compilar ni probar).
- Cerebro, siguiente hito (no iniciado): chat con citas y mini-grafo.
- Personalidad: chistes y burbujas generados a partir de los rasgos (hoy son listas fijas) y propuestas de cambio con botón *Aplicar* (hoy los rasgos entran solos al repetirse).

## Pendiente de verificar por quien tenga el entorno

Estas comprobaciones no se pueden hacer sin tu sesión y tu equipo:

1. Una tarea real con `claude` con sesión iniciada (el entorno de desarrollo tenía el OAuth caducado).
2. Una vault real de Obsidian (la lectura del registro de vaults y el botón *Abrir en Obsidian* usan el formato documentado, sin Obsidian instalado para verlo).
3. Gemini CLI, Cursor y Codex reales, y los bots reales de Telegram, Slack y Feishu.
4. Los atajos `Ctrl+Alt+Y/N` con teclado físico.
5. Continuar una conversación con `--resume` (*Continuar* en tareas y *Escribir* en una sesión) con un `claude` real, también sobre una sesión creada en Claude Desktop; y que la sesión retomada siga apareciendo en *Sesiones* durante una tarea real (arreglado, sin probar).
6. El login desde la NPC (*Iniciar sesión* abre una terminal con `claude auth login`) y el sondeo de `claude auth status` al cerrarla.
7. Que Claude Code acepte las respuestas a `AskUserQuestion` (`updatedInput.answers`) y que la aprobación de `ExitPlanMode` se comporte como se espera.
8. Que las sesiones de Claude Desktop envíen el hook `PermissionRequest` (el diagnóstico *Ver eventos recibidos* en Ajustes > Claude > Conexión permite comprobar qué eventos llegan).
9. La sección *Recientes* con un historial real grande, y *Reintentar* con un `claude` real.
10. Las acciones de Obsidian en una Obsidian real: los atajos `obsidian://` y los comandos favoritos con la CLI oficial (`obsidian vault=<nombre> command id=<id>`, Obsidian 1.12.7+). El formato de `obsidian commands` es una suposición; solo hay tests unitarios.
11. La memoria desde el vault (*Cerebro*) con Obsidian y Claude Code reales: que Claude Code acepte `hookSpecificOutput.additionalContext` de un hook HTTP en `UserPromptSubmit`, el efecto del recall en las tareas y sesiones, las notas de sesión que escriben `Stop`/`SessionEnd` y el tiempo de indexado de una vault grande. Solo hay tests unitarios y la vista previa.
12. Las propuestas para tus notas (*Cerebro* → *Buscar enlaces y etiquetas*) con una vault real: que las menciones y etiquetas propuestas sean útiles y que *Aplicar* deje la nota exactamente como muestra el diff. Solo hay tests unitarios.
13. La reflexión al terminar una sesión (*Reflexionar al terminar cada sesión* y *Reflexionar ahora* en Cerebro) con un `claude` real: que `--model haiku` y `--allowedTools Read,Glob,Grep,LS` se comporten como se espera, que la sesión de la reflexión no aparezca en *Sesiones* ni en *Recientes* (es probable que sí, porque sus hooks llegan igual), que las notas sean útiles y no repetitivas, y el coste en cuota. Solo hay tests unitarios.
14. La personalidad (*Forjar una personalidad*, en *Cerebro*) con un `claude` y una vault reales: que Haiku devuelva observaciones útiles y sin datos privados (el prompt lo pide; no hay garantía), que se repitan con redacción suficientemente parecida para promoverse (la coincidencia es casi literal), el efecto del bloque en las tareas y en las sesiones (una vez por sesión, por `additionalContext`) y que Claude Code lo acepte. Solo hay tests unitarios y la vista previa.

Telegram y Slack no responden preguntas ni planes (Telegram muestra Permitir/Denegar); eso queda para el escritorio.

Si alguno falla, abre un issue con el síntoma: los puntos 1–14 son los candidatos más probables a necesitar un ajuste.
