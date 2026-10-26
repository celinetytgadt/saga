# Saga installeren

Je doet dit één keer. Reken op ongeveer een kwartier. Er zijn drie stappen:

1. **De app online zetten** (GitHub Pages), zodat je ze op je gsm en laptop kunt openen.
2. **De opslag op je Google Drive aanzetten** (Google Apps Script).
3. **Saga koppelen** op elk toestel.

Saga werkt ook zonder stap 2 en 3, maar dan blijven je gegevens op dat ene toestel.

---

## Stap 1 – De app online zetten

1. Ga naar <https://github.com/celinetytgadt/saga>.
2. **Settings** (bovenaan) → helemaal onderaan **Danger Zone** → **Change visibility** → **Make public**.
   Alleen de code wordt openbaar. Je planning staat op je Drive en is nergens publiek te zien.
3. **Settings** → links **Pages**.
4. Bij **Build and deployment**: Source = **Deploy from a branch**. Kies bij Branch de hoofdbranch (`claude/bold-hypatia-cf67qz`, of `main` als die later bestaat) en map **/ (root)**. Klik **Save**.
5. Na een minuutje staat bovenaan de link, normaal: **https://celinetytgadt.github.io/saga/**

Open die link. Saga werkt nu al, maar enkel op dat toestel.

## Stap 2 – Opslag op Google Drive

1. Ga naar <https://script.google.com> (met je **persoonlijke** Google-account) en klik **Nieuw project**.
2. Geef het project bovenaan de naam **Saga**.
3. Wis alles in het bestand `Code.gs` en plak de volledige inhoud van
   [`apps-script/Code.gs`](../apps-script/Code.gs) erin. Klik op het **diskette-icoon** om te bewaren.
4. **Beperkte rechten instellen:** klik links op het tandwiel **Projectinstellingen** (*Project Settings*) en vink
   **"appsscript.json-manifestbestand weergeven in editor"** (*Show "appsscript.json" manifest file in editor*) aan.
   Ga terug naar de editor (het `< >`-icoon links), open `appsscript.json`, wis alles en plak de inhoud van
   [`apps-script/appsscript.json`](../apps-script/appsscript.json). Bewaar.
   Daarmee vraagt Saga enkel:
   - je agenda **bekijken** (geen schrijfrechten);
   - op Drive enkel de bestanden die Saga zelf maakt (de map Saga), niet de rest van je Drive;
   - verbinding maken met Drive en elke nacht automatisch draaien.
