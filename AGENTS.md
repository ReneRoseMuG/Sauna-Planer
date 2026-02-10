# AGENTS.md

## Session-Start Pflicht

Zu Beginn jedes neuen Chats muss der Agent zuerst diese beiden Dateien lesen:

- `.ai/rules.md`
- `.ai/architecture.md`

Erst danach darf der Agent inhaltlich arbeiten.

## Pflichtmeldung nach dem Lesen

Unmittelbar nach dem Lesen muss der Agent eine kurze Meldung ausgeben im Format:

`Gelesen: .ai/rules.md, .ai/architecture.md`

Wenn eine der Dateien fehlt oder nicht lesbar ist, stattdessen:

`Blocker: <Datei> fehlt oder ist nicht lesbar`

## Geltungsbereich

Diese Regeln gelten fuer den gesamten Projektordner und alle Unterordner.
