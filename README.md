# Saga

Persoonlijke takenplanner van Céline: lessen en taken in schuifbare blokken over 30 dagen, op gsm en computer.

- **Ontwerp:** [docs/ONTWERP.md](docs/ONTWERP.md)
- **Installatie:** [docs/INSTALLATIE.md](docs/INSTALLATIE.md)

## Opbouw

| map / bestand | inhoud |
|---|---|
| `index.html`, `css/`, `js/` | de webapp (geen build-stap nodig) |
| `js/model.js` | datamodel en rekenregels (deadlines, werkdagen, waarschuwingen, samenvoegen) |
| `js/store.js` | bewaren op het toestel en synchroniseren |
| `js/app.js` | schermen en interactie |
| `sw.js`, `manifest.webmanifest`, `icons/` | installeerbaar als app, werkt offline |
| `apps-script/Code.gs` | opslag op Google Drive via Google Apps Script |
| `tests/` | tests van de rekenregels |

## Lokaal uitproberen

```sh
npm start   # http://localhost:8080
npm test
```