5. Kies bovenaan in het keuzemenu de functie **installeer** en klik **Uitvoeren**.
   - Google vraagt toestemming: **Toestemming controleren** → kies je account.
   - Je krijgt "Google heeft deze app niet geverifieerd" (Engels: *Google hasn't verified this app*).
     Dat is normaal: de "ontwikkelaar" die erbij staat ben jij zelf, want het is je eigen script.
     Klik linksonder **Geavanceerd** (*Advanced*) → **Ga naar Saga (onveilig)** (*Go to Saga (unsafe)*)
     → **Toestaan** (*Allow*).
6. Onderaan verschijnt het **uitvoeringslogboek** met je **geheime sleutel** (een lange reeks letters en cijfers).
   Kopieer die, je hebt ze straks nodig. Op je Drive staat nu een map **Saga** met het bestand `saga-data.json`.
7. Klik rechtsboven **Implementeren** → **Nieuwe implementatie**.
   - Klik op het tandwiel naast "Type selecteren" → **Web-app**.
   - Beschrijving: `Saga`
   - Uitvoeren als: **Ik**
   - Wie heeft toegang: **Iedereen**
     (dit moet zo, anders kan de app er niet bij; zonder de geheime sleutel kan niemand iets lezen of wijzigen)
   - Klik **Implementeren** en kopieer de **URL van de web-app** (eindigt op `/exec`).

## Stap 3 – Saga koppelen (op elk toestel)

1. Open Saga → **Instellingen** → **Synchronisatie**.
2. Plak de **URL van de web-app** en de **geheime sleutel**.
3. Klik **Opslaan en synchroniseren**. Het bolletje rechtsboven wordt groen.

Doe dit op je laptop én op je gsm.

### Saga op je gsm als app

- **iPhone (Safari):** deelknop → **Zet op beginscherm**.
- **Android (Chrome):** menu ⋮ → **Toevoegen aan startscherm** of **App installeren**.

---

## Goed om te weten

- **Back-ups:** het script bewaart elke dag automatisch een kopie in de map Saga op je Drive (de laatste 14 dagen).
  Via Instellingen → Back-up kun je ook zelf je volledige planning downloaden.
- **Alles blijft op Drive:** ook afgewerkte en verwijderde taken (met hun bestede tijd), zodat het tijdsoverzicht
  het hele schooljaar toont. Op je toestellen blijft enkel wat de laatste maand nog speelde; dat houdt Saga snel.
- **Zonder internet:** Saga blijft werken. Wijzigingen worden doorgestuurd zodra je weer online bent.
- **Sleutel kwijt of gelekt?** Open het script → **Projectinstellingen** (tandwiel links) → **Scripteigenschappen**,
  verwijder `SAGA_TOKEN` en voer **installeer** opnieuw uit. Vul de nieuwe sleutel in op je toestellen.

## Het script bijwerken

Als er een nieuwe versie van `Code.gs` is (Saga meldt dan "het Google-script is verouderd").
Dat is nu het geval: de nieuwste is **versie 12**. Versie 9 leest ook het **einduur**
van een afspraak (op Vandaag zie je dan "14:00–15:30" in plaats van "14:00"), versie 10 is nodig voor **extra agenda's**
(bv. die van je opleiding, zie "Agenda" hieronder), versie 11 leest een jaar vooruit in plaats van 75 dagen, versie 12 haalt de ochtendmail weg
(en de toestemming om e-mail te versturen; **installeer** ruimt de oude dagelijkse mail op). Versie 7 volstaat voor de rest.

1. Open je project op <https://script.google.com>.
2. Wis alles in `Code.gs`, plak de nieuwe inhoud van [`apps-script/Code.gs`](../apps-script/Code.gs) en klik op het **diskette-icoon**.
   Doe hetzelfde met `appsscript.json` (zie stap 2.4 hierboven als je dat bestand nog niet ziet).
3. Kies de functie **installeer** en klik **Uitvoeren**. Google vraagt mogelijk opnieuw toestemming, bijvoorbeeld voor je agenda.
   Dat is weer de melding "niet geverifieerd": **Advanced** → **Go to Saga (unsafe)** → **Allow**.
   Dit plant ook de dagelijkse agenda-update (rond 5 uur 's nachts) en leest de agenda meteen in.
4. **Implementeren** → **Implementaties beheren** → potloodje ✏️ → bij Versie: **Nieuwe versie** → **Implementeren**.
   De URL blijft dezelfde; in Saga hoef je niets te veranderen.
   ⚠️ Deze stap is nodig: zonder nieuwe versie blijft de web-app de *oude* code gebruiken, ook al heb je de nieuwe bewaard.
5. In Saga: Instellingen → **Agenda nu vernieuwen**. De melding wordt groen.

## Eerder al ruimere rechten gegeven?

Heb je Saga vroeger al toestemming gegeven (toen nog met schrijfrechten op je agenda en toegang tot je hele Drive),
trek die dan eerst in, zodat enkel de beperkte rechten overblijven:

1. Ga naar <https://myaccount.google.com/connections> (Google-account → Beveiliging → Je verbindingen met apps en services van derden).
2. Klik op **Saga** → **Alle verbindingen verwijderen** / **Toegang verwijderen**.
3. Volg daarna "Het script bijwerken" hierboven (met de nieuwe `appsscript.json`). Bij **installeer** vraagt Google opnieuw
   toestemming, nu enkel voor *je agenda's bekijken* en *alleen de bestanden die deze app gebruikt*.

Saga maakt dan een nieuwe map **Saga** op je Drive. Je planning gaat niet verloren: die staat op je toestellen en wordt bij
de volgende synchronisatie opnieuw bewaard. De oude map Saga mag je daarna weggooien.

## Agenda

- Zet **#s** in de titel of beschrijving van een afspraak in je Google Agenda, en ze verschijnt in Saga.
- Zet **#sw** als het een extra werkdag is (studiedag, evaluatiedag). Lesvoorbereiding valt dan niet op die dag.
- Saga leest de agenda **De Zottekes** (enkel afspraken met #s of #sw). Wil je met de codes in een andere agenda werken, pas dan bovenaan in `Code.gs` de regel
  `const AGENDA_NAMEN = ['De Zottekes'];` aan (bv. `['De Zottekes', 'Werk']`), bewaar en maak een nieuwe versie.
- **Extra agenda's** (bv. van je opleiding) toon je volledig, zonder codes: vink ze aan in Saga bij **Instellingen → Agenda's**.
  Saga leest ze meteen in; uitvinken haalt hun afspraken weer weg. Een nieuwe agenda die je net toevoegde in Google Agenda?
  Tik daar eerst op **Agenda nu vernieuwen**, dan verschijnt ze in de lijst. Afspraken uit zo'n agenda tellen niet als werkdag (tenzij met #sw).
- Enkel afspraken met de code worden overgenomen, van een week terug tot ongeveer 2,5 maand vooruit.
- In Saga zie je bij Instellingen wanneer de agenda laatst ingelezen is en hoeveel afspraken er gevonden zijn.
- Verschijnt er niets? Kies in de script-editor de functie **testAgenda** en klik **Uitvoeren**. Het logboek toont welke
  agenda's er zijn en welke afspraken Saga zou overnemen.
- Het script schrijft nooit in je agenda.
