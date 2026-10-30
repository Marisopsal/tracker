'use strict';

// ============================================================
// Oppsett
// ============================================================

// Det du følger med på når appen tas i bruk. Flere kan legges til i appen under Innstillinger.
const STANDARDKATEGORIER = [
  { id: 'mage', navn: 'Magen', farge: 'orange' },
  { id: 'hode', navn: 'Hodet', farge: 'indigo' },
];

// Fargene du kan velge mellom. Selve fargene står i style.css (--c-…), med egne nyanser for mørk modus.
// «lys» betyr at teksten oppå fargen skal være mørk, så den er lett å lese.
const FARGER = [
  { id: 'red', navn: 'Rød' },
  { id: 'orange', navn: 'Oransje' },
  { id: 'yellow', navn: 'Gul', lys: true },
  { id: 'mint', navn: 'Mint', lys: true },
  { id: 'teal', navn: 'Turkis' },
  { id: 'cyan', navn: 'Cyan', lys: true },
  { id: 'blue', navn: 'Blå' },
  { id: 'indigo', navn: 'Indigo' },
  { id: 'purple', navn: 'Lilla' },
  { id: 'pink', navn: 'Rosa' },
  { id: 'brown', navn: 'Brun' },
  { id: 'gray', navn: 'Grå' },
];

// Rekkefølgen appen foreslår farger i for en ny kategori.
const FARGEFORSLAG = ['teal', 'pink', 'blue', 'yellow', 'purple', 'mint', 'cyan', 'red', 'brown', 'gray', 'orange', 'indigo'];

// Fargekoder fra tidligere versjoner av appen, og hvilken farge de blir nå.
const GAMLE_FARGER = {
  '#E8833A': 'orange',
  '#7B6CF0': 'indigo',
  '#2A9D8F': 'teal',
  '#D9577C': 'pink',
  '#3D8BD9': 'blue',
  '#C9A227': 'yellow',
  '#9A6B4F': 'brown',
  '#6B7A8F': 'gray',
  '#9A948C': 'gray',
};

const LAGRINGSNOKKEL = 'dagbok-data';
const DATAVERSJON = 1;

// ============================================================
// Datoer og tid
// ============================================================

