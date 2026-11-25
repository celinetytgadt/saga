// Saga – pagina School: to do's per onderwerp (stage, vergaderingen, …).
// Lessen en klassen volg ik in een andere app; lesvoorbereiding en verbeteren staan als
// weekblokken op Vandaag (groepen in te stellen bij Instellingen).

import * as M from '../model.js';
import { esc, GRIJS } from '../ui.js';
import { opNaam, werkKaart } from '../weergave.js';

function onderwerpKaart(s, ond) {
  const data = ond ? `data-onderwerp="${ond.id}"` : '';
  return werkKaart(s, {
    titel: ond ? esc(ond.naam) : 'Zonder onderwerp',
    kleur: ond?.kleur || GRIJS,
    opdrachten: M.opdrachtenVanOnderwerp(s, ond?.id || null),
    taken: M.takenVanOnderwerp(s, ond?.id || null),
    kop: ond ? `<button class="knop klein" data-actie="onderwerp-bewerk" data-id="${ond.id}">Bewerken</button>` : '',
    onder: `<button class="knop klein" data-actie="nieuwe-taak" data-domein="school" ${data}>+ to do</button>
      <button class="knop klein" data-actie="nieuwe-opdracht" data-domein="school" ${data}>+ met stukken</button>`,
  });
}

export function viewKlassen(s) {
  const onderwerpen = M.lijst(s, 'onderwerpen').sort(opNaam);
  const zonder = M.opdrachtenVanOnderwerp(s, null).length + M.takenVanOnderwerp(s, null).length;
  return `<div class="pagina">
    <div class="pagina-kop"><h1>School</h1>
      <div class="knoppen-rij">
        <button class="knop" data-actie="onderwerp-bewerk">+ onderwerp</button>
        <button class="knop primair" data-actie="nieuwe-taak" data-domein="school">+ to do</button>
      </div>
    </div>
    <p class="hint">Wat je moet regelen, per onderwerp (bv. Stage, Vergaderingen). Iets groters deel je op in stukken ("+ met stukken"). Lesvoorbereiding en verbeteren staan als weekblokken op <a href="#/vandaag">Vandaag</a>.</p>
    ${
      onderwerpen.length || zonder
        ? `<div class="groepen">${onderwerpen.map((o) => onderwerpKaart(s, o)).join('')}${zonder || !onderwerpen.length ? onderwerpKaart(s, null) : ''}</div>`
        : '<p class="leeg">Nog geen to do\'s.</p>'
    }
  </div>`;
}
