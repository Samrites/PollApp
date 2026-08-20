# PollApp – finale Korrekturprüfung

Diese Version wurde gegen die bereitgestellten Figma-Screens, beide Mentor-Feedbacks und die PollApp-Checkliste abgeglichen.

## Korrigiert

- Merge-Konflikt-Marker aus `survey-storage.service.ts` entfernt.
- `hint` und `renderVersion` aus den Survey-Interfaces entfernt.
- unnötige Supabase-Relationship-Typdefinition entfernt.
- TypeScript-Dateien liegen unter der 400-Zeilen-Grenze.
- LIVE-Vorschau berücksichtigt die aktuelle Auswahl, ohne sie vor `Complete survey` zu speichern.
- `Complete survey` speichert die Stimme und markiert die Survey lokal als abgeschlossen.
- erneute Abgabe derselben Survey wird über Local Storage verhindert.
- Past Surveys sind für die Abstimmung deaktiviert.
- Publish-Overlay und anschließende Navigation zur erstellten Survey sind vorhanden.
- Home lädt neue Surveys nach Publish nach; Realtime-Updates sind angebunden.
- Active/Past und Kategorie/All-Filter sind vorhanden.
- Ending-soon-Surveys werden nach verbleibenden Tagen sortiert.
- vergangene Enddaten werden verhindert (`min` + TypeScript-Prüfung).
- Kalender-Icon sitzt rechts innerhalb des Date-Inputs.
- Hinweis-/Hilfstexte im Create-Survey-Dialog sind kontrastreicher.
- Hero-Hover wechselt mittig per Opacity, ohne starkes Springen/Skalieren.
- `track $index` wird bei Answer-Resultaten genutzt, damit gleiche Antworttexte keinen NG0955-Duplicate-Key-Fehler auslösen.
- Question-Delete-Verhalten ist vereinheitlicht: zuerst Inhalte leeren; eine leere Frage kann entfernt werden, solange mindestens eine Frage übrig bleibt.
- Single-Survey-Surface nutzt keine feste 100vh-Höhe mehr; die Inhaltsfläche bleibt kompakt.
- FTP/Angular-Deployment ist für `/angular-projects/PollApp/` vorkonfiguriert.
- `.htaccess` für Angular-Routen/Refresh liegt unter `public/.htaccess` und wird in den Build kopiert.

## Vor Abgabe auf Windows kurz testen

1. `npm install`
2. `npm start`
3. `http://localhost:4200/` öffnen.
4. Browser-Console prüfen: keine roten Angular-Fehler.
5. Neue Survey erstellen und publishen.
6. Prüfen, dass die Survey ohne manuellen Refresh erscheint und geöffnet wird.
7. Vor `Complete survey` eine Antwort anklicken: LIVE-Vorschau muss sofort reagieren.
8. Seite verlassen, ohne abzuschließen: es darf keine Stimme gespeichert sein.
9. Danach `Complete survey`: Ergebnis muss gespeichert werden.
10. Neu laden: dieselbe Survey darf im selben Browser nicht erneut abgegeben werden.
11. Past Survey öffnen: Antworten dürfen nicht mehr anklickbar/abgebbar sein.
12. Danach `npm run build` und den Inhalt von `dist/poll-app/browser/` per FileZilla hochladen.
