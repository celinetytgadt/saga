# Saga – ontwerp

> **Saga** is mijn persoonlijke takenplanner (naast Freya voor financiën). Los van De MET, in eigen huisstijl.
>
> Status: **fase 1 gebouwd** (zie README en docs/INSTALLATIE.md). Fase 2 en 3 volgen.

## 1. Doel

Eén overzicht van 30 dagen waarin:

- de **lessen** staan die ik geef (verschuifbaar, per klas in een reeks);
- de **taken** staan die ik op een bepaalde dag wil doen (vrij te schuiven blokjes);
- zichtbaar is **tegen wanneer** iets klaar moet zijn en **wanneer** ik iets moet verbeteren;
- enkel de **agenda-afspraken** verschijnen die ik expliciet heb aangeduid.

Eén gebruiker. Werkt op gsm en computer, met dezelfde gegevens.

## 2. Begrippen (datamodel)

### Klas
| veld | voorbeeld | uitleg |
|---|---|---|
| `id` | `k1` | |
| `naam` | `BKH4` | |
| `kleur` | `#3b82f6` | herkenbaar in het overzicht |
| `lesrooster` | `[ma, do]` | weekdagen waarop de klas les heeft (max. 1 les per dag per klas), nodig om een reeks te laten opschuiven |

### Les
| veld | voorbeeld | uitleg |
|---|---|---|
| `id` | `l17` | |
| `klasId` | `k1` | |
| `titel` | `Aankoopfactuur basis` | |
| `volgorde` | `5` | plaats in de lessenreeks van die klas |
| `datum` | `2026-10-15` | dag waarop ik de les geef (of leeg = nog niet ingepland) |

### Taak
| veld | voorbeeld | uitleg |
|---|---|---|
| `id` | `t42` | |
| `titel` | `Prints facturen` | |
| `lesId` | `l17` of leeg | leeg = losse taak (stage, vergadering, …) |
| `werkdag` | `2026-10-12` of leeg | dag waarop **ik** eraan wil werken, leeg = in het bakje "nog in te plannen" |
| `deadline` | `{ relatief: -1, nietOpWerkdag: true }` of `{ datum: "2026-10-20" }` | relatief = aantal dagen t.o.v. de lesdatum (schuift mee met de les), eventueel verder terug tot een dag die geen werkdag is; absoluut = vaste datum (losse taken, verbeteren) |
| `vanaf` | `{ relatief: +3 }` of leeg | optioneel: vroegst mogelijke dag (bv. verbeteren kan pas na indienen) |
| `klaar` | `false` | |
| `notitie` | | vrije tekst |

### Standaardtaak (sjabloon)
Wordt automatisch voorgesteld bij het aanmaken van een les (aanvinken wat van toepassing is).

| veld | voorbeeld |
|---|---|
| `titel` | `Lesvoorbereiding` |
| `deadline` | `{ relatief: -1, nietOpWerkdag: true }` |
| `vanaf` | leeg |
| `standaardAan` | `true` |

Startset (geldt voor alle klassen):

| standaardtaak | klaar tegen |
|---|---|
| Lesvoorbereiding | dag vóór de les; is dat een werkdag, dan de eerste dag daarvoor die géén werkdag is |
| CR-taak klaarzetten | dag vóór de les |
| Prints | ochtend van de les zelf |
| Verbeteren | vanaf indiendatum; deadline wordt voorgesteld als de volgende les van die klas na indienen, maar daarna als **vaste datum** bewaard (niet gekoppeld) en vrij aan te passen |

Een standaardtaak is enkel een **voorstel**: eens aangemaakt is elke taak los aan te passen (titel, deadline) zonder dat andere lessen veranderen. Variaties per klas komen later, op basis van wat in het gebruik opvalt.

### Werkdagen (instelling)
Dagen waarop ik op school werk en dus geen tijd heb om voor te bereiden.

