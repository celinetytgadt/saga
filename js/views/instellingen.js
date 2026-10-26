// Saga – instellingen: werkdagen, vakanties, weergave, synchronisatie, back-up.

import * as M from '../model.js';
import { getSync } from '../store.js';
import { esc, ui, WEEK } from '../ui.js';
import { klassenNaam } from '../weergave.js';

function agendaStatus(info) {
  if (!info) return '';
  const wanneer = new Date(info.tijd);
  const tijd = `${M.kortDatum(M.isoDatum(wanneer))} om ${wanneer.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}`;
  if (info.fout) return `<p class="sync-tekst sync-fout">Agenda: ${esc(info.fout)} (${tijd}).</p>`;
  const afspraken = (n) => `${n} ${n === 1 ? 'afspraak' : 'afspraken'}`;
  const extra = (info.extra || []).length ? `, en ${afspraken(info.aantalExtra || 0)} uit ${esc(info.extra.join(', '))}` : '';
  return `<p class="sync-tekst">📅 Ingelezen op ${tijd}: ${afspraken(info.aantal)} met #s of #sw uit ${esc(info.agendas.join(', '))}${extra}${info.tot ? `, tot ${M.kortDatum(info.tot)} ${info.tot.slice(0, 4)}` : ''}.</p>`;
}

// Extra agenda's aanvinken: daaruit komen alle afspraken (zonder #s). Het script (versie 10) geeft de lijst door.
function extraAgendas(s, sy) {
  if ((sy.scriptVersie || 0) < 10)
    return `<p class="hint">Wil je ook een andere agenda (bv. van je opleiding) volledig tonen? <b>Werk eerst het Google-script bij</b> naar versie 10 (zie de installatiegids, "Het script bijwerken"). Daarna kun je hier aanvinken welke.</p>`;
  const lijst = sy.agenda?.alle || [];
  if (!lijst.length) return '<p class="hint">Geen andere agenda\'s gevonden. Tik op "Agenda nu vernieuwen" als je er net een toevoegde.</p>';
  const aan = s.instellingen.extraAgendas || [];
  return `<p class="hint">Ook tonen, met al hun afspraken (zonder #s):</p>
    ${lijst
      .map((a) => `<label class="check"><input type="checkbox" data-extra-agenda="${esc(a.id)}" ${aan.includes(a.id) ? 'checked' : ''}> ${esc(a.naam)}</label>`)
      .join('')}`;
}

