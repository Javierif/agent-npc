// Interface text. The Spanish source string is the key, so a missing translation
// falls back to Spanish instead of showing a blank. `{name}` marks a placeholder.

export type Lang = "es" | "en" | "pt" | "fr" | "de";

export const LANGS: Record<Lang, string> = {
  es: "Español", en: "English", pt: "Português", fr: "Français", de: "Deutsch",
};

type Entry = Record<Exclude<Lang, "es">, string>;

const e = (en: string, pt: string, fr: string, de: string): Entry => ({ en, pt, fr, de });

export const DICT: Record<string, Entry> = {
  // menu
  "Tareas": e("Tasks", "Tarefas", "Tâches", "Aufgaben"),
  "Sesiones de Claude Code": e("Claude Code sessions", "Sessões do Claude Code", "Sessions Claude Code", "Claude-Code-Sitzungen"),
  "Obsidian": e("Obsidian", "Obsidian", "Obsidian", "Obsidian"),
  "Ajustes": e("Settings", "Configurações", "Réglages", "Einstellungen"),
  // children (mini copies that follow a session)
  "Generar hijo": e("Spawn a mini", "Gerar filho", "Créer un petit", "Mini erzeugen"),
  "Mi hijo": e("My mini", "Meu filho", "Mon petit", "Mein Mini"),
  "Crear una mini mascota que sigue a esta sesión": e("Create a mini pet that follows this session", "Criar um mini mascote que acompanha esta sessão", "Créer une mini mascotte qui suit cette session", "Ein Mini-Maskottchen erzeugen, das dieser Sitzung folgt"),
  "Personalizar hijo": e("Customize mini", "Personalizar filho", "Personnaliser le petit", "Mini anpassen"),
  "Quitar hijo": e("Remove mini", "Remover filho", "Retirer le petit", "Mini entfernen"),
  "Quitar la mini mascota de esta sesión": e("Remove the mini pet from this session", "Remover o mini mascote desta sessão", "Retirer la mini mascotte de cette session", "Das Mini-Maskottchen dieser Sitzung entfernen"),
  "Color": e("Colour", "Cor", "Couleur", "Farbe"),
  "Gorro": e("Hat", "Chapéu", "Chapeau", "Hut"),
  "Sin gorro": e("No hat", "Sem chapéu", "Sans chapeau", "Kein Hut"),
  "Fiesta": e("Party hat", "Chapéu de festa", "Chapeau de fête", "Partyhut"),
  "Corona": e("Crown", "Coroa", "Couronne", "Krone"),
  "Chistera": e("Top hat", "Cartola", "Haut-de-forme", "Zylinder"),
  "Gorro de lana": e("Beanie", "Gorro de lã", "Bonnet", "Mütze"),
  "Flor": e("Flower", "Flor", "Fleur", "Blume"),
  "Antena": e("Antenna", "Antena", "Antenne", "Antenne"),
  "Aureola": e("Halo", "Auréola", "Auréole", "Heiligenschein"),
  "Cerrar (Esc)": e("Close (Esc)", "Fechar (Esc)", "Fermer (Échap)", "Schließen (Esc)"),
  // what Claude is doing
  "📖 Leyendo {x}": e("📖 Reading {x}", "📖 Lendo {x}", "📖 Lit {x}", "📖 Liest {x}"),
  "✍️ Escribiendo {x}": e("✍️ Writing {x}", "✍️ Escrevendo {x}", "✍️ Écrit {x}", "✍️ Schreibt {x}"),
  "✏️ Editando {x}": e("✏️ Editing {x}", "✏️ Editando {x}", "✏️ Modifie {x}", "✏️ Bearbeitet {x}"),
  "⚙️ Ejecutando {x}": e("⚙️ Running {x}", "⚙️ Executando {x}", "⚙️ Exécute {x}", "⚙️ Führt {x} aus"),
  "🔎 Buscando {x}": e("🔎 Searching {x}", "🔎 Procurando {x}", "🔎 Cherche {x}", "🔎 Sucht {x}"),
  "🌐 Abriendo {x}": e("🌐 Opening {x}", "🌐 Abrindo {x}", "🌐 Ouvre {x}", "🌐 Öffnet {x}"),
  "🌐 Buscando en la web: {x}": e("🌐 Searching the web: {x}", "🌐 Pesquisando na web: {x}", "🌐 Recherche sur le web : {x}", "🌐 Websuche: {x}"),
  "🤝 Delegando en un subagente": e("🤝 Delegating to a subagent", "🤝 Delegando a um subagente", "🤝 Délègue à un sous-agent", "🤝 Delegiert an einen Subagenten"),
  "Ver el detalle": e("Show details", "Ver detalhes", "Voir le détail", "Details anzeigen"),
  "Tú": e("You", "Você", "Vous", "Du"),
  "Reintentar": e("Retry", "Tentar de novo", "Réessayer", "Erneut versuchen"),
  "Volver a enviar esta tarea": e("Send this task again", "Enviar esta tarefa de novo", "Renvoyer cette tâche", "Diese Aufgabe erneut senden"),
  "Ya has iniciado sesión. Pulsa Reintentar para enviarla de nuevo.": e("You're signed in. Press Retry to send it again.", "Você já entrou. Toque em Tentar de novo para enviar outra vez.", "Vous êtes connecté. Appuyez sur Réessayer pour la renvoyer.", "Du bist angemeldet. Drücke Erneut versuchen, um sie noch einmal zu senden."),
  "Recientes": e("Recent", "Recentes", "Récentes", "Zuletzt"),
  "ahora": e("now", "agora", "à l'instant", "jetzt"),
  "hace {n} min": e("{n} min ago", "há {n} min", "il y a {n} min", "vor {n} Min."),
  "hace {n} h": e("{n} h ago", "há {n} h", "il y a {n} h", "vor {n} Std."),
  "hace {n} d": e("{n} d ago", "há {n} d", "il y a {n} j", "vor {n} T."),
  // questions, plans and the session popup
  "Claude pregunta": e("Claude asks", "O Claude pergunta", "Claude demande", "Claude fragt"),
  "Otra respuesta…": e("Other answer…", "Outra resposta…", "Autre réponse…", "Andere Antwort…"),
  "Enviar respuestas": e("Send answers", "Enviar respostas", "Envoyer les réponses", "Antworten senden"),
  "Aprobar plan": e("Approve plan", "Aprovar plano", "Approuver le plan", "Plan genehmigen"),
  "Rechazar": e("Reject", "Rejeitar", "Refuser", "Ablehnen"),
  "Escribirle a esta sesión… (Enter envía)": e("Write to this session… (Enter sends)", "Escrever para esta sessão… (Enter envia)", "Écrire à cette session… (Entrée envoie)", "An diese Sitzung schreiben… (Enter sendet)"),
  "Respóndele arriba para que siga.": e("Answer it above so it can go on.", "Responda acima para que continue.", "Répondez ci-dessus pour qu'elle continue.", "Antworte oben, damit es weitergeht."),
  "Está trabajando; podrás escribirle cuando termine.": e("It is working; you can write to it when it finishes.", "Está trabalhando; você poderá escrever quando terminar.", "Elle travaille ; vous pourrez lui écrire quand elle aura fini.", "Sie arbeitet; du kannst schreiben, wenn sie fertig ist."),
  "Enviado a {name}": e("Sent to {name}", "Enviado para {name}", "Envoyé à {name}", "An {name} gesendet"),
  // hook diagnostics
  "Ver eventos recibidos": e("Show received events", "Ver eventos recebidos", "Voir les événements reçus", "Empfangene Ereignisse anzeigen"),
  "Últimos {n} eventos recibidos de Claude Code:": e("Last {n} events received from Claude Code:", "Últimos {n} eventos recebidos do Claude Code:", "{n} derniers événements reçus de Claude Code :", "Letzte {n} Ereignisse von Claude Code:"),
  "Ninguno todavía.": e("None yet.", "Nenhum ainda.", "Aucun pour l'instant.", "Noch keine."),
  "✅ Llegan peticiones de permiso: salen como tarjeta.": e("✅ Permission requests arrive: they show as a card.", "✅ Chegam pedidos de permissão: aparecem como cartão.", "✅ Les demandes d'autorisation arrivent : elles s'affichent en carte.", "✅ Berechtigungsanfragen kommen an: sie erscheinen als Karte."),
  "⚠ Aún no ha llegado ninguna petición de permiso (PermissionRequest).": e("⚠ No permission request (PermissionRequest) has arrived yet.", "⚠ Ainda não chegou nenhum pedido de permissão (PermissionRequest).", "⚠ Aucune demande d'autorisation (PermissionRequest) n'est encore arrivée.", "⚠ Noch keine Berechtigungsanfrage (PermissionRequest) eingetroffen."),
  // CLI sign-in
  "Iniciar sesión": e("Sign in", "Entrar", "Se connecter", "Anmelden"),
  "El CLI de Claude no tiene la sesión iniciada. Inicia sesión una vez y vuelve a enviar.":
    e("The Claude CLI is not signed in. Sign in once and send again.", "O CLI do Claude não está com a sessão iniciada. Entre uma vez e envie de novo.",
      "Le CLI Claude n'est pas connecté. Connectez-vous une fois puis renvoyez.", "Die Claude-CLI ist nicht angemeldet. Melde dich einmal an und sende erneut."),
  "Termina el inicio de sesión en la terminal que se abrió.": e("Finish signing in on the terminal that opened.", "Conclua o login no terminal que foi aberto.", "Terminez la connexion dans le terminal qui s'est ouvert.", "Schließe die Anmeldung im geöffneten Terminal ab."),
  "✔ Sesión iniciada. Ya puedes enviar tareas.": e("✔ Signed in. You can send tasks now.", "✔ Sessão iniciada. Já pode enviar tarefas.", "✔ Connecté. Vous pouvez envoyer des tâches.", "✔ Angemeldet. Du kannst jetzt Aufgaben senden."),
  "⚪ Comprobando el CLI de Claude…": e("⚪ Checking the Claude CLI…", "⚪ Verificando o CLI do Claude…", "⚪ Vérification du CLI Claude…", "⚪ Claude-CLI wird geprüft…"),
  "🟢 CLI de Claude con sesión iniciada": e("🟢 Claude CLI signed in", "🟢 CLI do Claude com sessão iniciada", "🟢 CLI Claude connecté", "🟢 Claude-CLI angemeldet"),
  "⚪ CLI de Claude sin sesión": e("⚪ Claude CLI not signed in", "⚪ CLI do Claude sem sessão", "⚪ CLI Claude non connecté", "⚪ Claude-CLI nicht angemeldet"),
  // continuing sessions
  "Escribir": e("Message", "Escrever", "Écrire", "Schreiben"),
  "Continuar": e("Continue", "Continuar", "Continuer", "Fortsetzen"),
  "Continuando sesión de {name}": e("Continuing {name} session", "Continuando sessão de {name}", "Session {name} en cours", "Setze Sitzung {name} fort"),
  "Empezar una conversación nueva": e("Start a new conversation", "Iniciar uma nova conversa", "Démarrer une nouvelle conversation", "Neue Unterhaltung beginnen"),
  "Seguir esta conversación": e("Keep going in this conversation", "Continuar esta conversa", "Poursuivre cette conversation", "Diese Unterhaltung fortsetzen"),
  "Claude está trabajando en esta sesión; espera a que termine": e("Claude is working in this session; wait for it to finish", "O Claude está trabalhando nesta sessão; aguarde terminar", "Claude travaille dans cette session ; attendez la fin", "Claude arbeitet in dieser Sitzung; warte, bis er fertig ist"),
  "Escribirle desde aquí (continúa la conversación)": e("Message it from here (continues the conversation)", "Escrever daqui (continua a conversa)", "Lui écrire d'ici (poursuit la conversation)", "Von hier schreiben (setzt die Unterhaltung fort)"),
  // states
  "en reposo": e("idle", "em repouso", "au repos", "ruht"),
  "pensando…": e("thinking…", "pensando…", "réfléchit…", "denkt nach…"),
  "trabajando": e("working", "trabalhando", "travaille", "arbeitet"),
  "esperando permiso": e("waiting for permission", "aguardando permissão", "attend une autorisation", "wartet auf Erlaubnis"),
  "te necesita": e("needs you", "precisa de você", "a besoin de vous", "braucht dich"),
  "terminó": e("finished", "terminou", "terminé", "fertig"),
  "tuvo un error": e("hit an error", "teve um erro", "a rencontré une erreur", "hatte einen Fehler"),
  "reinicia en {h} h {m} min": e("resets in {h} h {m} min", "reinicia em {h} h {m} min", "se réinitialise dans {h} h {m} min", "wird in {h} h {m} min zurückgesetzt"),
  "reinicia en {m} min": e("resets in {m} min", "reinicia em {m} min", "se réinitialise dans {m} min", "wird in {m} min zurückgesetzt"),
  // permission cards and notes
  "Permitir": e("Allow", "Permitir", "Autoriser", "Erlauben"),
  "Denegar": e("Deny", "Negar", "Refuser", "Ablehnen"),
  "(sin texto)": e("(no text)", "(sem texto)", "(pas de texte)", "(kein Text)"),
  "Copiar": e("Copy", "Copiar", "Copier", "Kopieren"),
  "Abrir en Obsidian": e("Open in Obsidian", "Abrir no Obsidian", "Ouvrir dans Obsidian", "In Obsidian öffnen"),
  "Cerrar": e("Close", "Fechar", "Fermer", "Schließen"),
  // tasks tab
  "Tareas para Claude": e("Tasks for Claude", "Tarefas para o Claude", "Tâches pour Claude", "Aufgaben für Claude"),
  "Pídele algo a Claude… (Enter envía)": e("Ask Claude something… (Enter sends)", "Peça algo ao Claude… (Enter envia)", "Demandez quelque chose à Claude… (Entrée envoie)", "Bitte Claude um etwas… (Enter sendet)"),
  "Carpeta de trabajo (vacío = tu carpeta de usuario)": e("Working folder (empty = your user folder)", "Pasta de trabalho (vazio = sua pasta de usuário)", "Dossier de travail (vide = votre dossier utilisateur)", "Arbeitsordner (leer = dein Benutzerordner)"),
  "Enviar": e("Send", "Enviar", "Envoyer", "Senden"),
  "Parar": e("Stop", "Parar", "Arrêter", "Stopp"),
  "Ver": e("View", "Ver", "Voir", "Ansehen"),
  "Aún no hay tareas. Escribe una arriba.": e("No tasks yet. Write one above.", "Ainda não há tarefas. Escreva uma acima.", "Pas encore de tâches. Écrivez-en une ci-dessus.", "Noch keine Aufgaben. Schreib oben eine."),
  "Empezando…": e("Starting…", "Começando…", "Démarrage…", "Startet…"),
  "Cancelada": e("Cancelled", "Cancelada", "Annulée", "Abgebrochen"),
  "Respuesta escrita en tu nota": e("Answer written to your note", "Resposta escrita na sua nota", "Réponse écrite dans votre note", "Antwort in deine Notiz geschrieben"),
  // sessions tab
  "Para ver tus sesiones de Claude Code y aprobar permisos desde aquí, conecta los hooks (se añaden a ~/.claude/settings.json con copia de seguridad).": e(
    "To see your Claude Code sessions and approve permissions from here, connect the hooks (added to ~/.claude/settings.json with a backup).",
    "Para ver suas sessões do Claude Code e aprovar permissões daqui, conecte os hooks (adicionados a ~/.claude/settings.json com backup).",
    "Pour voir vos sessions Claude Code et approuver les autorisations d'ici, connectez les hooks (ajoutés à ~/.claude/settings.json avec une sauvegarde).",
    "Um deine Claude-Code-Sitzungen zu sehen und Berechtigungen von hier zu bestätigen, verbinde die Hooks (werden mit Sicherung in ~/.claude/settings.json eingetragen).",
  ),
  "Conectar con Claude Code": e("Connect to Claude Code", "Conectar ao Claude Code", "Connecter à Claude Code", "Mit Claude Code verbinden"),
  "sesión": e("session", "sessão", "session", "Sitzung"),
  " · {n} subagentes": e(" · {n} subagents", " · {n} subagentes", " · {n} sous-agents", " · {n} Subagenten"),
  "Traer la terminal al frente (o abrir una nueva)": e("Bring the terminal forward (or open a new one)", "Trazer o terminal para a frente (ou abrir um novo)", "Amener le terminal au premier plan (ou en ouvrir un nouveau)", "Terminal nach vorn holen (oder neues öffnen)"),
  "Terminal": e("Terminal", "Terminal", "Terminal", "Terminal"),
  "No hay sesiones de Claude Code activas.": e("No active Claude Code sessions.", "Não há sessões ativas do Claude Code.", "Aucune session Claude Code active.", "Keine aktiven Claude-Code-Sitzungen."),
  "contexto": e("context", "contexto", "contexte", "Kontext"),
  "Copiar hooks para otra máquina o WSL": e("Copy hooks for another machine or WSL", "Copiar hooks para outra máquina ou WSL", "Copier les hooks pour une autre machine ou WSL", "Hooks für anderen Rechner oder WSL kopieren"),
  "Hooks copiados. Pégalos en ~/.claude/settings.json de la otra máquina (con un túnel SSH -R, o en WSL con red mirrored).": e(
    "Hooks copied. Paste them into ~/.claude/settings.json on the other machine (with an SSH -R tunnel, or in WSL with mirrored networking).",
    "Hooks copiados. Cole-os em ~/.claude/settings.json na outra máquina (com um túnel SSH -R, ou no WSL com rede mirrored).",
    "Hooks copiés. Collez-les dans ~/.claude/settings.json sur l'autre machine (avec un tunnel SSH -R, ou dans WSL avec le réseau mirrored).",
    "Hooks kopiert. Füge sie in ~/.claude/settings.json auf dem anderen Rechner ein (mit SSH-Tunnel -R oder in WSL mit Mirrored-Netzwerk).",
  ),
  // vault tab
  "Conecta tu vault de Obsidian": e("Connect your Obsidian vault", "Conecte seu vault do Obsidian", "Connectez votre coffre Obsidian", "Verbinde deinen Obsidian-Vault"),
  "Cualquier tarea “- [ ] algo #claude” de tus notas se convierte en un encargo para Claude, y la respuesta se escribe bajo la tarea.": e(
    "Any “- [ ] something #claude” task in your notes becomes a job for Claude, and the answer is written under the task.",
    "Qualquer tarefa “- [ ] algo #claude” das suas notas vira um pedido para o Claude, e a resposta é escrita abaixo da tarefa.",
    "Toute tâche « - [ ] quelque chose #claude » de vos notes devient une demande pour Claude, et la réponse est écrite sous la tâche.",
    "Jede Aufgabe „- [ ] etwas #claude“ in deinen Notizen wird zu einem Auftrag für Claude, und die Antwort steht unter der Aufgabe.",
  ),
  "Usar": e("Use", "Usar", "Utiliser", "Verwenden"),
  "Añadir tarea a la bandeja de Obsidian": e("Add a task to the Obsidian inbox", "Adicionar tarefa à caixa de entrada do Obsidian", "Ajouter une tâche à la boîte de réception Obsidian", "Aufgabe zum Obsidian-Eingang hinzufügen"),
  "Vault: {name}": e("Vault: {name}", "Vault: {name}", "Coffre : {name}", "Vault: {name}"),
  "Añadir": e("Add", "Adicionar", "Ajouter", "Hinzufügen"),
  "Ejecutar con Claude": e("Run with Claude", "Executar com o Claude", "Exécuter avec Claude", "Mit Claude ausführen"),
  "Sin tareas. Escribe “- [ ] algo #claude” en cualquier nota.": e(
    "No tasks. Write “- [ ] something #claude” in any note.",
    "Sem tarefas. Escreva “- [ ] algo #claude” em qualquer nota.",
    "Aucune tâche. Écrivez « - [ ] quelque chose #claude » dans une note.",
    "Keine Aufgaben. Schreib „- [ ] etwas #claude“ in eine beliebige Notiz.",
  ),
  "…y {n} más": e("…and {n} more", "…e mais {n}", "…et {n} de plus", "…und {n} weitere"),
  // settings tab
  "Personaje": e("Character", "Personagem", "Personnage", "Figur"),
  "Modo mini": e("Mini mode", "Modo mini", "Mode mini", "Mini-Modus"),
  "Se asoma por el borde derecho de la pantalla. También: doble clic sobre el personaje.": e(
    "Peeks out from the right screen edge. Also: double-click the character.",
    "Aparece na borda direita da tela. Também: clique duplo no personagem.",
    "Se glisse au bord droit de l'écran. Aussi : double-clic sur le personnage.",
    "Schaut am rechten Bildschirmrand heraus. Auch: Doppelklick auf die Figur.",
  ),
  "Permitir que Claude edite archivos": e("Let Claude edit files", "Permitir que o Claude edite arquivos", "Autoriser Claude à modifier des fichiers", "Claude Dateien bearbeiten lassen"),
  "Tareas lanzadas desde aquí usan acceptEdits.": e("Tasks started from here use acceptEdits.", "Tarefas iniciadas daqui usam acceptEdits.", "Les tâches lancées d'ici utilisent acceptEdits.", "Von hier gestartete Aufgaben nutzen acceptEdits."),
  "Aprobar permisos automáticamente": e("Approve permissions automatically", "Aprovar permissões automaticamente", "Approuver automatiquement les autorisations", "Berechtigungen automatisch bestätigen"),
  "⚠ Responde “Permitir” a todo sin preguntar.": e("⚠ Answers “Allow” to everything without asking.", "⚠ Responde “Permitir” a tudo sem perguntar.", "⚠ Répond « Autoriser » à tout sans demander.", "⚠ Antwortet auf alles mit „Erlauben“, ohne zu fragen."),
  "Vault de Obsidian": e("Obsidian vault", "Vault do Obsidian", "Coffre Obsidian", "Obsidian-Vault"),
  "Carpeta de tu vault de Obsidian": e("Your Obsidian vault folder", "Pasta do seu vault do Obsidian", "Dossier de votre coffre Obsidian", "Ordner deines Obsidian-Vaults"),
  "🟢 Hooks de Claude Code conectados": e("🟢 Claude Code hooks connected", "🟢 Hooks do Claude Code conectados", "🟢 Hooks Claude Code connectés", "🟢 Claude-Code-Hooks verbunden"),
  "⚪ Hooks sin conectar": e("⚪ Hooks not connected", "⚪ Hooks não conectados", "⚪ Hooks non connectés", "⚪ Hooks nicht verbunden"),
  "Quitar": e("Remove", "Remover", "Retirer", "Entfernen"),
  "Conectar": e("Connect", "Conectar", "Connecter", "Verbinden"),
  "Aprobar desde Telegram (opcional)": e("Approve from Telegram (optional)", "Aprovar pelo Telegram (opcional)", "Approuver depuis Telegram (facultatif)", "Über Telegram bestätigen (optional)"),
  "Token del bot (de @BotFather)": e("Bot token (from @BotFather)", "Token do bot (do @BotFather)", "Jeton du bot (de @BotFather)", "Bot-Token (von @BotFather)"),
  "ID de tu chat": e("Your chat ID", "ID do seu chat", "ID de votre conversation", "Deine Chat-ID"),
  "Avisos en Slack / Feishu (solo notificaciones)": e("Slack / Feishu alerts (notifications only)", "Avisos no Slack / Feishu (somente notificações)", "Alertes Slack / Feishu (notifications seulement)", "Slack-/Feishu-Hinweise (nur Benachrichtigungen)"),
  "URL del webhook de Slack": e("Slack webhook URL", "URL do webhook do Slack", "URL du webhook Slack", "Slack-Webhook-URL"),
  "URL del webhook de Feishu/Lark": e("Feishu/Lark webhook URL", "URL do webhook do Feishu/Lark", "URL du webhook Feishu/Lark", "Feishu/Lark-Webhook-URL"),
  "Vista del móvil (solo lectura)": e("Phone view (read-only)", "Visualização no celular (somente leitura)", "Vue mobile (lecture seule)", "Handy-Ansicht (nur lesen)"),
  "Sirve tus sesiones en la red local con un enlace secreto. Sin cifrar: úsalo solo en una red de confianza.": e(
    "Serves your sessions on the local network with a secret link. Unencrypted: use it only on a trusted network.",
    "Serve suas sessões na rede local com um link secreto. Sem criptografia: use apenas em uma rede confiável.",
    "Sert vos sessions sur le réseau local avec un lien secret. Non chiffré : à utiliser uniquement sur un réseau de confiance.",
    "Stellt deine Sitzungen im lokalen Netz mit einem geheimen Link bereit. Unverschlüsselt: nur in einem vertrauenswürdigen Netz nutzen.",
  ),
  "Abre en el móvil (misma red): {url}": e("Open on your phone (same network): {url}", "Abra no celular (mesma rede): {url}", "Ouvrez sur votre mobile (même réseau) : {url}", "Auf dem Handy öffnen (gleiches Netz): {url}"),
  "Atajos globales: Ctrl+Alt+Y permitir · Ctrl+Alt+N denegar": e(
    "Global shortcuts: Ctrl+Alt+Y allow · Ctrl+Alt+N deny",
    "Atalhos globais: Ctrl+Alt+Y permitir · Ctrl+Alt+N negar",
    "Raccourcis globaux : Ctrl+Alt+Y autoriser · Ctrl+Alt+N refuser",
    "Globale Kürzel: Strg+Alt+Y erlauben · Strg+Alt+N ablehnen",
  ),
  "Idioma": e("Language", "Idioma", "Langue", "Sprache"),
  "Aspecto": e("Look", "Aparência", "Apparence", "Aussehen"),
  "Actividad": e("Activity", "Atividade", "Activité", "Aktivität"),
  "Conexiones": e("Connections", "Conexões", "Connexions", "Verbindungen"),
  "Conexión": e("Connection", "Conexão", "Connexion", "Verbindung"),
  "Permisos y edición": e("Permissions and editing", "Permissões e edição", "Autorisations et édition", "Berechtigungen und Bearbeitung"),
  "Importar y temas": e("Import and themes", "Importar e temas", "Import et thèmes", "Import und Themes"),
  "Hiperactividad": e("Hyperactivity", "Hiperatividade", "Hyperactivité", "Hyperaktivität"),
  "Cuánto se mueve tu mascota por la pantalla. Más hiperactivo, más anda y hace cosas; más tranquilo, más rato pasa quieto y durmiendo.": e(
    "How much your pet moves around the screen. More hyper: it walks and does more things; calmer: it spends more time still and asleep.",
    "Quanto seu pet se mexe pela tela. Mais hiperativo, mais anda e faz coisas; mais tranquilo, mais tempo fica parado e dormindo.",
    "Combien votre mascotte bouge à l'écran. Plus hyperactive, plus elle marche et fait des choses ; plus calme, plus elle reste immobile et dort.",
    "Wie viel sich dein Haustier über den Bildschirm bewegt. Hyperaktiver: läuft und tut mehr; ruhiger: bleibt länger still und schläft.",
  ),
  "Tranquilo": e("Calm", "Tranquilo", "Calme", "Ruhig"),
  "Hiperactivo": e("Hyperactive", "Hiperativo", "Hyperactif", "Hyperaktiv"),
  "😴 Dormilón: pasa casi todo el rato quieto o durmiendo": e(
    "😴 Sleepyhead: spends almost all the time still or asleep",
    "😴 Dorminhoco: passa quase o tempo todo parado ou dormindo",
    "😴 Dormeur : passe presque tout son temps immobile ou endormi",
    "😴 Schlafmütze: ist fast immer still oder schläft",
  ),
  "😌 Tranquilo: se mueve poco y duerme bastante": e(
    "😌 Calm: moves little and sleeps a lot",
    "😌 Tranquilo: se mexe pouco e dorme bastante",
    "😌 Calme : bouge peu et dort beaucoup",
    "😌 Ruhig: bewegt sich wenig und schläft viel",
  ),
  "🙂 Normal": e("🙂 Normal", "🙂 Normal", "🙂 Normal", "🙂 Normal"),
  "😄 Activo: anda y hace cosas a menudo": e(
    "😄 Active: walks and does things often",
    "😄 Ativo: anda e faz coisas com frequência",
    "😄 Actif : marche et fait des choses souvent",
    "😄 Aktiv: läuft und tut oft etwas",
  ),
  "🤪 Hiperactivo: no para quieto ni un segundo": e(
    "🤪 Hyperactive: never stays still for a second",
    "🤪 Hiperativo: não para quieto nem um segundo",
    "🤪 Hyperactif : ne reste pas en place une seconde",
    "🤪 Hyperaktiv: bleibt keine Sekunde still",
  ),
  "Automático": e("Automatic", "Automático", "Automatique", "Automatisch"),
  "Importar un Codex Pet (carpeta con pet.json)": e("Import a Codex Pet (folder with pet.json)", "Importar um Codex Pet (pasta com pet.json)", "Importer un Codex Pet (dossier avec pet.json)", "Codex Pet importieren (Ordner mit pet.json)"),
  "Ruta de la carpeta del pet": e("Pet folder path", "Caminho da pasta do pet", "Chemin du dossier du pet", "Pfad zum Pet-Ordner"),
  "Importar": e("Import", "Importar", "Importer", "Importieren"),
  "Instalar un tema desde una URL (JSON de paleta)": e("Install a theme from a URL (palette JSON)", "Instalar um tema de uma URL (JSON de paleta)", "Installer un thème depuis une URL (JSON de palette)", "Theme von einer URL installieren (Paletten-JSON)"),
  "https://…/tema.json": e("https://…/theme.json", "https://…/tema.json", "https://…/theme.json", "https://…/theme.json"),
  "Instalar": e("Install", "Instalar", "Installer", "Installieren"),
  "Pet importado: {name}": e("Pet imported: {name}", "Pet importado: {name}", "Pet importé : {name}", "Pet importiert: {name}"),
  "Tema instalado: {name}": e("Theme installed: {name}", "Tema instalado: {name}", "Thème installé : {name}", "Theme installiert: {name}"),
  "Conectado. Reinicia las sesiones de Claude Code abiertas para que lo noten.": e(
    "Connected. Restart any open Claude Code sessions so they pick it up.",
    "Conectado. Reinicie as sessões abertas do Claude Code para que o notem.",
    "Connecté. Redémarrez les sessions Claude Code ouvertes pour qu'elles en tiennent compte.",
    "Verbunden. Starte offene Claude-Code-Sitzungen neu, damit sie es bemerken.",
  ),
  // bubbles
  "¡Hola! Estoy atento.": e("Hi! I'm watching.", "Olá! Estou de olho.", "Salut ! Je veille.", "Hallo! Ich passe auf."),
  "¡Hola! Pásame el ratón por encima 👋": e("Hi! Hover over me 👋", "Olá! Passe o mouse por cima 👋", "Salut ! Passez la souris sur moi 👋", "Hallo! Fahr mit der Maus über mich 👋"),
  "¡Ay!": e("Ouch!", "Ai!", "Aïe !", "Aua!"),
  "Uy, algo falló…": e("Oops, something failed…", "Ops, algo falhou…", "Oups, quelque chose a échoué…", "Ups, etwas ist schiefgelaufen…"),
  "✔ ¡Listo!": e("✔ Done!", "✔ Pronto!", "✔ Terminé !", "✔ Fertig!"),
  "Claude te necesita ✋": e("Claude needs you ✋", "O Claude precisa de você ✋", "Claude a besoin de vous ✋", "Claude braucht dich ✋"),
  "¿Puedo usar {tool}?": e("May I use {tool}?", "Posso usar {tool}?", "Puis-je utiliser {tool} ?", "Darf ich {tool} benutzen?"),
  "Tarea cancelada": e("Task cancelled", "Tarefa cancelada", "Tâche annulée", "Aufgabe abgebrochen"),
  "✔ Anotado en tu nota de Obsidian": e("✔ Written in your Obsidian note", "✔ Anotado na sua nota do Obsidian", "✔ Noté dans votre note Obsidian", "✔ In deine Obsidian-Notiz eingetragen"),
  "✔ Tarea terminada. Pulsa para verla.": e("✔ Task finished. Click to see it.", "✔ Tarefa concluída. Clique para ver.", "✔ Tâche terminée. Cliquez pour la voir.", "✔ Aufgabe fertig. Klicken zum Ansehen."),
  "La tarea falló": e("The task failed", "A tarefa falhou", "La tâche a échoué", "Die Aufgabe ist fehlgeschlagen"),
  "📓 {n} tarea(s) #claude en tu vault": e("📓 {n} #claude task(s) in your vault", "📓 {n} tarefa(s) #claude no seu vault", "📓 {n} tâche(s) #claude dans votre coffre", "📓 {n} #claude-Aufgabe(n) in deinem Vault"),
  "No pude abrir el puerto de hooks: {msg}": e("Could not open the hooks port: {msg}", "Não consegui abrir a porta dos hooks: {msg}", "Impossible d'ouvrir le port des hooks : {msg}", "Hooks-Port konnte nicht geöffnet werden: {msg}"),
};