const fmtDag = new Intl.DateTimeFormat('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtMaaned = new Intl.DateTimeFormat('nb-NO', { month: 'long', year: 'numeric' });
const fmtDato = new Intl.DateTimeFormat('nb-NO', { dateStyle: 'long' });
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
// Farger
// ============================================================

// Gjør om en lagret farge (navn eller gammel fargekode) til et av fargenavnene over.
function fargenavn(verdi) {
  if (FARGER.some((f) => f.id === verdi)) return verdi;
  return GAMLE_FARGER[String(verdi).toUpperCase()] ?? 'gray';
}

const fargeVar = (id) => `var(--c-${id})`;
const erLysFarge = (id) => FARGER.find((f) => f.id === id)?.lys === true;

// ============================================================
// Lagring – alt ligger bare i telefonens eget lager
// ============================================================

function tomData() {
  return {
    versjon: DATAVERSJON,
    kategorier: STANDARDKATEGORIER.map((k) => ({ ...k })),
    registreringer: [],
    startet: datoNokkel(new Date()),
    sistBackup: null,
  };
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

  const kategorier = [];
  for (const k of Array.isArray(raadata.kategorier) ? raadata.kategorier : []) {
    const gyldig = k && typeof k.id === 'string' && typeof k.navn === 'string';
    if (!gyldig || kategorier.some((annen) => annen.id === k.id)) continue;
    const kategori = { id: k.id, navn: k.navn, farge: fargenavn(k.farge) };
    if (k.skjult === true) kategori.skjult = true;
    kategorier.push(kategori);
  }
  if (kategorier.length === 0) kategorier.push(...STANDARDKATEGORIER.map((k) => ({ ...k })));
  // En registrering med en ukjent kategori får en grå kategori, så ingenting forsvinner.
  for (const r of registreringer) {
    if (!kategorier.some((k) => k.id === r.kategori)) {
      kategorier.push({ id: r.kategori, navn: storForbokstav(r.kategori), farge: 'gray' });
    }
  }
  if (!kategorier.some((k) => !k.skjult)) delete kategorier[0].skjult;

  // Dagen appen ble tatt i bruk. Mangler den, brukes den tidligste registreringen eller i dag.
  const tidligste = registreringer.reduce((min, r) => (r.tid < min ? r.tid : min), new Date().toISOString());
  const startet = /^\d{4}-\d{2}-\d{2}$/.test(raadata.startet) ? raadata.startet : datoNokkel(new Date(tidligste));

  return {
    versjon: DATAVERSJON,
    kategorier,
    registreringer,
    startet,
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
  if (!tekst) {
    // Første gang: lagre med en gang, så appen husker hvilken dag du begynte.
    const ny = tomData();
    try { localStorage.setItem(LAGRINGSNOKKEL, JSON.stringify(ny)); } catch {}
    return ny;
  }

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
  return data.kategorier.find((k) => k.id === id) ?? { id, navn: id, farge: 'gray' };
}

// Kategoriene som har rute på startsiden.
function aktiveKategorier() {
  return data.kategorier.filter((k) => !k.skjult);
}

function antallRegistreringer(kategoriId) {
  return data.registreringer.filter((r) => r.kategori === kategoriId).length;
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

// Første dag appen har oversikt over: dagen du begynte, eller en tidligere dag du har registrert i etterkant.
function forsteDag() {
  let forste = data.startet;
  for (const r of data.registreringer) {
    const nokkel = datoNokkel(new Date(r.tid));
    if (nokkel < forste) forste = nokkel;
  }
  return forste;
}

// Hva gjorde vondt denne dagen? En dag uten registreringer er en dag uten vondt,
// men bare når dagen er over og appen var i bruk.
function dagStatus(nokkel, registreringer, { iDag, fraDag }) {
  const vondt = data.kategorier.filter((k) => registreringer.some((r) => r.kategori === k.id));
  const rolig = registreringer.length === 0 && nokkel < iDag && nokkel >= fraDag;
  return { vondt, rolig };
}

function leggTil(kategori, tid, notat = '') {
  const registrering = { id: nyId(), kategori, tid: tid.toISOString(), notat };
  data.registreringer.push(registrering);
  lagre();
  return registrering;
}

function oppdater(id, endringer) {
  const registrering = finnRegistrering(id);
  if (!registrering) return;
  Object.assign(registrering, endringer);
  lagre();
}

function slett(id) {
  data.registreringer = data.registreringer.filter((r) => r.id !== id);
  lagre();
}

// ============================================================
// Små hjelpere for skjermen
// ============================================================

const $ = (velger) => document.querySelector(velger);

const redusertBevegelse = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  for (const b of barn.flat(Infinity)) {
    if (b != null && b !== false) element.append(b);
  }
  return element;
}

// Små symboler, tegnet med streker.
const IKONER = {
  pil: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
  venstre: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  hake: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  pluss: '<path d="M12 5v14M5 12h14"/>',
  kryss: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  klokke: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
  plussSirkel: '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="M12 7.5v9M7.5 12h9" style="stroke:var(--kort)"/>',
  del: '<path d="M12 3.5v11"/><path d="M8 7.5l4-4 4 4"/><path d="M8.5 10.5H7a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5a2 2 0 0 0-2-2h-1.5"/>',
};

function ikon(navn, klasse = '') {
  const mal = document.createElement('template');
  mal.innerHTML = `<svg class="${klasse}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" `
    + `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IKONER[navn]}</svg>`;
  return mal.content.firstChild;
}

const forbokstav = (navn) => ([...navn.trim()][0] ?? '').toUpperCase();
const fargeStil = (farge) => `--farge:${fargeVar(farge)}`;

const prikk = (kategori) => el('span', { class: 'prikk', style: fargeStil(kategori.farge), 'aria-hidden': 'true' });

// Farget firkant med forbokstav, som ikonene i Innstillinger.
function kategoriIkon(kategori) {
  return el('span', {
    class: erLysFarge(kategori.farge) ? 'kat-ikon lys' : 'kat-ikon',
    style: fargeStil(kategori.farge),
    'aria-hidden': 'true',
  }, forbokstav(kategori.navn));
}

// En gruppe som i Innstillinger: liten overskrift, rader i et kort og en liten forklaring under.
function gruppe({ tittel, fot, klasse, kortKlasse, etikett } = {}, ...rader) {
  const innhold = rader.flat(Infinity).filter(Boolean);
  return el('section', { class: klasse ? `gruppe ${klasse}` : 'gruppe', 'aria-label': etikett },
    tittel ? el('h2', { class: 'gruppe-tittel' }, tittel) : null,
    innhold.length ? el('div', { class: kortKlasse ? `gruppe-kort ${kortKlasse}` : 'gruppe-kort' }, innhold) : null,
    fot ? el('p', { class: 'gruppe-fot' }, fot) : null);
}

// En rad: ikon til venstre, tekst og undertekst, verdi til høyre, og pil eller hake.
function rad({ ikon: radIkon, tekst, undertekst, verdi, pil, valgt, klasse, onclick, aria, id } = {}) {
  const klasser = ['rad', radIkon && 'med-ikon', klasse].filter(Boolean).join(' ');
  return el(onclick ? 'button' : 'div', {
    class: klasser,
    type: onclick ? 'button' : null,
    id,
    onclick,
    'aria-label': aria,
    'aria-pressed': valgt == null ? null : String(valgt),
  },
  radIkon,
  el('span', { class: 'rad-tekst' }, el('span', {}, tekst), undertekst ? el('span', { class: 'rad-under' }, undertekst) : null),
  verdi != null ? el('span', { class: 'rad-verdi' }, verdi) : null,
  valgt != null ? el('span', { class: 'rad-hake', 'aria-hidden': 'true' }, ikon('hake')) : null,
  pil ? el('span', { class: 'rad-pil', 'aria-hidden': 'true' }, ikon('pil')) : null);
}

// Et lite dunk i hånden. iPhone (iOS 18 og nyere) gir det når en bryter slås av eller på.
function haptisk() {
  $('#haptikk')?.click();
  navigator.vibrate?.(8);
}

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

// ============================================================
// Ark som glir opp nedenfra, og varsel midt på skjermen
// ============================================================

const ark = $('#ark');
let lukkTimer;

// Åpner arket med ✕ til venstre, tittel i midten og en blå ✓ til høyre hvis noe skal lagres.
function apneArk({ tittel, lukk = lukkArk, lagre: vedLagring = null }, ...innhold) {
  clearTimeout(lukkTimer);
  ark.classList.remove('lukker');
  ark.replaceChildren(el('div', { class: 'ark-innhold' },
    el('header', { class: 'ark-hode' },
      el('button', {
        class: 'rundknapp glass', id: 'ark-lukk', 'aria-label': vedLagring ? 'Avbryt' : 'Lukk', onclick: lukk,
      }, ikon('kryss')),
      el('h2', {}, tittel),
      vedLagring
        ? el('button', { class: 'rundknapp bekreft', id: 'ark-lagre', 'aria-label': 'Lagre', onclick: vedLagring }, ikon('hake'))
        : el('span')),
    innhold));

  if (!ark.open) {
    document.documentElement.style.setProperty('--skala-origo', `${window.scrollY + window.innerHeight / 2}px`);
    ark.showModal();
    document.documentElement.classList.add('ark-apen');
  }
  ark.scrollTop = 0;
}

function lukkArk() {
  if (!ark.open) return;
  document.documentElement.classList.remove('ark-apen');
  if (redusertBevegelse()) { ark.close(); return; }
  ark.classList.add('lukker');
  lukkTimer = setTimeout(() => ark.close(), 230);
}

ark.addEventListener('close', () => {
  ark.classList.remove('lukker');
  document.documentElement.classList.remove('ark-apen');
});

// Escape og trykk utenfor arket lukker det med animasjon.
ark.addEventListener('cancel', (e) => { e.preventDefault(); lukkArk(); });
ark.addEventListener('click', (e) => { if (e.target === ark) lukkArk(); });

const varsel = $('#varsel');

// Spør før noe som ikke kan angres. Gir true for ja og false for avbryt.
function bekreft({ tittel, tekst, ja, fare = false }) {
  return new Promise((svar) => {
    const velg = (verdi) => { varsel.close(); svar(verdi); };
    varsel.replaceChildren(
      el('h2', {}, tittel),
      el('p', {}, tekst),
      el('div', { class: 'varsel-knapper' },
        el('button', { onclick: () => velg(false) }, 'Avbryt'),
        el('button', { class: fare ? 'fare' : null, onclick: () => velg(true) }, ja)));
    varsel.showModal();
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
};

function render() {
  const erIdag = tilstand.visning === 'idag';
  const tittel = erIdag ? 'I dag' : 'Kalender';
  $('#vis-idag').hidden = !erIdag;
  $('#vis-kalender').hidden = erIdag;
  $('#tittel').textContent = tittel;
  $('#navlinje-tittel').textContent = tittel;
  $('#overtittel').textContent = erIdag ? fmtDag.format(new Date()) : '';
  for (const fane of document.querySelectorAll('.fanelinje button')) {
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
  const registreringer = registreringerPaa(datoNokkel(new Date()));
  const rot = $('#vis-idag');
  rot.replaceChildren();

  if (visInstallasjonstips()) {
    rot.append(el('div', { class: 'tips' },
      ikon('del'),
      el('p', {},
        el('strong', {}, 'Legg Dagbok på Hjem-skjermen'),
        'Trykk på Del-knappen i Safari og velg «Legg til på Hjem-skjerm». ',
        'Bruk alltid ikonet etterpå. Det du registrerer her i Safari blir ikke med.')));
  }

  rot.append(
    el('div', { class: 'ruter' }, aktiveKategorier().map((k) => rute(k, registreringer))),
    el('button', { class: 'tintknapp', onclick: () => apneRegistrering({ dato: new Date() }) },
      ikon('klokke'), 'Registrer for et annet tidspunkt'),
    gruppe({ tittel: 'Registrert i dag', kortKlasse: 'liste' },
      registreringer.length
        ? registreringer.map(registreringsrad)
        : rad({ klasse: 'dempet', tekst: 'Ingenting registrert ennå' })),
  );
}

function rute(kategori, registreringerIdag) {
  const antall = registreringerIdag.filter((r) => r.kategori === kategori.id).length;
  return el('button', {
    class: erLysFarge(kategori.farge) ? 'rute lys' : 'rute',
    style: fargeStil(kategori.farge),
    'data-kategori': kategori.id,
    'aria-label': `${kategori.navn}, ${antall ? `${antall} i dag` : 'ingen i dag'}. Trykk for å registrere nå.`,
    onclick: () => hurtigRegistrer(kategori),
  },
  el('span', { class: 'rute-ikon' }, ikon('pluss', 'ikon-pluss'), ikon('hake', 'ikon-hake')),
  el('span', {},
    el('span', { class: 'rute-navn' }, kategori.navn),
    el('span', { class: 'rute-hint' }, antall ? `${antall} i dag` : 'Ingen i dag')));
}

function hurtigRegistrer(kategori) {
  haptisk();
  const naa = new Date();
  const registrering = leggTil(kategori.id, naa);

  render();
  const ruten = $(`.rute[data-kategori="${CSS.escape(kategori.id)}"]`);
  ruten?.classList.add('registrert');
  setTimeout(() => ruten?.classList.remove('registrert'), 1400);

  visMelding(`${kategori.navn} registrert kl. ${klokke(naa)}`, [
    { tekst: 'Notat', handling: () => apneNotat(registrering.id) },
    {
      tekst: 'Angre',
      handling: () => {
        slett(registrering.id);
        render();
        visMelding('Angret');
      },
    },
  ]);
}

function registreringsrad(registrering) {
  const kategori = kategoriFor(registrering.kategori);
  const tid = klokke(new Date(registrering.tid));
  return rad({
    klasse: 'post',
    ikon: kategoriIkon(kategori),
    tekst: kategori.navn,
    undertekst: registrering.notat || null,
    verdi: tid,
    pil: true,
    aria: `${kategori.navn} kl. ${tid}${registrering.notat ? `, ${registrering.notat}` : ''}. Trykk for å endre.`,
    onclick: () => apneRegistrering({ registrering }),
  });
}

function visInstallasjonstips() {
  const erIos = /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const paaHjemskjerm = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const iRamme = window.self !== window.top;
  return erIos && !paaHjemskjerm && !iRamme;
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
  const fraDag = forsteDag();

  const dager = [];
  const tommeFoer = (maaned.getDay() + 6) % 7; // uka starter på mandag
  for (let i = 0; i < tommeFoer; i++) dager.push(el('span', { 'aria-hidden': 'true' }));

  const antallDager = new Date(maaned.getFullYear(), maaned.getMonth() + 1, 0).getDate();
  for (let d = 1; d <= antallDager; d++) {
    const dato = new Date(maaned.getFullYear(), maaned.getMonth(), d);
    const nokkel = datoNokkel(dato);
    const { vondt, rolig } = dagStatus(nokkel, perDag.get(nokkel) ?? [], { iDag, fraDag });
    const beskrivelse = vondt.length ? vondt.map((k) => k.navn).join(' og ') : rolig ? 'ingen vondt' : '';

    dager.push(el('button', {
      class: ['dag', nokkel === iDag && 'i-dag', nokkel === tilstand.valgtDag && 'valgt'].filter(Boolean).join(' '),
      disabled: nokkel > iDag,
      'aria-label': `${fmtDag.format(dato)}${beskrivelse ? `: ${beskrivelse}` : ''}`,
      'aria-pressed': String(nokkel === tilstand.valgtDag),
      onclick: () => { tilstand.valgtDag = nokkel; render(); },
    },
    el('span', { class: 'nr' }, d),
    el('span', { class: 'merker' }, vondt.map(prikk), rolig ? ikon('hake', 'rolig-merke') : null)));
  }

  rot.replaceChildren(
    el('div', { class: 'kalenderkort' },
      el('div', { class: 'maaned-nav' },
        el('h2', {}, storForbokstav(fmtMaaned.format(maaned))),
        el('div', { class: 'maaned-knapper' },
          el('button', { 'aria-label': 'Forrige måned', onclick: () => byttMaaned(-1) }, ikon('venstre')),
          el('button', { 'aria-label': 'Neste måned', disabled: erDenneMaaneden, onclick: () => byttMaaned(1) }, ikon('pil')))),
      el('div', { class: 'ukedager', 'aria-hidden': 'true' },
        ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'].map((d) => el('span', {}, d))),
      el('div', { class: 'kalender' }, dager)),
    el('div', { class: 'forklaring' },
      data.kategorier
        .filter((k) => !k.skjult || antallRegistreringer(k.id) > 0)
        .map((k) => el('span', {}, prikk(k), k.navn)),
      el('span', {}, ikon('hake', 'rolig-merke'), 'Ingen vondt')),
    tilstand.valgtDag
      ? dagDetalj(tilstand.valgtDag)
      : el('p', { class: 'gruppe-fot' }, 'Trykk på en dag for å se hva som skjedde.'),
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
  const iDag = datoNokkel(new Date());
  const erIdag = nokkel === iDag;
  const registreringer = registreringerPaa(nokkel);
  const { rolig } = dagStatus(nokkel, registreringer, { iDag, fraDag: forsteDag() });

  const nyTid = erIdag ? new Date() : new Date(dato.getFullYear(), dato.getMonth(), dato.getDate(), 12, 0);
  let tomRad = null;
  if (registreringer.length === 0) {
    tomRad = rolig
      ? rad({ ikon: el('span', { class: 'gronn-ikon' }, ikon('hake')), tekst: 'Ingen vondt denne dagen' })
      : rad({ klasse: 'dempet', tekst: erIdag ? 'Ingenting registrert ennå' : 'Ingen registreringer denne dagen' });
  }

  return gruppe({ tittel: storForbokstav(fmtDag.format(dato)), klasse: 'dagdetalj', etikett: 'Valgt dag' },
    registreringer.map(registreringsrad),
    tomRad,
    rad({
      klasse: 'tint',
      ikon: el('span', { class: 'tint-ikon' }, ikon('plussSirkel')),
      tekst: 'Legg til registrering',
      onclick: () => apneRegistrering({ dato: nyTid }),
    }));
}

// ============================================================
// Skjema: ny eller endre registrering
// ============================================================

function apneRegistrering({ registrering = null, dato = new Date() } = {}) {
  const tid = registrering ? new Date(registrering.tid) : dato;
  let valgtKategori = registrering?.kategori ?? null;

  // Kategorier som er fjernet fra startsiden vises bare når du endrer en registrering som har dem.
  const valg = data.kategorier.filter((k) => !k.skjult || k.id === valgtKategori);
  const valgrader = valg.map((k) => rad({
    ikon: kategoriIkon(k),
    tekst: k.navn,
    valgt: k.id === valgtKategori,
    onclick: () => {
      valgtKategori = k.id;
      valgrader.forEach((r, i) => r.setAttribute('aria-pressed', String(valg[i].id === k.id)));
    },
  }));

  const datofelt = el('input', {
    type: 'date', id: 'felt-dato', class: 'pille', value: datoNokkel(tid), max: datoNokkel(new Date()),
  });
  const tidsfelt = el('input', { type: 'time', id: 'felt-tid', class: 'pille', value: klokke(tid) });
  const notatfelt = el('textarea', {
    id: 'felt-notat', class: 'notatfelt', rows: '4', 'aria-label': 'Notat',
    placeholder: 'Valgfritt. For eksempel: spiste pizza, sov dårlig …',
  }, registrering?.notat ?? '');
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
    haptisk();
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

  apneArk({ tittel: registrering ? 'Endre registrering' : 'Ny registrering', lagre: lagreSkjema },
    feilmelding,
    gruppe({ tittel: 'Hva gjorde vondt?', kortKlasse: 'kategorivalg' }, valgrader),
    gruppe({ tittel: 'Tidspunkt' },
      el('label', { class: 'rad', for: 'felt-dato' }, el('span', { class: 'rad-tekst' }, 'Dato'), datofelt),
      el('label', { class: 'rad', for: 'felt-tid' }, el('span', { class: 'rad-tekst' }, 'Klokkeslett'), tidsfelt)),
    gruppe({ tittel: 'Notat' }, notatfelt),
    registrering ? gruppe({}, rad({ klasse: 'fare', tekst: 'Slett registrering', onclick: slettRegistrering })) : null);
}

function apneNotat(id) {
  const registrering = finnRegistrering(id);
  if (!registrering) return;
  const kategori = kategoriFor(registrering.kategori);

  const notatfelt = el('textarea', {
    id: 'felt-notat', class: 'notatfelt', rows: '4', 'aria-label': 'Notat',
    placeholder: 'For eksempel: spiste pizza, sov dårlig …',
  }, registrering.notat);

  apneArk({
    tittel: 'Notat',
    lagre: () => {
      oppdater(id, { notat: notatfelt.value.trim() });
      lukkArk();
      render();
      visMelding('Notatet er lagret');
    },
  },
  gruppe({ tittel: `${kategori.navn} kl. ${klokke(new Date(registrering.tid))}` }, notatfelt));
  notatfelt.focus();
}

// ============================================================
// Skjema: ny eller endre kategori
// ============================================================

function apneKategori(kategori = null) {
  const andre = data.kategorier.filter((k) => k !== kategori);
  const ledigFarge = FARGEFORSLAG.find((id) => !andre.some((k) => k.farge === id)) ?? FARGEFORSLAG[0];
  let valgtFarge = kategori?.farge ?? ledigFarge;

  const stor = el('span', {
    class: erLysFarge(valgtFarge) ? 'kat-stor lys' : 'kat-stor', style: fargeStil(valgtFarge), 'aria-hidden': 'true',
  }, forbokstav(kategori?.navn ?? '') || '?');

  const navnefelt = el('input', {
    type: 'text', id: 'felt-kategorinavn', class: 'navnefelt', value: kategori?.navn ?? '', maxlength: '24',
    placeholder: 'Navn, for eksempel Kvalme', autocomplete: 'off',
    oninput: (e) => { stor.textContent = forbokstav(e.target.value) || '?'; },
  });

  const fargeknapper = FARGER.map((f) => el('button', {
    type: 'button',
    class: 'fargevalg',
    style: fargeStil(f.id),
    'aria-label': f.navn,
    'aria-pressed': String(f.id === valgtFarge),
    onclick: () => {
      valgtFarge = f.id;
      fargeknapper.forEach((knapp, i) => knapp.setAttribute('aria-pressed', String(FARGER[i].id === valgtFarge)));
      stor.style.cssText = fargeStil(valgtFarge);
      stor.classList.toggle('lys', erLysFarge(valgtFarge));
    },
  }));
  const feilmelding = el('p', { class: 'feil', role: 'alert' });

  const antall = kategori ? antallRegistreringer(kategori.id) : 0;
  const erSisteAktive = Boolean(kategori) && !kategori.skjult && aktiveKategorier().length === 1;

  function ferdig() {
    lagre();
    render();
    apneInnstillinger();
  }

  function lagreKategori() {
    const navn = navnefelt.value.trim();
    if (!navn) { feilmelding.textContent = 'Skriv et navn.'; return; }
    if (andre.some((k) => k.navn.toLowerCase() === navn.toLowerCase())) {
      feilmelding.textContent = `Du har allerede «${navn}». Velg et annet navn.`;
      return;
    }
    if (kategori) Object.assign(kategori, { navn, farge: valgtFarge });
    else data.kategorier.push({ id: nyId(), navn, farge: valgtFarge });
    haptisk();
    ferdig();
  }

  const handlinger = [];
  let forklaring = null;
  if (kategori?.skjult) {
    handlinger.push(rad({ klasse: 'tint', tekst: 'Vis på startsiden igjen', onclick: () => { delete kategori.skjult; ferdig(); } }));
  } else if (kategori && antall > 0 && !erSisteAktive) {
    handlinger.push(rad({ klasse: 'fare', tekst: 'Fjern fra startsiden', onclick: () => { kategori.skjult = true; ferdig(); } }));
    forklaring = antall === 1
      ? 'Registreringen blir liggende i kalenderen.'
      : `De ${antall} registreringene blir liggende i kalenderen.`;
  }
  if (kategori && antall === 0 && !erSisteAktive) {
    handlinger.push(rad({ klasse: 'fare', tekst: 'Slett kategori', onclick: () => { data.kategorier = andre; ferdig(); } }));
  }
  if (erSisteAktive) forklaring = 'Du må ha minst én kategori på startsiden, så denne kan ikke fjernes.';

  apneArk({ tittel: kategori ? 'Endre kategori' : 'Ny kategori', lukk: apneInnstillinger, lagre: lagreKategori },
    feilmelding,
    el('div', { class: 'kat-topp' },
      stor,
      el('label', { class: 'skjult-etikett', for: 'felt-kategorinavn' }, 'Navn'),
      navnefelt),
    el('div', { class: 'fargevalg-rad', role: 'group', 'aria-label': 'Farge' }, fargeknapper),
    handlinger.length || forklaring ? gruppe({ fot: forklaring }, handlinger) : null);
}

// ============================================================
// Innstillinger og sikkerhetskopi
// ============================================================

function sistLagretTekst() {
  return data.sistBackup
    ? `Sist lagret ${fmtDatoTid.format(new Date(data.sistBackup))}.`
    : 'Du har ikke tatt en sikkerhetskopi ennå.';
}

function apneInnstillinger() {
  const filvelger = el('input', {
    type: 'file',
    hidden: true,
    onchange: (e) => {
      const fil = e.target.files[0];
      e.target.value = ''; // så samme fil kan velges igjen etter «Avbryt»
      if (fil) hentSikkerhetskopi(fil);
    },
  });

  apneArk({ tittel: 'Innstillinger' },
    gruppe({ tittel: 'Det du følger med på' },
      data.kategorier.map((k) => rad({
        klasse: 'post',
        ikon: kategoriIkon(k),
        tekst: k.navn,
        undertekst: k.skjult ? 'Ikke på startsiden' : null,
        pil: true,
        aria: `${k.navn}${k.skjult ? ', ikke på startsiden' : ''}. Trykk for å endre.`,
        onclick: () => apneKategori(k),
      })),
      rad({
        klasse: 'tint',
        ikon: el('span', { class: 'tint-ikon' }, ikon('plussSirkel')),
        tekst: 'Ny kategori',
        onclick: () => apneKategori(),
      })),
    gruppe({
      tittel: 'Sikkerhetskopi',
      fot: [
        el('span', { id: 'sist-backup' }, sistLagretTekst()),
        ' Velg «Arkiver i Filer» og deretter iCloud Drive. Alt du registrerer ligger bare på denne telefonen.',
      ],
    },
    rad({ klasse: 'tint', tekst: 'Lagre sikkerhetskopi', onclick: lagreSikkerhetskopi }),
    rad({ klasse: 'tint', tekst: 'Hent sikkerhetskopi', onclick: () => filvelger.click() })),
    filvelger,
    el('p', { class: 'feil', role: 'status', id: 'innstillinger-status' }),
    gruppe({ tittel: 'Om Dagbok', fot: 'Ingenting blir sendt til internett. Alt blir værende på telefonen din.' },
      rad({ tekst: 'Registreringer', verdi: String(data.registreringer.length) }),
      rad({ tekst: 'I bruk siden', verdi: fmtDato.format(fraNokkel(forsteDag())) })));
}

function lagSikkerhetskopiFil() {
  const innhold = { app: 'Dagbok', laget: new Date().toISOString(), ...data };
  const filnavn = `dagbok-sikkerhetskopi-${datoNokkel(new Date())}.json`;
  return new File([JSON.stringify(innhold, null, 2)], filnavn, { type: 'application/json' });
}

function merkSikkerhetskopiLaget() {
  data.sistBackup = new Date().toISOString();
  lagre();
  const linje = $('#sist-backup');
  if (linje) linje.textContent = sistLagretTekst();
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
    ja: 'Erstatt',
    fare: true,
  });
  if (!ok) return;

  data = ny;
  lagre();
  lukkArk();
  render();
  visMelding('Sikkerhetskopien er hentet inn');
}

// ============================================================
// Oppstart
// ============================================================

for (const fane of document.querySelectorAll('.fanelinje button')) {
  fane.addEventListener('click', () => {
    tilstand.visning = fane.dataset.visning;
    render();
    window.scrollTo(0, 0);
  });
}

$('#knapp-innstillinger').addEventListener('click', apneInnstillinger);

// Den lille tittelen øverst kommer frem når den store tittelen er blad forbi.
const navlinje = $('#navlinje');
new IntersectionObserver(([oppforing]) => {
  navlinje.classList.toggle('synlig', !oppforing.isIntersecting);
}, { rootMargin: `-${Math.round(navlinje.getBoundingClientRect().height)}px 0px 0px 0px` }).observe($('#tittel'));

// Når du åpner appen igjen en annen dag, start på dagens dato.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || ark.open) return;
  const iDag = datoNokkel(new Date());
  if (iDag !== tilstand.dagNaa) {
    tilstand.dagNaa = iDag;
    tilstand.valgtDag = iDag;
    tilstand.visMaaned = forsteIMaaned(new Date());
  }
  render();
});

// Be telefonen om å ikke rydde bort dataene, og gjør appen tilgjengelig uten internett.
navigator.storage?.persist?.().catch(() => {});
if ('serviceWorker' in navigator && window.self === window.top) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

render();
