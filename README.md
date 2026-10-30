# Dagbok – vondt i magen og hodet

En enkel app for iPhone der du registrerer når du har vondt i magen eller i hodet, og ser alt i en kalender.

- **Ett trykk** på «Magen» eller «Hodet» lagrer tidspunktet. Du kan legge til et notat hvis du vil.
- **Kalenderen** viser fargede prikker: oransje for magen, lilla for hodet. Trykk på en dag for å se, rette eller legge til noe.
- **Grønn hake** betyr ingen vondt. Hver dag uten registreringer får en hake når dagen er over. Det gjelder fra dagen du begynte å bruke appen.
- **Alt lagres bare på telefonen din.** Ingenting blir sendt til internett.

## Slik får du appen på telefonen

1. Åpn **https://marisopsal.github.io/tracker/** i **Safari**.
2. Trykk på **Del-knappen**, firkanten med pil opp.
3. Velg **«Legg til på Hjem-skjerm»** og trykk **Legg til**.

Nå har du et ikon som heter *Dagbok*. Appen virker også uten internett.

## Tre regler å huske

1. **Åpne alltid appen fra ikonet** på Hjem-skjermen, ikke fra Safari. Det er to forskjellige lagre.
2. **Ikke slett ikonet.** Da forsvinner det du har registrert.
3. **Ta en sikkerhetskopi innimellom:** tannhjulet → «Lagre sikkerhetskopi» → «Arkiver i Filer» → iCloud Drive.

Bytter du telefon, legger du appen på Hjem-skjermen på den nye telefonen og velger «Hent sikkerhetskopi».

## For den som skal endre appen

Appen er vanlig HTML, CSS og JavaScript, uten byggesteg:

| Fil | Hva den gjør |
|---|---|
| `index.html` | Selve siden |
| `style.css` | Utseende, lys og mørk modus |
| `app.js` | All logikk. Kategoriene (mage, hode) står øverst i `KATEGORIER`. |
| `sw.js` | Gjør at appen virker uten internett. **Øk `CACHE`-versjonen når du endrer noe**, ellers får ikke telefonen den nye versjonen. |
| `manifest.webmanifest`, `icons/` | Navn og ikon på Hjem-skjermen |

Dataene ligger i `localStorage` under nøkkelen `dagbok-data`.
