'use strict';

// ============================================================
// Oppsett
// ============================================================

// Det du følger med på. Vil du følge med på noe mer, legg til en linje her,
// for eksempel: { id: 'kvalme', navn: 'Kvalme', farge: '#2E9E8F' },
const KATEGORIER = [
  { id: 'mage', navn: 'Magen', farge: '#E8833A' },
  { id: 'hode', navn: 'Hodet', farge: '#7B6CF0' },
];

// Fra dette klokkeslettet spør startsiden «Hvordan var dagen?».
const KVELD_FRA_KLOKKA = 18;

const LAGRINGSNOKKEL = 'dagbok-data';
const DATAVERSJON = 1;

// ============================================================
// Datoer og tid
// ============================================================

const fmtDag = new Intl.DateTimeFormat('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtMaaned = new Intl.DateTimeFormat('nb-NO', { month: 'long', year: 'numeric' });
const fmtDatoTid = new Intl.DateTimeFormat('nb-NO', { dateStyle: 'long', timeStyle: 'short' });

const tosifret = (tall) => String(tall).padStart(2, '0');
const storForbokstav = (tekst) => tekst.charAt(0).toUpperCase() + tekst.slice(1);

// «2026-10-30» for en dato, i telefonens egen tidssone.
function datoNokkel(dato) {
  return `${dato.getFullYear()}-${tosifret(dato.getMonth() + 1)}-${tosifret(dato.getDate())}`;
}

function fraNokkel(nokkel) {
  const [aar, maaned, dag] = nokkel.split('-').map(Number);
  return new Date(aar, maaned - 1, dag);
}

function klokke(dato) {
  return `${tosifret(dato.getHours())}:${tosifret(dato.getMinutes())}`;
}

function forsteIMaaned(dato) {
  return new Date(dato.getFullYear(), dato.getMonth(), 1);
}

// ============================================================
// Lagring – alt ligger bare i telefonens eget lager
// ============================================================

function tomData() {
  return { versjon: DATAVERSJON, registreringer: [], dager: {}, sistBackup: null };
}

function nyId() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Sjekker og rydder data, enten fra lageret eller fra en sikkerhetskopi.
function normaliser(raadata) {
  if (!raadata || typeof raadata !== 'object' || !Array.isArray(raadata.registreringer)) {
    throw new Error('Ukjent format');
  }

  const registreringer = raadata.registreringer
    .filter((r) => r && typeof r.kategori === 'string' && !Number.isNaN(new Date(r.tid).getTime()))
    .map((r) => ({
      id: String(r.id || nyId()),
      kategori: r.kategori,
      tid: new Date(r.tid).toISOString(),
      notat: typeof r.notat === 'string' ? r.notat : '',
    }));

  const dager = {};
  for (const [nokkel, verdier] of Object.entries(raadata.dager || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nokkel) || !verdier || typeof verdier !== 'object') continue;
    dager[nokkel] = {};
    for (const [kategori, verdi] of Object.entries(verdier)) {
      if (typeof verdi === 'boolean') dager[nokkel][kategori] = verdi;
    }
  }

  return {
    versjon: DATAVERSJON,
    registreringer,
    dager,
    sistBackup: typeof raadata.sistBackup === 'string' ? raadata.sistBackup : null,
  };
}

function lesData() {
  let tekst = null;
  try {
    tekst = localStorage.getItem(LAGRINGSNOKKEL);
  } catch {
    return tomData();
  }
  if (!tekst) return tomData();

  try {
    return normaliser(JSON.parse(tekst));
  } catch {
    // Ta vare på det som ikke kunne leses, i stedet for å skrive over det.
    try { localStorage.setItem(`${LAGRINGSNOKKEL}-uleselig-${Date.now()}`, tekst); } catch {}
    return tomData();
  }
}

function lagre() {
  try {
    localStorage.setItem(LAGRINGSNOKKEL, JSON.stringify(data));
  } catch {
    visMelding('Klarte ikke å lagre! Ta en sikkerhetskopi i innstillingene.');
  }
}

let data = lesData();

// ============================================================
// Oppslag og endringer
// ============================================================

function kategoriFor(id) {
  return KATEGORIER.find((k) => k.id === id) ?? { id, navn: id, farge: '#9A948C' };
}

function finnRegistrering(id) {
  return data.registreringer.find((r) => r.id === id);
}

