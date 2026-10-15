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
  return `<p class="sync-tekst">📅 Agenda ${esc(info.agendas.join(', '))} ingelezen op ${tijd}: ${info.aantal} ${info.aantal === 1 ? 'afspraak' : 'afspraken'} met #s of #sw.</p>`;
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
          ${sy.url ? '<button type="button" class="knop" data-actie="agenda">Agenda nu vernieuwen</button>' : ''}
        </div>
      </form>
      ${agendaStatus(sy.agenda)}
      <p class="hint">Agenda: afspraken met <b>#s</b> in de titel of beschrijving verschijnen in Saga, met <b>#sw</b> tellen ze ook als werkdag. Ze worden elke nacht ingelezen.</p>
      <p class="hint">Hoe je dit instelt: zie <a href="https://github.com/celinetytgadt/saga/blob/HEAD/docs/INSTALLATIE.md" target="_blank" rel="noopener">de installatiegids</a>.</p>
    </section>

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
