# Saga

Persoonlijke takenplanner van Céline: lessen en taken in schuifbare blokken over 30 dagen, op gsm en computer, met een overzicht van waar de tijd naartoe gaat.

- **Ontwerp:** [docs/ONTWERP.md](docs/ONTWERP.md)
- **Installatie:** [docs/INSTALLATIE.md](docs/INSTALLATIE.md)

## Opbouw

| map / bestand | inhoud |
|---|---|
| `index.html`, `css/`, `js/` | de webapp (geen build-stap nodig) |
| `js/model.js` | datamodel en rekenregels (deadlines, werkdagen, waarschuwingen, samenvoegen) |
| `js/store.js` | bewaren op het toestel en synchroniseren |
| `js/app.js` | opstart, navigatie en acties |
| `js/ui.js` | gedeelde toestand van de schermen, filter, melding met "Ongedaan maken" |
| `js/weergave.js` | bouwstenen van de schermen (kaarten, lijstjes) |
| `js/views/` | de schermen: vandaag, overzicht, school, klas, opleiding, tijd, instellingen |
| `js/dialogen.js` | vensters om taken, lessen, opdrachten, … te bewerken |
| `sw.js`, `manifest.webmanifest`, `icons/` | installeerbaar als app, werkt offline |
| `apps-script/Code.gs` | opslag op Google Drive via Google Apps Script |
| `tests/` | tests van de rekenregels |

## Lokaal uitproberen

```sh
npm start   # http://localhost:8080
npm test
```