function sorterEtterTid(registreringer) {
  return registreringer.sort((a, b) => (a.tid < b.tid ? -1 : a.tid > b.tid ? 1 : 0));
}

// Alle registreringer gruppert per dag: «2026-10-30» → [...]
function registreringerPerDag() {
  const perDag = new Map();
  for (const r of data.registreringer) {
    const nokkel = datoNokkel(new Date(r.tid));
    if (!perDag.has(nokkel)) perDag.set(nokkel, []);
    perDag.get(nokkel).push(r);
  }
  for (const liste of perDag.values()) sorterEtterTid(liste);
  return perDag;
}

function registreringerPaa(nokkel) {
  return registreringerPerDag().get(nokkel) ?? [];
}

// Hva gjorde vondt denne dagen, og var det en bekreftet rolig dag?
function dagStatus(nokkel, registreringer) {
  const oppsummering = data.dager[nokkel];
  const vondt = KATEGORIER.filter((k) =>
    registreringer.some((r) => r.kategori === k.id) || oppsummering?.[k.id] === true);
  return { vondt, rolig: vondt.length === 0 && oppsummering != null };
}

// Lagret oppsummering hvis den finnes, ellers et forslag ut fra registreringene.
function forslagTilOppsummering(nokkel) {
  const registreringer = registreringerPaa(nokkel);
  const lagret = data.dager[nokkel] ?? {};
  const verdier = {};
  for (const k of KATEGORIER) {
    verdier[k.id] = typeof lagret[k.id] === 'boolean'
      ? lagret[k.id]
      : registreringer.some((r) => r.kategori === k.id);
  }
  return verdier;
}

// Når en dag allerede er oppsummert, skal en ny registrering den dagen telle med.
function markerSomVondt(registrering) {
  const oppsummering = data.dager[datoNokkel(new Date(registrering.tid))];
  if (oppsummering) oppsummering[registrering.kategori] = true;
}

function leggTil(kategori, tid, notat = '') {
  const registrering = { id: nyId(), kategori, tid: tid.toISOString(), notat };
  data.registreringer.push(registrering);
  markerSomVondt(registrering);
  lagre();
  return registrering;
}

function oppdater(id, endringer) {
  const registrering = finnRegistrering(id);
  if (!registrering) return;
  Object.assign(registrering, endringer);
  markerSomVondt(registrering);
  lagre();
}

function slett(id) {
  data.registreringer = data.registreringer.filter((r) => r.id !== id);
  lagre();
}

function lagreOppsummering(nokkel, verdier) {
  data.dager[nokkel] = { ...verdier };
  lagre();
}

// ============================================================
// Små hjelpere for skjermen
// ============================================================

const $ = (velger) => document.querySelector(velger);

// Lager et HTML-element: el('button', { class: 'x', onclick: ... }, 'Tekst')
function el(tag, egenskaper = {}, ...barn) {
  const element = document.createElement(tag);
  for (const [navn, verdi] of Object.entries(egenskaper)) {
    if (verdi == null || verdi === false) continue;
    if (navn === 'class') element.className = verdi;
    else if (navn === 'style') element.style.cssText = verdi;
    else if (navn.startsWith('on')) element.addEventListener(navn.slice(2), verdi);
    else element.setAttribute(navn, verdi === true ? '' : verdi);
  }
  for (const b of barn.flat()) {
    if (b != null && b !== false) element.append(b);
  }
  return element;
}

const prikk = (kategori) => el('span', { class: 'prikk', style: `--farge:${kategori.farge}`, 'aria-hidden': 'true' });

let meldingTimer;

function visMelding(tekst, handlinger = []) {
  const toast = $('#toast');
  toast.replaceChildren(
    el('span', { class: 'tekst' }, tekst),
    ...handlinger.map((h) => el('button', { onclick: () => { skjulMelding(); h.handling(); } }, h.tekst)),
  );
  toast.classList.add('vis');
  clearTimeout(meldingTimer);
  meldingTimer = setTimeout(skjulMelding, handlinger.length ? 7000 : 2500);
}

function skjulMelding() {
  $('#toast').classList.remove('vis');
}

const ark = $('#ark');

function apneArk(...innhold) {
  ark.replaceChildren(el('div', { class: 'ark-innhold' }, innhold));
  if (!ark.open) ark.showModal();
}

function lukkArk() {
  ark.close();
}