export function viewInstellingen(s) {
  const sy = getSync();
  const statusTekst = {
    lokaal: 'Alleen op dit toestel. Vul hieronder de koppeling in om te synchroniseren.',
    wacht: 'Wacht op synchronisatie…',
    bezig: 'Bezig met synchroniseren…',
    ok: `✓ Gesynchroniseerd met Google Drive${sy.laatste ? ` om ${new Date(sy.laatste).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}` : ''}.`,
    fout: `Synchroniseren mislukt: ${esc(sy.melding)}`,
  }[sy.status];
  return `<div class="pagina instellingen">
    <h1>Instellingen</h1>

    <section class="kaart">
      <h2>Vaste werkdagen</h2>
      <p class="hint">Afspraken met <b>#sw</b> in je agenda tellen altijd als werkdag. Staan al je werkdagen in de agenda, dan mag je hier alles uitvinken. Een lestaak komt standaard op de dag vóór de les die geen werkdag is; als je werkdagen later veranderen, blijven je taken staan waar ze staan.</p>
      <div class="dagknoppen">${WEEK.map(
        (d) =>
          `<button class="dagknop ${s.instellingen.werkdagen.includes(d) ? 'aan' : ''}" data-actie="werkdag" data-dag="${d}" aria-pressed="${s.instellingen.werkdagen.includes(d)}">${M.DAGNAMEN[d]}</button>`
      ).join('')}</div>
    </section>

    <section class="kaart">
      <h2>Planning</h2>
      <label class="rij-veld">Een dag zonder werk is vol vanaf
        <select data-instelling-getal="daggrens">${[120, 180, 240, 300, 360, 480]
          .map((m) => `<option value="${m}" ${(s.instellingen.daggrens || M.DAGGRENS_STANDAARD) === m ? 'selected' : ''}>${m / 60} uur</option>`)
          .join('')}</select></label>
      <p class="hint">In het overzicht staat bij elke dag hoeveel tijd er nog gepland staat (± 2u30), geschat uit de tijd die je met de timer bijhield voor gelijkaardige taken (zonder gegevens: 30 minuten per blokje). Is een dag vol, dan kleurt het oranje. Op een werkdag is dat vanaf 1 uur.</p>
      <label class="check"><input type="checkbox" data-instelling="ochtendmail" ${s.instellingen.ochtendmail ? 'checked' : ''}> Ochtendmail: elke ochtend rond 6 uur een korte mail met je dag</label>
      <p class="hint">Wat gepland staat, welke lessen je nog moet voorbereiden, wat er ingediend wordt en wat bleef liggen. Je krijgt enkel een mail als er iets te melden is.${
        sy.url && (sy.scriptVersie || 0) < 8 ? ' <b>Werk eerst het Google-script bij</b> (versie 8, zie de installatiegids, "Het script bijwerken").' : ''
      }</p>
    </section>

    <section class="kaart" id="vakanties">
      <h2>Vakanties en afwezigheden</h2>
      <p class="hint">Een vakantie geldt voor alle klassen. Een afwezigheid (uitstap, stage, examens) duid je aan voor één of meer klassen. Lessen op zo'n dag krijgen een waarschuwing, en "Inplannen volgens rooster" slaat die dagen over.</p>
      ${afwezighedenLijst(s)}
      <div class="knoppen">
        <button class="knop primair klein" data-actie="afwezigheid">+ vakantie of afwezigheid</button>
      </div>
    </section>

    <section class="kaart">
      <h2>Tijd</h2>
      <p class="hint">Waar gaat je tijd naartoe? Per klas, onderwerp en soort werk, over het hele schooljaar.</p>
      <div class="knoppen"><a class="knop klein" href="#/tijd">Tijdsoverzicht →</a></div>
    </section>

    <section class="kaart">
      <h2>Weergave</h2>
      <p class="hint">Tekstgrootte op dit toestel</p>
      <div class="dagknoppen">${[
        ['klein', 'Kleiner'],
        ['normaal', 'Normaal'],
        ['groot', 'Groter'],
      ]
        .map(([k, l]) => `<button class="dagknop ${ui.tekst === k ? 'aan' : ''}" data-actie="tekst" data-k="${k}" aria-pressed="${ui.tekst === k}">${l}</button>`)
        .join('')}</div>
      <p></p>
      <label class="check"><input type="checkbox" data-instelling="toonKlaar" ${s.instellingen.toonKlaar ? 'checked' : ''}> Afgevinkte taken blijven zichtbaar in het overzicht</label>
      <label class="check"><input type="checkbox" data-lokaal="verbergAfspraken" ${ui.verbergAfspraken ? 'checked' : ''}> Persoonlijke afspraken verbergen op dit toestel</label>
      <p class="hint">Handig op een schoolcomputer of als je je scherm projecteert. Afspraken met #sw tellen nog altijd als werkdag. Ook via de knop "Afspraken verbergen" bij het overzicht.</p>
    </section>

    <section class="kaart">
      <h2>Synchronisatie</h2>
      <p class="sync-tekst sync-${sy.status}">${statusTekst}</p>
      <form id="f-sync" class="formulier">
        <label>Adres van de Apps Script-webapp<input name="url" type="url" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(sy.url)}"></label>
        <label>Geheime sleutel<input name="token" type="password" autocomplete="off" value="${esc(sy.token)}"></label>
        <div class="knoppen">
          <button class="knop primair">Opslaan en synchroniseren</button>
        </div>
      </form>
      <p class="hint">Hoe je dit instelt: zie <a href="https://github.com/celinetytgadt/saga/blob/HEAD/docs/INSTALLATIE.md" target="_blank" rel="noopener">de installatiegids</a>.</p>
    </section>

    ${
      sy.url
        ? `<section class="kaart" id="agendas">
      <h2>Agenda's</h2>
      <p class="hint">Afspraken met <b>#s</b> in de titel of beschrijving verschijnen in Saga, met <b>#sw</b> tellen ze ook als werkdag. Ze worden elke nacht ingelezen.</p>
      ${agendaStatus(sy.agenda)}
      ${extraAgendas(s, sy)}
      <div class="knoppen"><button type="button" class="knop klein" data-actie="agenda">Agenda nu vernieuwen</button></div>
    </section>`
        : ''
    }

    <section class="kaart">
      <h2>Back-up</h2>
      <div class="knoppen">
        <button class="knop" data-actie="backup">Download back-up</button>
        <label class="knop">Samenvoegen met back-up<input type="file" accept="application/json,.json" id="backup-in" data-soort="samen" hidden></label>
        <label class="knop gevaar">Terugzetten naar back-up<input type="file" accept="application/json,.json" id="backup-terug" data-soort="terug" hidden></label>
      </div>
      <p class="hint"><b>Download</b> haalt je volledige planning op (ook wat enkel nog op Drive staat). Daarnaast bewaart het script elke dag zelf een kopie op Drive.</p>
      <p class="hint"><b>Samenvoegen</b> voegt toe wat ontbreekt; wat je intussen wijzigde of verwijderde, blijft zo. <b>Terugzetten</b> maakt je planning weer zoals in de back-up: wat er sindsdien bijkwam, verdwijnt (je kunt dat meteen ongedaan maken).</p>
    </section>

    <p class="credits">Saga · gemaakt door Céline Tytgadt</p>
  </div>`;
}

function afwezighedenLijst(s) {
  const v = M.vandaag();
  const lijst = M.lijst(s, 'afwezigheden').sort((a, b) => (a.van < b.van ? -1 : 1));
  const komend = lijst.filter((a) => (a.tot || a.van) >= v);
  const voorbij = lijst.filter((a) => (a.tot || a.van) < v);
  const regel = (a) => `<li><div class="lesregel" role="button" tabindex="0" data-actie="afwezigheid" data-id="${a.id}">
      <span class="lesregel-datum">${M.kortDatum(a.van)}${a.tot && a.tot !== a.van ? ` – ${M.kortDatum(a.tot)}` : ''}</span>
      <span class="lesregel-titel">${M.isVakantie(a) ? '🏖' : '🚫'} ${esc(a.reden || (M.isVakantie(a) ? 'Vakantie' : 'Afwezig'))}${M.isVakantie(a) ? '' : ` <small>${esc(klassenNaam(s, a.klasIds))}</small>`}</span>
    </div></li>`;
  return `${komend.length ? `<ol class="lessen-lijst">${komend.map(regel).join('')}</ol>` : '<p class="leeg">Nog geen vakanties of afwezigheden ingegeven.</p>'}
    ${voorbij.length ? `<details><summary>Voorbij (${voorbij.length})</summary><ol class="lessen-lijst">${voorbij.map(regel).join('')}</ol></details>` : ''}`;
}
