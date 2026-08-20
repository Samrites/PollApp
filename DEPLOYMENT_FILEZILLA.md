# PollApp Deployment mit FileZilla

## 1. Lokal testen

```bash
npm install
npm start
```

Dann im Browser öffnen: `http://localhost:4200/`.

## 2. Produktions-Build erstellen

Der Build ist für den Server-Unterordner `/angular-projects/PollApp/` konfiguriert.

```bash
npm run build
```

Angular erstellt den fertigen Browser-Build unter `dist/poll-app/browser/`.

## 3. FileZilla

Auf dem FTP-Server den Zielordner `angular-projects/PollApp/` öffnen bzw. anlegen.
Dann **den Inhalt** von `dist/poll-app/browser/` hochladen (nicht den `browser`-Ordner als zusätzliche Ebene).
Dazu gehören mindestens `index.html`, die gebündelten `.js`-/`.css`-Dateien, `assets/` und `.htaccess`.

## 4. Nach dem Upload testen

- Startseite öffnen.
- Eine Single-Survey-Route direkt öffnen und Browser-Refresh drücken.
- New Survey öffnen und veröffentlichen.
- Prüfen, dass die neue Survey ohne manuellen Refresh erscheint.
- Prüfen, dass LIVE Results bei der Auswahl sofort reagieren.
- Prüfen, dass erst `Complete survey` speichert.
- Prüfen, dass dieselbe Survey im selben Browser nicht erneut abgegeben werden kann.
- Past Surveys dürfen nicht mehr abgestimmt werden.

Die `.htaccess` im Build sorgt dafür, dass Angular-Routen beim direkten Aufruf/Refresh auf `index.html` zurückfallen.