// Trykk utenfor arket lukker det.
ark.addEventListener('click', (e) => { if (e.target === ark) lukkArk(); });

// Spør i arket før noe som ikke kan angres. Gir true for ja og false for avbryt.
function bekreft({ tittel, tekst, ja }) {
  return new Promise((svar) => {
    apneArk(
      el('h2', {}, tittel),
      el('p', {}, tekst),
      el('button', { class: 'primaer', onclick: () => svar(true) }, ja),
      el('button', { class: 'sekundaer', onclick: () => svar(false) }, 'Avbryt'),
    );
  });
}

// ============================================================
// Skjermtilstand
// ============================================================

const tilstand = {
  visning: 'idag',
  dagNaa: datoNokkel(new Date()),
  visMaaned: forsteIMaaned(new Date()),
  valgtDag: datoNokkel(new Date()),
  endrerKveld: false,
};

function render() {
  const erIdag = tilstand.visning === 'idag';
  $('#vis-idag').hidden = !erIdag;
  $('#vis-kalender').hidden = erIdag;
  $('#tittel').textContent = erIdag ? 'I dag' : 'Kalender';
  for (const fane of document.querySelectorAll('.faner button')) {
    if (fane.dataset.visning === tilstand.visning) fane.setAttribute('aria-current', 'page');
    else fane.removeAttribute('aria-current');
  }
  if (erIdag) renderIdag();
  else renderKalender();
}

// ============================================================
// «I dag»
// ============================================================

function renderIdag() {
  const naa = new Date();
  const nokkel = datoNokkel(naa);
  const registreringer = registreringerPaa(nokkel);
  const rot = $('#vis-idag');

  rot.replaceChildren(el('p', { class: 'dato' }, storForbokstav(fmtDag.format(naa))));

  if (visInstallasjonstips()) {
    rot.append(el('p', { class: 'tips' },
      el('strong', {}, 'Legg Dagbok på Hjem-skjermen'),
      'Trykk på Del-knappen i Safari (firkanten med pil opp) og velg «Legg til på Hjem-skjerm». ',
      'Bruk alltid ikonet etterpå – det du registrerer her i Safari blir ikke med.'));
  }

  if (data.dager[nokkel] && !tilstand.endrerKveld) {
    rot.append(oppsummertLinje(nokkel, registreringer));
  } else if (naa.getHours() >= KVELD_FRA_KLOKKA || tilstand.endrerKveld) {
    rot.append(oppsummeringSkjema(nokkel, {
      tittel: 'Hvordan var dagen?',
      hjelp: 'Fylt ut etter det du har registrert i dag. Rett opp hvis noe mangler.',
      etterLagring: () => {
        tilstand.endrerKveld = false;
        render();
        visMelding('Dagen er lagret');
      },
    }));
  }

  rot.append(el('div', { class: 'store-knapper' }, KATEGORIER.map((k) =>
    el('button', {
      class: 'stor-knapp',
      style: `--farge:${k.farge}`,
      'data-kategori': k.id,
      onclick: () => hurtigRegistrer(k),
    },
    el('span', { class: 'prikk', 'aria-hidden': 'true' }),
    el('span', {}, el('span', { class: 'navn' }, k.navn), el('span', { class: 'hint' }, 'Trykk for å registrere nå'))))));

  rot.append(el('button', { class: 'lenkeknapp', onclick: () => apneRegistrering({ dato: new Date() }) },
    '+ Registrer for et annet tidspunkt'));

  rot.append(el('h2', {}, 'Registrert i dag'));
  rot.append(registreringsliste(registreringer, 'Ingenting registrert i dag.'));
}

function hurtigRegistrer(kategori) {
  const naa = new Date();
  const nokkel = datoNokkel(naa);
  const forrigeOppsummering = data.dager[nokkel] ? { ...data.dager[nokkel] } : null;
  const registrering = leggTil(kategori.id, naa);

  render();
  $(`.stor-knapp[data-kategori="${kategori.id}"]`)?.classList.add('registrert');

  visMelding(`${kategori.navn} registrert kl. ${klokke(naa)}`, [
    { tekst: 'Legg til notat', handling: () => apneNotat(registrering.id) },
    {
      tekst: 'Angre',
      handling: () => {
        slett(registrering.id);
        if (forrigeOppsummering) lagreOppsummering(nokkel, forrigeOppsummering);
        render();
        visMelding('Angret');
      },
    },
  ]);
}

