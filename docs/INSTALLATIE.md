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
4. Kies bovenaan in het keuzemenu de functie **installeer** en klik **Uitvoeren**.
   - Google vraagt toestemming: **Toestemming controleren** → kies je account.
   - Je krijgt "Google heeft deze app niet geverifieerd" (Engels: *Google hasn't verified this app*).
     Dat is normaal: de "ontwikkelaar" die erbij staat ben jij zelf, want het is je eigen script.
     Klik linksonder **Geavanceerd** (*Advanced*) → **Ga naar Saga (onveilig)** (*Go to Saga (unsafe)*)
     → **Toestaan** (*Allow*).
5. Onderaan verschijnt het **uitvoeringslogboek** met je **geheime sleutel** (een lange reeks letters en cijfers).
   Kopieer die, je hebt ze straks nodig. Op je Drive staat nu een map **Saga** met het bestand `saga-data.json`.
6. Klik rechtsboven **Implementeren** → **Nieuwe implementatie**.
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
  Via Instellingen → Back-up kun je ook zelf een bestand downloaden.
- **Zonder internet:** Saga blijft werken. Wijzigingen worden doorgestuurd zodra je weer online bent.
- **Sleutel kwijt of gelekt?** Open het script → **Projectinstellingen** (tandwiel links) → **Scripteigenschappen**,
  verwijder `SAGA_TOKEN` en voer **installeer** opnieuw uit. Vul de nieuwe sleutel in op je toestellen.

## Het script bijwerken

Als er een nieuwe versie van `Code.gs` is (Saga meldt dan "het Google-script is verouderd"):

1. Open je project op <https://script.google.com>.
2. Wis alles in `Code.gs`, plak de nieuwe inhoud van [`apps-script/Code.gs`](../apps-script/Code.gs) en klik op het **diskette-icoon**.
3. Kies de functie **installeer** en klik **Uitvoeren**. Google vraagt mogelijk opnieuw toestemming, bijvoorbeeld voor je agenda.
   Dat is weer de melding "niet geverifieerd": **Advanced** → **Go to Saga (unsafe)** → **Allow**.
   Dit plant ook de dagelijkse agenda-update (rond 5 uur 's nachts) en leest de agenda meteen in.
4. **Implementeren** → **Implementaties beheren** → potloodje ✏️ → bij Versie: **Nieuwe versie** → **Implementeren**.
   De URL blijft dezelfde; in Saga hoef je niets te veranderen.
5. In Saga: Instellingen → **Agenda nu vernieuwen**. De melding wordt groen.

## Agenda

- Zet **#s** in de titel of beschrijving van een afspraak in je Google Agenda, en ze verschijnt in Saga.
- Zet **#sw** als het een extra werkdag is (studiedag, evaluatiedag). Lesvoorbereiding valt dan niet op die dag.
- Saga leest alle agenda's die je in Google Agenda ziet, maar neemt enkel afspraken met de code over, van een week terug tot ongeveer 2,5 maand vooruit.
- Het script schrijft nooit in je agenda.
