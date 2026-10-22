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
| `tijd` | `5400000` | bestede tijd in ms (afgesloten periodes van de timer) |
| `gestart` | tijdstempel of leeg | de timer loopt sinds dit moment |

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

### Weergave (na eerste gebruik)
- Taken worden **gebundeld per les of opdracht**: eerst de les (klas + onderwerp + lesdatum), daaronder klein de taken. Bakje: lessen op datum, opdrachten in de volgorde waarin ze ingegeven zijn, stukken in hun volgorde.
- **Geen vlaggetjes** voor taken bij een les (de lesdatum zegt genoeg); wel voor losse taken en tussendeadlines. Einddeadline van een opdracht blijft als label.
- Rustiger lettertype (Open Sans voor tekst, Quicksand voor titels) en een instelbare **tekstgrootte** per toestel.
- ~~Kalender per maand~~ → vervangen door **doorlopende weken** (zie "Na de review").
- Deadlines van de opleiding: groen vlaggetje (school/losse taken: roze-rood).
- Agenda: enkel de agenda **De Zottekes** (instelbaar in `AGENDA_NAMEN` in Code.gs).

### Vereenvoudiging (na gebruik)
- **Eén taak per les**, met de naam van de les (id `h-<les>`), getint in de klaskleur. Standaard staat ze op de dag vóór de les (verder terug als dat een werkdag is) en schuift ze mee met de les; eens verplaatst blijft ze staan. "Standaard" zet ze terug. Geen standaardtaken meer; oude (lesvoorbereiding, CR-taak, prints) zijn opgegaan in die ene taak.
- **Werkdagen veranderen verschuift niets:** de standaarddag van een lestaak wordt vastgelegd bij het aanmaken. Komt er later een werkdag bij (#sw in de agenda), dan blijft de taak staan. Enkel als je de les zelf verplaatst, verhuist een niet zelf verplaatste lestaak mee.
- **Opsplitsen:** de taak van een les kan in 2–10 blokken gesplitst worden (1/3, 2/3, 3/3); de extra blokken komen in het bakje. (Losse taken worden opgedeeld in stukken, zie verder.)
- Agenda-afspraken: enkel de titel, zonder uur.
- Opleidingskleuren: ook geel.
- **Opdrachten en taken bij School:** onder de klassen staat een sectie *Opdrachten en taken*, per **onderwerp** (`onderwerpen`: `naam`, `kleur`). Net als bij de opleiding maak je er een **opdracht met stukken** (een opdracht met `domein: 'school'` en `onderwerpId`; einddeadline optioneel), met *+ stuk*, *Lijst plakken* en *Verdelen*. Kleine dingen blijven een **losse taak** (`onderwerpId` op de taak). Afgeronde opdrachten en afgevinkte taken staan ingeklapt onder "Afgerond". Een onderwerp verwijderen laat alles bestaan, zonder onderwerp. Losse opleidingstaken staan in een eigen kaart bij Opleiding.
- **Opdelen in stukken i.p.v. blokken:** een losse taak kan "opgedeeld worden in stukken": ze wordt een opdracht met dezelfde naam, onderwerp en deadline, met de taak zelf als eerste stuk. Losse taken die vroeger in blokken gesplitst werden, worden automatisch zo'n opdracht met stukken "Deel 1", "Deel 2", … Opsplitsen in blokken blijft enkel voor de taak van een les.
- **Tijd bijhouden:** elke taak heeft een timer (start, pauzeren, later verder doen); de tijd telt op over alle keren. Er loopt maar één timer tegelijk, afvinken stopt hem. De lopende timer staat bovenaan in de balk. Vergeten stoppen? "Aanpassen" zet de tijd zelf juist (bv. 45 of 1:30). Bij een les of opdracht staat de opgetelde tijd van haar taken.

### Na de review (oktober 2026)
- **Overzicht = doorlopende weken** in plaats van een kalendermaand: gewoon naar beneden scrollen, zo zie je ook het verloop van de lessen. Bij het openen: vorige week, deze week en 10 weken vooruit; bij het scrollen komen er vanzelf weken bij (tot een jaar vooruit). Bovenaan "↑ Eerdere weken" (tot 4 weken terug). "Vandaag" springt terug. De dagnamen en filters blijven bovenaan staan; de 1e van een maand toont de maandnaam (gsm: een maandkop). Dagen zijn standaard lager (meer weken op één scherm) en groeien mee met de taken.
- **Filter** in twee delen: domein (*Alles · School · Opleiding*) en een **klas** (keuzelijst), plus de knop *Enkel lessen*.
- **Pagina per klas** (`#/klas/<id>`): volgende les met de timer van de voorbereiding, open werk (verbeteren, opdrachten en taken voor die klas), de lessenreeks, en de tijd die in de klas kroop. Knop *Toon in overzicht* zet de klasfilter.
- **Taken en schoolopdrachten voor een klas:** een losse schooltaak en een schoolopdracht kunnen (optioneel) `klasIds` krijgen; ze verschijnen dan op de pagina van de klas en in de klasfilter.
- **Vakanties en afwezigheden** (`afwezigheden`: `reden`, `van`, `tot`, `klasIds`; leeg = alle klassen = vakantie), in te geven bij Instellingen of via + op een dag. Ze staan als balkje op de dag; een les op zo'n dag krijgt een oranje waarschuwing.
- **Lesrooster gebruiken:** *Inplannen volgens rooster* zet de lessen zonder datum op de volgende lesmomenten (lesdagen van de klas, zonder vakanties/afwezigheden). Bij een les: de reeks één lesmoment **later of vroeger** schuiven.
- **Ongedaan maken in plaats van "Zeker?":** afvinken, verwijderen, verdelen, inplannen en opschuiven tonen een melding met *Ongedaan maken*. Geen `prompt`/`confirm` meer: opsplitsen kies je met knoppen (2–5 blokken), tijd aanpassen gebeurt in het venster zelf.
- **Back-up:** *Download* haalt de volledige planning op van Drive. *Samenvoegen* voegt toe; *Terugzetten* maakt de planning weer zoals in de back-up (ook verwijderde dingen komen terug).
- **Alles bijhouden, het toestel licht houden:** verwijderen markeert enkel (`del: true`), de gegevens (ook de bestede tijd) blijven op Drive. Bij elke synchronisatie krijgt het toestel enkel terug wat de laatste maand nog speelde; afgewerkte taken, voorbije lessen en oude afspraken verdwijnen na een maand van het toestel, niet van Drive (regels in `actief`, zelfde functie in `model.js` en `Code.gs`). Een les en haar taken gaan altijd samen, zodat er nooit een lestaak opnieuw gemaakt wordt.
- **Tijdsoverzicht** (`#/tijd`): bestede tijd per klas, onderwerp en opleidingsonderdeel, per soort werk (voorbereiding, verbeteren, opdrachten, losse taken), gemiddelde voorbereiding per les, per maand en de top 10, over het schooljaar, deze of vorige maand of de laatste 4 weken. Haalt de volledige planning op van Drive.
- **Afspraken verbergen** (per toestel, bv. schoolcomputer of projecteren): knop "Afspraken verbergen" bij het overzicht en een vinkje bij Instellingen → Weergave. Afspraken met #sw tellen nog altijd als werkdag.
- **Techniek:** `app.js` opgesplitst in modules; tijdens het tekenen een tijdelijke index (taken per les, afspraken per dag, …) zodat Saga vlot blijft met een jaar aan gegevens; het opruimwerk (lestaken aanmaken, oude blokken omzetten) loopt enkel bij het opstarten en na een synchronisatie; een nieuwe versie van de app meldt zich met *Herladen*.

### Tweede review (oktober 2026)

**Benamingen**
- **Les**: wat ik geef. Elke les heeft haar **voorbereiding** (de lestaak van hierboven).
- **Taak**: een taak voor leerlingen die ik moet **verbeteren** (niet zelf maken).
- **Opdracht**: wat ik krijg vanuit de opleiding en zelf moet maken (met stukken).
- **To do**: alles wat ik moet regelen. Losse to do's per onderwerp; iets groters wordt een *to do met stukken* (technisch een schoolopdracht).

**Taken voor leerlingen** (`soort: 'verbeteren'`, `indien`)
- Hoort optioneel bij een les (anders bij een of meer klassen). Niet elke les heeft een taak. Vanop de pagina van een klas (of bij een les) toont de keuzelijst enkel de lessen van die klas.
- `indien`: de dag waarop leerlingen indienen. Standaard de **vrijdag van de lesweek** (eerste vrijdag op of na de les), vrij aan te passen. Verschuift de les, dan schuift de indiendag mee, tenzij je ze zelf koos (`indienManueel`).
- Op de indiendag staat een vlaggetje "⚑ Indienen: …". De dag erna staat **"Verbeteren CR: …"** op de planning (werkdag leeg = automatisch de dag na indienen); zelf verschuiven kan, "Standaard" zet het terug.
- Klaarzetten in Classroom hoort bij de lesvoorbereiding (geen apart blokje).
- Oudere verbetertaken (zonder `indien`) blijven gewone taken.

**Overzicht**
- Vlaggetjes (einddeadlines, indiendagen, deadlines) staan **altijd onderaan** de dag.
- Filterbalk: domein, klas, en een menu **Weergave** met *Enkel lessen* en *Afspraken verbergen*. Staat er een filter aan, dan zie je "Filter: … ✕".
- *Enkel lessen* toont onder elke les haar voorbereiding en taken.

**Bakje** (toont enkel wat binnenkort speelt; de rest staat bij School en Opleiding)
- blijven liggen: altijd;
- bij een les: enkel voor lessen in de komende 2 weken;
- verbeteren: enkel als het in de komende 2 weken moet gebeuren;
- to do's: deadline binnen 2 weken, of zonder deadline;
- opleiding: per opleidingsonderdeel de volgende 5;
- lessen zonder datum: ingeklapt.

**Vandaag** (`#/vandaag`, het startscherm op elk toestel). Op de computer drie kolommen, op de gsm onder elkaar:
1. **Belangrijk**: *📅 Afspraken* van vandaag uit de agenda (enkel #s, niet de #sw-werkdagen; met het uur, "hele dag" eerst; verborgen als je afspraken verbergt op dit toestel), *Voorbereiding* (de lessen van de volgende 2 werkdagen, vanaf morgen, die nog niet voorbereid zijn), *⚑ Deadline vandaag* (to do's, stukken en opdrachten) en *Gepland vandaag*. Alles in dezelfde rijen: afvinken, timer starten.
2. **Magjes**: wat bleef liggen (met *Alles herplannen*) en het bakje, met een knop *Vandaag*. Opleiding in de volgorde van de pagina Opleiding.
3. **Gedaan**: wat je vandaag afvinkte (laatst afgevinkt eerst; terug openzetten kan).
- Teller op het tabblad: enkel wat bleef liggen.

**Snel noteren**: bovenaan Vandaag en het bakje, of met de toets **N** op elk scherm. Eén regel = één to do in het bakje; een geplakte lijst geeft meerdere to do's.

**Bleef liggen**: zacht oranje, met *Alles herplannen* (verdelen over de komende dagen die geen werkdag zijn, niet voorbij de deadline; ongedaan te maken). De voorbereiding van een les die al gegeven is, telt niet mee en krijgt geen waarschuwing meer.

**Rustiger overzicht**: vandaag heeft de sterkste rand, werkdagen een zachte arcering met "werk", lessen zijn labels (kleurstreep, geen kaartje) en taken blokjes om af te vinken. Bij het openen 4 weken vooruit (er komen er bij tijdens het scrollen).

**Daglast**: bij elke dag (vanaf vandaag) de geschatte tijd die nog gepland staat (± 2u30). De schatting komt uit de timer: het gemiddelde van gelijkaardige afgewerkte taken (deze klas → alle voorbereidingen; deze opdracht → dit onderdeel → alle stukken; verbeteren per klas; to do's), zonder gegevens 30 minuten. Oranje als een dag vol zit: boven de grens bij Instellingen → Planning (standaard 4 uur), op een werkdag vanaf 1 uur. Er hoeft niets ingeschat te worden.

**Vergeten timer**: na 90 minuten vraagt de balk bovenaan (en de titel van het tabblad) "Loopt … nog?". *Ja* = weer 90 minuten verder; komt er binnen 5 minuten geen antwoord (ook als Saga dicht was), dan stopt de timer op het moment van de vraag, met een melding om de tijd na te kijken.

**Afvinken beloont**: een klein vinkje-animatie, "al 3 vandaag" in de melding, en bovenaan Vandaag wat je vandaag al afvinkte (`klaarOp`).

**Ochtendmail** (aan te zetten bij Instellingen → Planning, script versie 8): rond 6 uur een mail met wat gepland staat, welke lessen je nog moet voorbereiden, wat er ingediend wordt en wat bleef liggen. Enkel als er iets te melden is.

## 3. Regels

1. **Werkdag schuif ik zelf, deadline volgt de les.** Verschuift een les, dan schuiven de relatieve deadlines (en `vanaf`) mee. Werkdagen blijven staan. Ook als de vaste werkdagen wijzigen of er een extra werkdag bijkomt, worden relatieve deadlines herberekend.
2. **Waarschuwingen**
   - 🔴 werkdag ligt ná de deadline;
   - 🔴 werkdag ligt vóór `vanaf`;
   - 🟠 taak zonder werkdag met deadline binnen 3 dagen;
   - 🟠 les gepland op een dag waarop die klas afwezig is (of vakantie).
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
- **Minimale rechten** (apps-script/appsscript.json): agenda enkel lezen (`calendar.readonly`), Drive enkel eigen bestanden (`drive.file`, via de Drive-API in plaats van DriveApp).

## 7. Fasering

| fase | inhoud |
|---|---|
| 1 ✅ | klassen, lessen, taken, standaardtaken, vaste werkdagen, 30-dagenoverzicht, schuiven (slepen + "verplaats naar"), meeschuivende deadlines, waarschuwingen, bakje, afvinken, opslag op Drive, gsm |
| 1b ✅ | opleiding (onderdelen, opdrachten, stukken, verdelen), filter, lessen met meerdere klassen |
| 2a ✅ | agenda-sync met code (`#s`, `#sw`), dagelijks + knop "agenda nu vernieuwen" |
| 2b ✅ | vakanties en afwezigheden |
| 3 ✅ | lesrooster per klas: inplannen volgens rooster, reeks opschuiven; pagina per klas; tijdsoverzicht |

## 8. Beslist

- Hosting: webapp op GitHub Pages (code openbaar, gegevens niet), opslag op persoonlijke Google Drive.
- Losse taken: ja. Tijdsinschatting: nee. Weekends: zichtbaar.
- Lessen worden manueel ingegeven (geen import uit Google Sheets).
- Naam: **Saga**, agenda-codes `#s` en `#sw`.
- Max. 1 les per dag per klas.
- Verbeterdeadline: voorstel = volgende les na indienen, bewaard als vaste, aanpasbare datum.