function oppsummertLinje(nokkel, registreringer) {
  const { rolig } = dagStatus(nokkel, registreringer);
  const oppsummering = data.dager[nokkel];
  const tekst = rolig
    ? 'Dagen er oppsummert: rolig dag'
    : 'Dagen er oppsummert: ' + KATEGORIER.map((k) => `${k.navn} ${oppsummering[k.id] ? 'ja' : 'nei'}`).join(' · ');

  return el('div', { class: 'kort oppsummert' },
    el('span', { class: 'hake', 'aria-hidden': 'true' }, '✓'),
    el('span', { class: 'tekst' }, tekst),
    el('button', { class: 'lenkeknapp', onclick: () => { tilstand.endrerKveld = true; render(); } }, 'Endre'));
}

function visInstallasjonstips() {
  const erIos = /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const paaHjemskjerm = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const iRamme = window.self !== window.top;
  return erIos && !paaHjemskjerm && !iRamme;
}

// ============================================================
// Felles byggeklosser
// ============================================================

function registreringsliste(registreringer, tomTekst) {
  if (registreringer.length === 0) return el('p', { class: 'tom' }, tomTekst);

  return el('ul', { class: 'liste' }, registreringer.map((r) => {
    const kategori = kategoriFor(r.kategori);
    return el('li', {}, el('button', {
      class: 'post',
      'aria-label': `${kategori.navn} kl. ${klokke(new Date(r.tid))}. Trykk for å endre.`,
      onclick: () => apneRegistrering({ registrering: r }),
    },
    prikk(kategori),
    el('span', { class: 'klokke' }, klokke(new Date(r.tid))),
    el('span', { class: 'innhold' },
      el('span', {}, kategori.navn),
      r.notat ? el('span', { class: 'notat' }, r.notat) : null),
    el('span', { class: 'pil', 'aria-hidden': 'true' }, '›')));
  }));
}

function jaNeiValg(startverdi, vedEndring) {
  const ja = el('button', { type: 'button' }, 'Ja');
  const nei = el('button', { type: 'button' }, 'Nei');
  const sett = (verdi) => {
    ja.setAttribute('aria-pressed', String(verdi));
    nei.setAttribute('aria-pressed', String(!verdi));
    vedEndring(verdi);
  };
  ja.addEventListener('click', () => sett(true));
  nei.addEventListener('click', () => sett(false));
  sett(startverdi);
  return el('div', { class: 'segment', role: 'group' }, ja, nei);
}

function oppsummeringSkjema(nokkel, { tittel, hjelp, etterLagring }) {
  const verdier = forslagTilOppsummering(nokkel);
  const erLagret = Boolean(data.dager[nokkel]);

  return el('div', { class: 'kort' },
    tittel ? el('h3', {}, tittel) : null,
    hjelp ? el('p', { class: 'hjelp' }, hjelp) : null,
    KATEGORIER.map((k) => el('div', { class: 'rad', 'aria-label': k.navn },
      prikk(k),
      el('span', { class: 'radnavn' }, k.navn),
      jaNeiValg(verdier[k.id], (verdi) => { verdier[k.id] = verdi; }))),
    el('button', {
      class: 'primaer',
      onclick: () => { lagreOppsummering(nokkel, verdier); etterLagring(); },
    }, erLagret ? 'Oppdater dagen' : 'Lagre dagen'));
}

// ============================================================
// Kalender
// ============================================================

