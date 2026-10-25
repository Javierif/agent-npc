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
  "Cerrar (Esc)": e("Close (Esc)", "Fechar (Esc)", "Fermer (Échap)", "Schließen (Esc)"),
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