| veld | voorbeeld | uitleg |
|---|---|---|
| `vasteWerkdagen` | `[di, vr]` | in te stellen, wijzigt mogelijk naar `[ma, di]` |
| extra werkdagen | evaluatiedag, pedagogische studiedag | via de agenda met code `#sw` (zie §5), of manueel aan te duiden op een dag |

### Afwezigheid (leerlingen weg)
| veld | voorbeeld | uitleg |
|---|---|---|
| `van` / `tot` | `2026-10-22` / `2026-10-22` | één dag of periode (ook vakanties) |
| `klassen` | `alle` of `[k1, k3]` | |
| `reden` | `Uitstap Brussel` | |

### Afspraak (uit Google Agenda, alleen-lezen)
| veld | uitleg |
|---|---|
| `titel`, `start`, `einde`, `heleDag` | overgenomen uit de agenda, code wordt uit de titel weggelaten |

### Les met meerdere klassen
Een les heeft `klasIds` (een lijst). BKH3-K2 en BKH3-K3 krijgen zo samen één les met één set taken.
Krijgt maar één klas les, dan vink je de andere klas uit bij die les; de taken blijven bij de les.
In het overzicht: "BKH3-K2 + K3" met de kleuren van beide klassen.

### Opleiding (educatieve bachelor)
| begrip | velden | uitleg |
|---|---|---|
| Opleidingsonderdeel (`vakken`) | `naam`, `kleur` | groepeert opdrachten; warme tinten rond het fuchsia |
| Opdracht (`opdrachten`) | `vakId`, `titel`, `deadline` | einddeadline |
| Stuk | een taak met `opdrachtId` en `volg` | deadline standaard `{ eind: true }` = volgt de einddeadline; tussendeadline kan |