function renderKalender() {
  const rot = $('#vis-kalender');
  const iDag = datoNokkel(new Date());
  const maaned = tilstand.visMaaned;
  const erDenneMaaneden = datoNokkel(maaned) === datoNokkel(forsteIMaaned(new Date()));
  const perDag = registreringerPerDag();

  const dager = [];
  const tommeFoer = (maaned.getDay() + 6) % 7; // uka starter på mandag
  for (let i = 0; i < tommeFoer; i++) dager.push(el('span', { 'aria-hidden': 'true' }));

  const antallDager = new Date(maaned.getFullYear(), maaned.getMonth() + 1, 0).getDate();
  for (let d = 1; d <= antallDager; d++) {
    const dato = new Date(maaned.getFullYear(), maaned.getMonth(), d);
    const nokkel = datoNokkel(dato);
    const { vondt, rolig } = dagStatus(nokkel, perDag.get(nokkel) ?? []);
    const beskrivelse = vondt.length ? vondt.map((k) => k.navn).join(' og ') : rolig ? 'rolig dag' : '';

    dager.push(el('button', {
      class: ['dag', nokkel === iDag && 'i-dag', nokkel === tilstand.valgtDag && 'valgt'].filter(Boolean).join(' '),
      disabled: nokkel > iDag,
      'aria-label': `${fmtDag.format(dato)}${beskrivelse ? `: ${beskrivelse}` : ''}`,
      'aria-pressed': String(nokkel === tilstand.valgtDag),
      onclick: () => { tilstand.valgtDag = nokkel; render(); },
    },
    el('span', { class: 'nr' }, d),
    el('span', { class: 'prikker' }, vondt.map(prikk)),
    rolig ? el('span', { class: 'rolig-merke', 'aria-hidden': 'true' }, '✓') : null));
  }

  rot.replaceChildren(
    el('div', { class: 'maaned-nav' },
      el('button', { class: 'ikonknapp', 'aria-label': 'Forrige måned', onclick: () => byttMaaned(-1) }, '‹'),
      el('h2', {}, storForbokstav(fmtMaaned.format(maaned))),
      el('button', {
        class: 'ikonknapp', 'aria-label': 'Neste måned', disabled: erDenneMaaneden, onclick: () => byttMaaned(1),
      }, '›')),
    el('div', { class: 'ukedager', 'aria-hidden': 'true' },
      ['Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø'].map((d) => el('span', {}, d))),
    el('div', { class: 'kalender' }, dager),
    el('div', { class: 'forklaring' },
      KATEGORIER.map((k) => el('span', {}, prikk(k), k.navn)),
      el('span', {}, el('span', { class: 'rolig-merke' }, '✓'), 'Rolig dag')),
    tilstand.valgtDag
      ? dagDetalj(tilstand.valgtDag)
      : el('p', { class: 'tom' }, 'Trykk på en dag for å se hva som skjedde.'),
  );
}

function byttMaaned(retning) {
  const m = tilstand.visMaaned;
  tilstand.visMaaned = new Date(m.getFullYear(), m.getMonth() + retning, 1);
  const erDenneMaaneden = datoNokkel(tilstand.visMaaned) === datoNokkel(forsteIMaaned(new Date()));
  tilstand.valgtDag = erDenneMaaneden ? datoNokkel(new Date()) : null;
  render();
}

function dagDetalj(nokkel) {
  const dato = fraNokkel(nokkel);
  const erIdag = nokkel === datoNokkel(new Date());
  const registreringer = registreringerPaa(nokkel);

  const nyTid = erIdag ? new Date() : new Date(dato.getFullYear(), dato.getMonth(), dato.getDate(), 12, 0);

  return el('section', { class: 'kort dagdetalj', 'aria-label': 'Valgt dag' },
    el('h3', {}, storForbokstav(fmtDag.format(dato))),
    registreringsliste(registreringer, 'Ingen registreringer denne dagen.'),
    el('button', { class: 'lenkeknapp', onclick: () => apneRegistrering({ dato: nyTid }) }, '+ Legg til'),
    el('h4', {}, 'Oppsummering av dagen'),
    el('p', { class: 'hjelp' }, data.dager[nokkel]
      ? 'Lagret.'
      : 'Ikke oppsummert ennå. Forslaget under er laget ut fra registreringene.'),
    oppsummeringSkjema(nokkel, {
      etterLagring: () => { render(); visMelding('Oppsummeringen er lagret'); },
    }));
}

// ============================================================
// Skjema: ny eller endre registrering
// ============================================================

