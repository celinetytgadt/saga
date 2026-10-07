# Takenplanner – ontwerp

> Status: **ontwerp, nog niet goedgekeurd**. Er wordt pas gecodeerd na akkoord.

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
| `deadline` | `{ relatief: -1 }` of `{ datum: "2026-10-20" }` | relatief = aantal dagen t.o.v. de lesdatum (schuift mee met de les); absoluut = vaste datum (losse taken) |
| `vanaf` | `{ relatief: +3 }` of leeg | optioneel: vroegst mogelijke dag (bv. verbeteren kan pas na indienen) |
| `klaar` | `false` | |
| `notitie` | | vrije tekst |

### Standaardtaak (sjabloon)
Wordt automatisch voorgesteld bij het aanmaken van een les (aanvinken wat van toepassing is).

| veld | voorbeeld |
|---|---|
| `titel` | `Lesvoorbereiding` |
| `deadline` | `{ relatief: -1 }` |
| `vanaf` | leeg |
| `standaardAan` | `true` |

Startset (geldt voor alle klassen):

| standaardtaak | klaar tegen |
|---|---|
| Lesvoorbereiding | dag vóór de les (uitzondering: zie open vraag) |
| CR-taak klaarzetten | dag vóór de les |
| Prints | ochtend van de les zelf |
| Verbeteren | afhankelijk van de indiendeadline (zie open vraag) |

Een standaardtaak is enkel een **voorstel**: eens aangemaakt is elke taak los aan te passen (titel, deadline) zonder dat andere lessen veranderen. Variaties per klas komen later, op basis van wat in het gebruik opvalt.

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

## 3. Regels

1. **Werkdag schuif ik zelf, deadline volgt de les.** Verschuift een les, dan schuiven de relatieve deadlines (en `vanaf`) mee. Werkdagen blijven staan.
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

1. 🚫 afwezigheid (balk bovenaan, bv. "BKH3 op uitstap")
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
Afwezigheden beheren, standaardtaken beheren, agenda-code instellen.

## 5. Agenda-koppeling

- Ik duid een afspraak in de gezinsagenda aan met een **code** (voorstel: `#p` in titel of beschrijving). De afspraak blijft gewoon in de gezinsagenda staan.
- Een **achterliggende sync** (bv. elk uur) leest de agenda voor de komende 30–60 dagen en neemt enkel afspraken met de code over. Al de rest wordt genegeerd.
- Alleen lezen: de planner schrijft nooit in de agenda.

## 6. Techniek (voorstel)

```
 gsm / laptop                        Google-account van Céline
┌────────────────────┐   HTTPS   ┌──────────────────────────────┐
│ Webapp (PWA)       │ ───────▶  │ Google Apps Script           │
│ - op beginscherm   │ ◀───────  │ - API: data lezen/opslaan    │
│ - lokale kopie     │   JSON    │ - uurlijkse agenda-sync (#p) │
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
| 1 | klassen, lessen, taken, standaardtaken, 30-dagenoverzicht, schuiven (slepen + "verplaats naar"), meeschuivende deadlines, waarschuwingen, bakje, afvinken, opslag op Drive, gsm |
| 2 | agenda-sync met code, afwezigheden |
| 3 | lesrooster per klas + reeks opschuiven |

## 8. Beslist

- Hosting: webapp op GitHub Pages (code openbaar, gegevens niet), opslag op persoonlijke Google Drive.
- Losse taken: ja. Tijdsinschatting: nee. Weekends: zichtbaar.
- Lessen worden manueel ingegeven (geen import uit Google Sheets).

## 9. Nog te beslissen

- Naam van de app (persoonlijk, los van De MET) → bepaalt ook de agenda-code.
- Lesvoorbereiding "2 dagen ervoor als ik de dag ervoor werk": hoe weet de app dat?
- Verbeteren: welke deadline (indiendatum + x dagen, of tegen de volgende les)?