- **Verdelen:** de stukken die nog geen werkdag hebben worden gelijkmatig verdeeld over de dagen die géén werkdag zijn, van morgen tot de dag vóór de einddeadline. Daarna vrij te verschuiven.
- **Onderscheid school/opleiding:** opleidingsblokjes hebben de kleur van hun onderdeel, een stippelrand en 🎓; de einddeadline staat als gekleurd label op de dag. Filter *Alles · School · Opleiding* in het overzicht en het bakje.
- Losse taken krijgen een `domein` (school of opleiding).
- Hogeschoollessen ('s avonds) komen via de agenda met `#s` (geen werkdag).

## 3. Regels

1. **Werkdag schuif ik zelf, deadline volgt de les.** Verschuift een les, dan schuiven de relatieve deadlines (en `vanaf`) mee. Werkdagen blijven staan. Ook als de vaste werkdagen wijzigen of er een extra werkdag bijkomt, worden relatieve deadlines herberekend.
2. **Waarschuwingen**
   - 🔴 werkdag ligt ná de deadline;
   - 🔴 werkdag ligt vóór `vanaf`;
   - 🟠 taak zonder werkdag met deadline binnen 3 dagen;
   - 🟠 les gepland op een dag waarop die klas afwezig is.
3. **Reeks opschuiven.** Bij een les: "schuif deze en alle volgende lessen van deze klas één lesmoment op". De nieuwe datums worden berekend uit het lesrooster, afwezigheidsdagen worden overgeslagen. Ook mogelijk: één lesmoment terug.
4. **Afgevinkte taken** worden grijs en klappen weg (instelbaar zichtbaar).

## 4. Schermen

### A. 30-dagenoverzicht (hoofdscherm)
Per dag één blok, ook weekends:

1. 🚫 afwezigheid (balk bovenaan, bv. "BKH3 op uitstap"); werkdagen krijgen een subtiele markering
2. 🎓 lessen die ik die dag geef (kleur van de klas)
3. 📅 aangeduide agenda-afspraken
4. ✏️ taken met deze werkdag (schuifbare blokjes)
5. ⚑ deadlines die op deze dag vallen (enkel als ze nog niet klaar zijn)

- **Computer:** raster van 5 weken, blokjes slepen tussen dagen en uit/naar het bakje.
- **Gsm:** verticale lijst van dagen. Tik op een blokje → "verplaats naar": *vandaag*, *morgen*, *+1 week*, *datum kiezen*, *terug naar bakje*.

### B. Lesdetail
Klas, titel, datum, checklist van taken. Snelknoppen om standaardtaken toe te voegen. Knoppen "reeks opschuiven".

### C. Bakje "nog in te plannen"
Taken zonder werkdag, gesorteerd op deadline.

### D. Klassen
Per klas de lessenreeks in volgorde, lesrooster instellen, lessen toevoegen (manueel, ook meerdere tegelijk door een lijst te plakken).

### E. Afwezigheden & instellingen
Afwezigheden beheren, standaardtaken beheren, vaste werkdagen instellen.

## 5. Agenda-koppeling

- Ik duid een afspraak in de gezinsagenda aan met een **code** in titel of beschrijving. De afspraak blijft gewoon in de gezinsagenda staan.
  - `#s` → afspraak verschijnt in Saga (tandarts, kapper, uitstap);
  - `#sw` → verschijnt in Saga **én** telt als extra werkdag (evaluatiedag, pedagogische studiedag).
- De code moet als los woord staan: `#school` of `#sport` tellen niet mee.
- De code wordt in Saga niet getoond ("Tandarts", niet "Tandarts #s").
- Een **achterliggende sync** draait **1 keer per dag** ('s nachts, rond 5u) en leest de agenda voor de komende 60 dagen. Enkel afspraken met de code worden overgenomen, al de rest wordt genegeerd.
- Wie niet wil wachten: knop **"agenda nu vernieuwen"** in de instellingen.
- Alleen lezen: de planner schrijft nooit in de agenda.

## 6. Techniek (voorstel)

```
 gsm / laptop                        Google-account van Céline
┌────────────────────┐   HTTPS   ┌──────────────────────────────┐
│ Webapp (PWA)       │ ───────▶  │ Google Apps Script           │
│ - op beginscherm   │ ◀───────  │ - API: data lezen/opslaan    │
│ - lokale kopie     │   JSON    │ - dagelijkse agenda-sync (#s)│
│   (werkt even      │           │ - data: 1 JSON-bestand       │
│   offline)         │           │   op Google Drive            │
└────────────────────┘           └──────────────────────────────┘
```

- **Opslag op Google Drive** via Google Apps Script: alles blijft in mijn eigen Google-account, gratis, en Apps Script kan rechtstreeks de agenda lezen (geen aparte koppeling nodig). Proton heeft geen bruikbare koppeling voor zo'n webapp.
- **Webapp** zonder installatie via een appwinkel; op de gsm "toevoegen aan beginscherm".
- Toegang beveiligd met een geheime sleutel die enkel op mijn toestellen staat.

## 7. Fasering

| fase | inhoud |
|---|---|
| 1 ✅ | klassen, lessen, taken, standaardtaken, vaste werkdagen, 30-dagenoverzicht, schuiven (slepen + "verplaats naar"), meeschuivende deadlines, waarschuwingen, bakje, afvinken, opslag op Drive, gsm |
| 1b ✅ | opleiding (onderdelen, opdrachten, stukken, verdelen), filter, lessen met meerdere klassen |
| 2 | agenda-sync met code (`#s`, `#sw`), afwezigheden |
| 3 | lesrooster per klas + reeks opschuiven |

## 8. Beslist

- Hosting: webapp op GitHub Pages (code openbaar, gegevens niet), opslag op persoonlijke Google Drive.
- Losse taken: ja. Tijdsinschatting: nee. Weekends: zichtbaar.
- Lessen worden manueel ingegeven (geen import uit Google Sheets).
- Naam: **Saga**, agenda-codes `#s` en `#sw`.
- Max. 1 les per dag per klas.
- Verbeterdeadline: voorstel = volgende les na indienen, bewaard als vaste, aanpasbare datum.