function apneRegistrering({ registrering = null, dato = new Date() } = {}) {
  const tid = registrering ? new Date(registrering.tid) : dato;
  let valgtKategori = registrering?.kategori ?? null;

  const kategoriknapper = KATEGORIER.map((k) => el('button', {
    type: 'button',
    style: `--farge:${k.farge}`,
    'aria-pressed': String(k.id === valgtKategori),
    onclick: () => {
      valgtKategori = k.id;
      kategoriknapper.forEach((knapp, i) => knapp.setAttribute('aria-pressed', String(KATEGORIER[i].id === k.id)));
    },
  }, prikk(k), k.navn));

  const datofelt = el('input', { type: 'date', id: 'felt-dato', value: datoNokkel(tid), max: datoNokkel(new Date()) });
  const tidsfelt = el('input', { type: 'time', id: 'felt-tid', value: klokke(tid) });
  const notatfelt = el('textarea', { id: 'felt-notat', rows: '4', placeholder: 'For eksempel: spiste pizza, sov dårlig …' },
    registrering?.notat ?? '');
  const feilmelding = el('p', { class: 'feil', role: 'alert' });

  function lagreSkjema() {
    if (!valgtKategori) { feilmelding.textContent = 'Velg hva som gjorde vondt.'; return; }
    if (!datofelt.value || !tidsfelt.value) { feilmelding.textContent = 'Velg dato og klokkeslett.'; return; }

    const [aar, maaned, dag] = datofelt.value.split('-').map(Number);
    const [timer, minutter] = tidsfelt.value.split(':').map(Number);
    const nyTid = new Date(aar, maaned - 1, dag, timer, minutter);
    if (nyTid > new Date()) { feilmelding.textContent = 'Tidspunktet kan ikke være frem i tid.'; return; }

    const notat = notatfelt.value.trim();
    if (registrering) {
      oppdater(registrering.id, { kategori: valgtKategori, tid: nyTid.toISOString(), notat });
    } else {
      leggTil(valgtKategori, nyTid, notat);
    }
    lukkArk();
    render();
    visMelding('Lagret');
  }

  function slettRegistrering() {
    const kopi = { ...registrering };
    slett(registrering.id);
    lukkArk();
    render();
    visMelding('Slettet', [{
      tekst: 'Angre',
      handling: () => { data.registreringer.push(kopi); lagre(); render(); },
    }]);
  }

  apneArk(
    el('h2', {}, registrering ? 'Endre registrering' : 'Ny registrering'),
    el('p', { class: 'felt', id: 'etikett-kategori' }, 'Hva gjorde vondt?'),
    el('div', { class: 'kategorivalg', role: 'group', 'aria-labelledby': 'etikett-kategori' }, kategoriknapper),
    el('div', { class: 'to-felt' },
      el('div', {}, el('label', { class: 'felt', for: 'felt-dato' }, 'Dato'), datofelt),
      el('div', {}, el('label', { class: 'felt', for: 'felt-tid' }, 'Klokkeslett'), tidsfelt)),
    el('label', { class: 'felt', for: 'felt-notat' }, 'Notat (valgfritt)'),
    notatfelt,
    feilmelding,
    el('button', { class: 'primaer', onclick: lagreSkjema }, 'Lagre'),
    registrering ? el('button', { class: 'fareknapp', onclick: slettRegistrering }, 'Slett registreringen') : null,
    el('button', { class: 'sekundaer', onclick: lukkArk }, 'Avbryt'),
  );
}

function apneNotat(id) {
  const registrering = finnRegistrering(id);
  if (!registrering) return;
  const kategori = kategoriFor(registrering.kategori);

  const notatfelt = el('textarea', { id: 'felt-notat', rows: '4', placeholder: 'For eksempel: spiste pizza, sov dårlig …' },
    registrering.notat);

  apneArk(
    el('h2', {}, 'Notat'),
    el('p', { class: 'hjelp' }, `${kategori.navn} kl. ${klokke(new Date(registrering.tid))}`),
    notatfelt,
    el('button', {
      class: 'primaer',
      onclick: () => {
        oppdater(id, { notat: notatfelt.value.trim() });
        lukkArk();
        render();
        visMelding('Notatet er lagret');
      },
    }, 'Lagre notat'),
    el('button', { class: 'sekundaer', onclick: lukkArk }, 'Avbryt'),
  );
  notatfelt.focus();
}

// ============================================================
// Innstillinger og sikkerhetskopi
// ============================================================

