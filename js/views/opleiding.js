// Saga – pagina Opleiding: opdrachten per opleidingsonderdeel.

import * as M from '../model.js';
import { esc } from '../ui.js';
import { opNaam, werkKaart } from '../weergave.js';

function vakKaart(s, vak) {
  return werkKaart(s, {
    titel: vak ? esc(vak.naam) : 'Zonder opleidingsonderdeel',
    kleur: vak?.kleur || 'var(--fuchsia)',
    opl: true,
    opdrachten: M.opdrachtenVanVak(s, vak?.id || null),
    leeg: 'Geen lopende opdrachten.',
    kop: vak ? `<button class="knop klein" data-actie="vak-bewerk" data-id="${vak.id}">Bewerken</button>` : '',
    onder: vak ? `<button class="knop klein" data-actie="nieuwe-opdracht" data-vak="${vak.id}">+ opdracht</button>` : '',
  });
}

export function viewOpleiding(s) {
  const vakken = M.lijst(s, 'vakken').sort(opNaam);
  const zonder = M.opdrachtenVanVak(s, null);
  const losse = M.losseTaken(s, 'opleiding');
  const losseKaart = losse.length
    ? werkKaart(s, {
        titel: "To do's",
        kleur: 'var(--fuchsia)',
        taken: losse,
        opl: true,
        onder: '<button class="knop klein" data-actie="nieuwe-taak" data-domein="opleiding">+ to do</button>',
      })
    : '';
  return `<div class="pagina">
    <div class="pagina-kop"><h1>🎓 Opleiding</h1>
      <div class="knoppen-rij">
        <button class="knop" data-actie="vak-bewerk">+ onderdeel</button>
        <button class="knop primair" data-actie="nieuwe-opdracht">+ opdracht</button>
      </div>
    </div>
    ${
      vakken.length || zonder.length || losse.length
        ? `<div class="groepen">${vakken.map((v) => vakKaart(s, v)).join('')}${zonder.length ? vakKaart(s, null) : ''}${losseKaart}</div>`
        : '<p class="leeg">Nog niets voor je opleiding. Voeg een opleidingsonderdeel toe, en daarna je opdrachten.</p>'
    }
  </div>`;
}