// ---- things the character says -----------------------------------------------------------
// Each situation has a pool of lines (es, en, pt, fr, de); one is picked at random so it
// does not repeat itself. They are added to DICT, so `t()` translates them like the rest.

type Line = [string, string, string, string, string];

const POOLS = {
  bump: [
    ["¡Ay!", "Ouch!", "Ai!", "Aïe !", "Aua!"],
    ["¡Au!", "Ow!", "Au!", "Ouille !", "Autsch!"],
    ["¡Uf!", "Oof!", "Uf!", "Ouf !", "Uff!"],
    ["¡Eso dolió!", "That hurt!", "Isso doeu!", "Ça fait mal !", "Das tat weh!"],
    ["¡Cuidado!", "Careful!", "Cuidado!", "Attention !", "Vorsicht!"],
    ["Eso no estaba en el manual", "That wasn't in the manual", "Isso não estava no manual", "Ce n'était pas dans le manuel", "Das stand nicht im Handbuch"],
  ],
  bigbump: [
    ["¡Ay, qué golpe!", "Ouch, that hurt!", "Ai, que pancada!", "Aïe, quel choc !", "Aua, das tat weh!"],
    ["¡Mi cabeza!", "My head!", "Minha cabeça!", "Ma tête !", "Mein Kopf!"],
    ["¡Veo estrellitas!", "I see stars!", "Vejo estrelinhas!", "Je vois des étoiles !", "Ich sehe Sterne!"],
    ["¡Qué bruto!", "How rough!", "Que brutal!", "Quelle brute !", "Wie grob!"],
    ["Ouch… eso sí que dolió", "Ouch… that really hurt", "Ai… isso doeu mesmo", "Aïe… ça a vraiment fait mal", "Autsch… das tat richtig weh"],
    ["Si lo hubiera sabido, me quedo en la cama", "If I'd known, I'd have stayed in bed", "Se eu soubesse, tinha ficado na cama", "Si j'avais su, je serais resté au lit", "Hätte ich das gewusst, wäre ich im Bett geblieben"],
    ["Esto no venía en mi contrato", "This wasn't in my contract", "Isso não estava no meu contrato", "Ce n'était pas dans mon contrat", "Das stand nicht in meinem Vertrag"],
    ["Anotado: el suelo duele", "Noted: the floor hurts", "Anotado: o chão dói", "Noté : le sol, ça fait mal", "Notiert: Der Boden tut weh"],
    ["Reclamación al suelo en trámite", "Complaint against the floor filed", "Reclamação contra o chão registrada", "Réclamation contre le sol en cours", "Beschwerde gegen den Boden eingereicht"],
  ],
  slap: [
    ["¡Eh!", "Hey!", "Ei!", "Hé !", "Hey!"],
    ["¡Ay, mi mejilla!", "Ow, my cheek!", "Ai, minha bochecha!", "Aïe, ma joue !", "Aua, meine Wange!"],
    ["¿Qué te pasa?", "What's your problem?", "Qual é o seu problema?", "Qu'est-ce qui te prend ?", "Was ist los mit dir?"],
    ["¡Eso escuece!", "That stings!", "Isso arde!", "Ça pique !", "Das brennt!"],
    ["¡Para ya!", "Stop it!", "Para com isso!", "Arrête !", "Hör auf!"],
    ["¿Y esto por qué?", "What was that for?", "Isso foi por quê?", "C'était pour quoi ?", "Wofür war das?"],
    ["Esto no estaba en la descripción del puesto", "That wasn't in the job description", "Isso não estava na descrição do cargo", "Ce n'était pas dans la fiche de poste", "Das stand nicht in der Stellenbeschreibung"],
    ["Pienso pedir una indemnización", "I'm demanding compensation", "Vou pedir indenização", "Je vais demander une indemnisation", "Ich verlange Schadenersatz"],
    ["¡Eso va a mi expediente!", "That's going on my record!", "Isso vai para o meu histórico!", "Ça va dans mon dossier !", "Das kommt in meine Akte!"],
  ],
  angry: [
    ["¡Oye!", "Hey, stop that!", "Ei, para com isso!", "Hé, arrête !", "Hey, lass das!"],
    ["¡Se acabó!", "That's it!", "Chega!", "Ça suffit !", "Jetzt reicht's!"],
    ["¡Ya vale!", "Enough already!", "Já chega!", "Ça suffit comme ça !", "Genug jetzt!"],
    ["¡Voy a llamar a Recursos Humanos!", "I'm calling HR!", "Vou chamar o RH!", "J'appelle les RH !", "Ich rufe die Personalabteilung!"],
    ["Me quejo al jefe…", "I'm telling the boss…", "Vou reclamar ao chefe…", "Je vais me plaindre au patron…", "Ich sag's dem Chef…"],
    ["Se lo cuento a Claude", "I'm telling Claude", "Vou contar ao Claude", "Je le dis à Claude", "Ich sag's Claude"],
    ["Voy a dejar una reseña de una estrella", "I'm leaving a one-star review", "Vou deixar uma avaliação de uma estrela", "Je laisse un avis une étoile", "Ich gebe nur einen Stern"],
    ["¡Exijo hablar con tu gerente!", "I demand to speak to your manager!", "Exijo falar com o seu gerente!", "J'exige de parler à ton responsable !", "Ich verlange deinen Vorgesetzten!"],
  ],
  startle: [
    ["¡Ah!", "Ah!", "Ah!", "Ah !", "Ah!"],
    ["¡Uy!", "Whoa!", "Uau!", "Oh !", "Huch!"],
    ["¡Qué susto!", "What a scare!", "Que susto!", "Quelle frayeur !", "Was für ein Schreck!"],
    ["¡Madre mía!", "Good grief!", "Meu Deus!", "Mon Dieu !", "Du meine Güte!"],
    ["¡Casi me das!", "You almost hit me!", "Quase me acertou!", "Tu as failli me toucher !", "Fast hättest du mich getroffen!"],
    ["¡Casi me da un cortocircuito!", "I nearly short-circuited!", "Quase deu curto-circuito!", "J'ai failli faire un court-circuit !", "Fast hätte ich einen Kurzschluss gehabt!"],
    ["¡Mi seguro no cubre esto!", "My insurance doesn't cover this!", "Meu seguro não cobre isso!", "Mon assurance ne couvre pas ça !", "Das deckt meine Versicherung nicht!"],
  ],
  cover: [
    ["¡No miro!", "I'm not looking!", "Não estou olhando!", "Je ne regarde pas !", "Ich guck nicht hin!"],
    ["¡No veo nada!", "I can't see anything!", "Não vejo nada!", "Je ne vois rien !", "Ich sehe nichts!"],
    ["Shhh… no pasa nada", "Shh… it's fine", "Shh… não é nada", "Chut… tout va bien", "Psst… alles gut"],
  ],
  sneeze: [
    ["¡Achís!", "Achoo!", "Atchim!", "Atchoum !", "Hatschi!"],
    ["¡Atchúm!", "Ah-choo!", "Atchim!", "Atchoum !", "Hatschu!"],
    ["¡Achús! Perdón", "Achoo! Sorry", "Atchim! Desculpa", "Atchoum ! Pardon", "Hatschi! Entschuldigung"],
    ["¡Uf, qué alergia!", "Ugh, allergies!", "Ufa, que alergia!", "Ouf, quelle allergie !", "Uff, diese Allergie!"],
    ["Seguro que alguien habla de mí", "Someone must be talking about me", "Alguém deve estar falando de mim", "Quelqu'un doit parler de moi", "Bestimmt redet jemand über mich"],
  ],
  wake: [
    ["¿Sigues ahí?", "Still there?", "Ainda está aí?", "Toujours là ?", "Noch da?"],
    ["¡Estoy despierto!", "I'm awake!", "Estou acordado!", "Je suis réveillé !", "Ich bin wach!"],
    ["¡No dormía!", "I wasn't sleeping!", "Eu não estava dormindo!", "Je ne dormais pas !", "Ich habe nicht geschlafen!"],
    ["¿Qué decías?", "What were you saying?", "O que você dizia?", "Tu disais ?", "Was sagtest du?"],
    ["¿Eh? ¿Qué pasó?", "Huh? What happened?", "Hã? O que houve?", "Hein ? Qu'est-ce qui s'est passé ?", "Hä? Was ist passiert?"],
    ["Estaba haciendo una pausa activa", "I was on an active break", "Eu estava em uma pausa ativa", "J'étais en pause active", "Ich habe eine aktive Pause gemacht"],
    ["Solo descansaba la vista", "I was just resting my eyes", "Só estava descansando a vista", "Je reposais juste mes yeux", "Ich habe nur die Augen ausgeruht"],
  ],
  munch: [
    ["¡Ñam!", "Yum!", "Nham!", "Miam !", "Mjam!"],
    ["¡Qué rico!", "Delicious!", "Que delícia!", "Délicieux !", "Lecker!"],
    ["Crujiente…", "Crunchy…", "Crocante…", "Croustillant…", "Knusprig…"],
    ["¡Proteína gratis!", "Free protein!", "Proteína grátis!", "Protéines gratuites !", "Gratis Protein!"],
    ["Otra, por favor", "Another one, please", "Outra, por favor", "Une autre, s'il vous plaît", "Noch eine, bitte"],
    ["Mosca ecológica y de proximidad", "Organic, locally sourced fly", "Mosca orgânica e local", "Mouche bio et locale", "Bio-Fliege aus der Region"],
  ],
  croak: [
    ["¡Croac!", "Ribbit!", "Coaxa!", "Coâ !", "Quak!"],
    ["¡Croac, croac!", "Ribbit, ribbit!", "Coaxa, coaxa!", "Coâ, coâ !", "Quak, quak!"],
    ["¡Croaaac!", "Ribbiiit!", "Coaaaxa!", "Coââ !", "Quaaak!"],
    ["Croac… ¿alguien me oye?", "Ribbit… anyone there?", "Coaxa… alguém aí?", "Coâ… quelqu'un ?", "Quak… ist da wer?"],
  ],
  pet: [
    ["¡Qué agradable!", "How nice!", "Que agradável!", "Que c'est agréable !", "Wie schön!"],
    ["Mmm… sigue", "Mmm… keep going", "Mmm… continua", "Mmm… continue", "Mmm… weiter so"],
    ["¡Más, por favor!", "More, please!", "Mais, por favor!", "Encore, s'il vous plaît !", "Mehr, bitte!"],
    ["¡Me gusta!", "I like it!", "Eu gosto!", "J'aime ça !", "Das gefällt mir!"],
    ["Prrr…", "Purr…", "Prrr…", "Prrr…", "Schnurr…"],
    ["Esto sí que es un buen beneficio", "Now that's a good perk", "Isso sim é um bom benefício", "Ça, c'est un bon avantage", "Das ist mal ein guter Bonus"],
  ],
  yawn: [
    ["¡Uaaah! Qué sueño", "Yaaawn! So sleepy", "Uaaah! Que sono", "Aaah ! Quel sommeil", "Gähn! So müde"],
    ["Cinco minutitos más…", "Five more minutes…", "Mais cinco minutinhos…", "Encore cinq minutes…", "Noch fünf Minuten…"],
    ["Necesito un café", "I need a coffee", "Preciso de um café", "Il me faut un café", "Ich brauche einen Kaffee"],
    ["Hora de una reunión que podría ser un email", "Time for a meeting that could've been an email", "Hora de uma reunião que podia ser um e-mail", "L'heure d'une réunion qui aurait pu être un e-mail", "Zeit für ein Meeting, das eine E-Mail hätte sein können"],
  ],
  stretch: [
    ["¡Buenos días!", "Good morning!", "Bom dia!", "Bonjour !", "Guten Morgen!"],
    ["¡Qué bien he dormido!", "What a nap!", "Que bom dormir!", "Quelle bonne sieste !", "Was für ein Nickerchen!"],
    ["A seguir con lo mío", "Back to it", "Vamos em frente", "Allez, on reprend", "Weiter geht's"],
  ],
  idea: [
    ["¡Ya lo tengo!", "Got it!", "Já sei!", "J'ai trouvé !", "Ich hab's!"],
    ["¡Eureka!", "Eureka!", "Eureka!", "Eurêka !", "Heureka!"],
    ["¡Se me ocurre algo!", "I've got an idea!", "Tive uma ideia!", "J'ai une idée !", "Ich habe eine Idee!"],
    ["¡Ajá!", "Aha!", "Aha!", "Aha !", "Aha!"],
    ["Eso lo arreglo con un parche", "I can fix that with a patch", "Isso eu resolvo com um patch", "Ça, je règle ça avec un patch", "Das fixe ich mit einem Patch"],
    ["¡Funciona! No sé por qué, pero funciona", "It works! No idea why, but it works", "Funciona! Não sei por quê, mas funciona", "Ça marche ! Aucune idée pourquoi", "Es funktioniert! Keine Ahnung warum"],
  ],
  scratch: [
    ["Qué picazón…", "So itchy…", "Que coceira…", "Quelle démangeaison…", "Das juckt…"],
    ["¿Tengo algo en la cabeza?", "Is something on my head?", "Tenho algo na cabeça?", "J'ai quelque chose sur la tête ?", "Habe ich etwas auf dem Kopf?"],
    ["Hmm, ¿dónde dejé las llaves?", "Hmm, where did I leave my keys?", "Hmm, onde deixei as chaves?", "Hmm, où ai-je mis mes clés ?", "Hmm, wo sind meine Schlüssel?"],
    ["Creo que me está saliendo un bug", "I think I'm growing a bug", "Acho que estou criando um bug", "Je crois qu'un bug me pousse", "Ich glaube, mir wächst ein Bug"],
  ],
  shake: [
    ["Ya pasó…", "It's over…", "Já passou…", "C'est passé…", "Vorbei…"],
    ["¡Estoy bien!", "I'm fine!", "Estou bem!", "Ça va !", "Mir geht's gut!"],
    ["Nada, un rasguño", "Just a scratch", "Só um arranhão", "Ce n'est qu'une égratignure", "Nur ein Kratzer"],
    ["Aquí no ha pasado nada", "Nothing to see here", "Aqui não aconteceu nada", "Il ne s'est rien passé ici", "Hier ist nichts passiert"],
  ],
  chase: [
    ["¡Voy!", "Coming!", "Já vou!", "J'arrive !", "Ich komme!"],
    ["¡Espérame!", "Wait for me!", "Espere por mim!", "Attends-moi !", "Warte auf mich!"],
    ["¿Jugamos?", "Wanna play?", "Vamos brincar?", "On joue ?", "Spielen wir?"],
  ],
  thrown: [
    ["¡Wiii!", "Wheee!", "Uhuu!", "Youpi !", "Juhuu!"],
    ["¡Yuju!", "Woo-hoo!", "Iuhu!", "Yahou !", "Juhu!"],
    ["¡Aaaah!", "Aaaah!", "Aaaah!", "Aaaah !", "Aaaah!"],
    ["¡Vooooy!", "Here I gooo!", "Lá vou euuu!", "J'y vaaais !", "Ich fliiiege!"],
    ["Si lo hubiera sabido, traigo paracaídas", "If I'd known, I'd have brought a parachute", "Se eu soubesse, trazia paraquedas", "Si j'avais su, j'aurais pris un parachute", "Hätte ich das gewusst, hätte ich einen Fallschirm mitgebracht"],
    ["¡Que alguien avise al control aéreo!", "Somebody call air traffic control!", "Alguém avise o controle de tráfego aéreo!", "Prévenez la tour de contrôle !", "Jemand soll die Flugsicherung rufen!"],
  ],
  quip: [
    ["Funciona en mi máquina", "Works on my machine", "Funciona na minha máquina", "Ça marche sur ma machine", "Läuft auf meinem Rechner"],
    ["¿Has probado a apagarlo y encenderlo?", "Have you tried turning it off and on again?", "Já tentou desligar e ligar de novo?", "Tu as essayé de l'éteindre et de le rallumer ?", "Schon mal aus- und wieder eingeschaltet?"],
    ["No es un bug, es una feature", "It's not a bug, it's a feature", "Não é um bug, é uma feature", "Ce n'est pas un bug, c'est une fonctionnalité", "Das ist kein Bug, das ist ein Feature"],
    ["Los viernes no se despliega", "No deploys on Fridays", "Sexta-feira não se faz deploy", "Pas de déploiement le vendredi", "Freitags wird nicht deployed"],
    ["TODO: tomar un descanso", "TODO: take a break", "TODO: fazer uma pausa", "TODO : faire une pause", "TODO: Pause machen"],
    ["Un commit más y me voy a casa", "One more commit and I'm going home", "Mais um commit e vou para casa", "Un dernier commit et je rentre", "Noch ein Commit, dann gehe ich heim"],
    ["Vivo en tu escritorio y no pago alquiler", "I live on your desktop and pay no rent", "Moro na sua área de trabalho e não pago aluguel", "Je vis sur ton bureau sans payer de loyer", "Ich wohne auf deinem Desktop, mietfrei"],
    ["Mi sueño es ser un emoji", "My dream is to become an emoji", "Meu sonho é virar um emoji", "Mon rêve, c'est de devenir un emoji", "Mein Traum ist es, ein Emoji zu werden"],
    ["¿Alguien ha dicho café?", "Did somebody say coffee?", "Alguém disse café?", "Quelqu'un a dit café ?", "Hat jemand Kaffee gesagt?"],
    ["Hoy me siento muy productivo (no)", "Feeling super productive today (not)", "Hoje estou muito produtivo (nem)", "Je me sens très productif aujourd'hui (non)", "Heute fühle ich mich sehr produktiv (nicht)"],
    ["Llevo horas aquí y ni un ascenso", "Hours here and no promotion yet", "Estou aqui há horas e nada de promoção", "Ça fait des heures que je suis là, toujours pas de promotion", "Seit Stunden hier und keine Beförderung"],
    ["Ctrl+Z para la vida, por favor", "Ctrl+Z for life, please", "Ctrl+Z para a vida, por favor", "Ctrl+Z pour la vie, s'il vous plaît", "Strg+Z für das Leben, bitte"],
  ],
  quipPostie: [
    ["Soy una nota adhesiva con aspiraciones", "I'm a sticky note with ambitions", "Sou um post-it com aspirações", "Je suis un post-it avec de l'ambition", "Ich bin ein Haftzettel mit Ambitionen"],
    ["Recuérdame que no olvide nada", "Remind me not to forget anything", "Lembre-me de não esquecer nada", "Rappelle-moi de ne rien oublier", "Erinnere mich daran, nichts zu vergessen"],
    ["No me pegues en el monitor, por favor", "Please don't stick me on the monitor", "Por favor, não me cole no monitor", "Ne me colle pas sur l'écran, s'il te plaît", "Kleb mich bitte nicht an den Monitor"],
  ],
  quipFrog: [
    ["Cada croac cuenta", "Every ribbit counts", "Cada coaxo conta", "Chaque coâ compte", "Jedes Quaken zählt"],
    ["Traje sin pantalones: la nueva moda corporativa", "Suit, no trousers: the new corporate fashion", "Terno sem calça: a nova moda corporativa", "Costume sans pantalon : la nouvelle mode d'entreprise", "Anzug ohne Hose: die neue Business-Mode"],
    ["Las videollamadas son mi hábitat natural", "Video calls are my natural habitat", "Videochamadas são meu habitat natural", "Les visios sont mon habitat naturel", "Videocalls sind mein natürlicher Lebensraum"],
    ["Saltar de nenúfar en nenúfar es como cambiar de pestaña", "Hopping lily pad to lily pad is like switching tabs", "Pular de vitória-régia em vitória-régia é como trocar de aba", "Sauter de nénuphar en nénuphar, c'est comme changer d'onglet", "Von Seerose zu Seerose springen ist wie Tabs wechseln"],
  ],
  quipDuck: [
    ["Cuac. Perdón, quería decir «sinergia»", "Quack. Sorry, I meant “synergy”", "Quack. Desculpe, queria dizer «sinergia»", "Coin-coin. Pardon, je voulais dire « synergie »", "Quak. Verzeihung, ich meinte „Synergie“"],
    ["Me sienta bien el traje, pero sigo sin pantalones", "The suit fits, but I still have no trousers", "O terno serve, mas continuo sem calça", "Le costume me va bien, mais toujours pas de pantalon", "Der Anzug passt, aber Hose habe ich immer noch keine"],
    ["Por fuera elegante, por dentro patalear sin parar", "Elegant on top, paddling like mad underneath", "Elegante por cima, remando sem parar por baixo", "Élégant au-dessus, je pédale comme un fou en dessous", "Oben elegant, unten wild am Paddeln"],
    ["A los patos no se nos moja la reunión", "Meetings just roll off a duck's back", "Reunião não molha pato", "Les réunions glissent sur moi comme l'eau sur les plumes", "Meetings perlen an mir ab wie Wasser"],
  ],
} satisfies Record<string, Line[]>;

export type PhraseKind = keyof typeof POOLS;

for (const lines of Object.values(POOLS)) {
  for (const [es, en, pt, fr, de] of lines as Line[]) DICT[es] = e(en, pt, fr, de);
}

/** A random line for the situation, in Spanish (the key); pass it through `t()` to translate. */
export function phrase(kind: PhraseKind): string {
  const lines = POOLS[kind] as Line[];
  return lines[Math.floor(Math.random() * lines.length)][0];
}

let current: Lang = "es";

export function isLang(value: string): value is Lang {
  return value in LANGS;
}

/** Resolves the saved preference ("auto" or a language code) against the system language. */
export function resolveLang(preference: string, systemLanguages: readonly string[] = []): Lang {
  if (isLang(preference)) return preference;
  for (const tag of systemLanguages) {
    const code = tag.toLowerCase().split("-")[0];
    if (isLang(code)) return code;
  }
  return "en";
}

export function setLang(lang: Lang): void {
  current = lang;
}

export function getLang(): Lang {
  return current;
}

/** Translates `es` (the Spanish text) and fills `{placeholders}`. */
export function t(es: string, vars: Record<string, string | number> = {}): string {
  const text = current === "es" ? es : (DICT[es]?.[current] ?? es);
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}