function apneInnstillinger() {
  const filvelger = el('input', {
    type: 'file',
    hidden: true,
    onchange: (e) => { if (e.target.files[0]) hentSikkerhetskopi(e.target.files[0]); },
  });
  const antallDager = Object.keys(data.dager).length;

  apneArk(
    el('h2', {}, 'Innstillinger'),
    el('h3', {}, 'Sikkerhetskopi'),
    el('p', {}, 'Alt du registrerer ligger bare på denne telefonen. Ta en kopi innimellom, så mister du ingenting hvis du bytter telefon.'),
    el('p', { class: 'statistikk', id: 'sist-backup' }, data.sistBackup
      ? `Sist lagret: ${fmtDatoTid.format(new Date(data.sistBackup))}`
      : 'Sist lagret: aldri'),
    el('button', { class: 'primaer', onclick: lagreSikkerhetskopi }, 'Lagre sikkerhetskopi'),
    el('p', { class: 'hjelp', style: 'margin-top:8px' }, 'Velg «Arkiver i Filer» og deretter iCloud Drive.'),
    el('button', { class: 'sekundaer', onclick: () => filvelger.click() }, 'Hent sikkerhetskopi'),
    filvelger,
    el('p', { class: 'feil', role: 'status', id: 'innstillinger-status' }),
    el('h3', {}, 'Om Dagbok'),
    el('p', { class: 'statistikk' },
      `${data.registreringer.length} registreringer · ${antallDager} oppsummerte dager`),
    el('p', { class: 'statistikk' }, 'Ingenting blir sendt til internett. Alt blir værende på telefonen din.'),
    el('button', { class: 'sekundaer', onclick: lukkArk }, 'Lukk'),
  );
}

function lagSikkerhetskopiFil() {
  const innhold = { app: 'Dagbok', laget: new Date().toISOString(), kategorier: KATEGORIER, ...data };
  const filnavn = `dagbok-sikkerhetskopi-${datoNokkel(new Date())}.json`;
  return new File([JSON.stringify(innhold, null, 2)], filnavn, { type: 'application/json' });
}

function merkSikkerhetskopiLaget() {
  data.sistBackup = new Date().toISOString();
  lagre();
  const linje = $('#sist-backup');
  if (linje) linje.textContent = `Sist lagret: ${fmtDatoTid.format(new Date(data.sistBackup))}`;
  visMelding('Sikkerhetskopien er laget');
}

function lastNed(fil) {
  const adresse = URL.createObjectURL(fil);
  const lenke = el('a', { href: adresse, download: fil.name });
  document.body.append(lenke);
  lenke.click();
  lenke.remove();
  setTimeout(() => URL.revokeObjectURL(adresse), 2000);
}

function lagreSikkerhetskopi() {
  const fil = lagSikkerhetskopiFil();

  if (navigator.canShare?.({ files: [fil] })) {
    navigator.share({ files: [fil] })
      .then(merkSikkerhetskopiLaget)
      .catch((feil) => {
        if (feil.name === 'AbortError') return; // du lukket delemenyen
        lastNed(fil);
        merkSikkerhetskopiLaget();
      });
  } else {
    lastNed(fil);
    merkSikkerhetskopiLaget();
  }
}

async function hentSikkerhetskopi(fil) {
  let ny;
  try {
    ny = normaliser(JSON.parse(await fil.text()));
  } catch {
    $('#innstillinger-status').textContent = 'Denne filen er ikke en sikkerhetskopi fra Dagbok. Velg en fil som heter «dagbok-sikkerhetskopi-…».';
    return;
  }

  const ok = await bekreft({
    tittel: 'Hente sikkerhetskopien?',
    tekst: `Kopien har ${ny.registreringer.length} registreringer. Den erstatter alt som ligger i appen nå `
      + `(${data.registreringer.length} registreringer).`,
    ja: 'Ja, hent kopien',
  });
  if (!ok) { apneInnstillinger(); return; }

  data = ny;
  lagre();
  lukkArk();
  tilstand.endrerKveld = false;
  render();
  visMelding('Sikkerhetskopien er hentet inn');
}

// ============================================================
// Oppstart
// ============================================================

for (const fane of document.querySelectorAll('.faner button')) {
  fane.addEventListener('click', () => {
    tilstand.visning = fane.dataset.visning;
    render();
    window.scrollTo(0, 0);
  });
}

$('#knapp-innstillinger').addEventListener('click', apneInnstillinger);

// Når du åpner appen igjen en annen dag, start på dagens dato.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || ark.open) return;
  const iDag = datoNokkel(new Date());
  if (iDag !== tilstand.dagNaa) {
    tilstand.dagNaa = iDag;
    tilstand.valgtDag = iDag;
    tilstand.visMaaned = forsteIMaaned(new Date());
    tilstand.endrerKveld = false;
  }
  render();
});

// Be telefonen om å ikke rydde bort dataene, og gjør appen tilgjengelig uten internett.
navigator.storage?.persist?.().catch(() => {});
if ('serviceWorker' in navigator && window.self === window.top) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

render();
