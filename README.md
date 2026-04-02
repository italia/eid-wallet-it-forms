# IT-Wallet Webforms

Repository: [`italia/eid-wallet-it-forms`](https://github.com/italia/eid-wallet-it-forms). Catalogo e editor di webform basati su JSON Schema e JSON di esempio remoti.

## Funzionalità

- **Catalogo webform** (`webforms-manifest.json`): ogni voce ha i **propri** `schemaUrl` e `dataUrl` (solo URL, senza duplicare numeri di versione). Non esiste un unico schema condiviso da tutti i webform. **Le versioni** che vedi in interfaccia provengono dai **file scaricati**: nel JSON Schema tipicamente `$version` e `$id`; nel JSON di esempio / bozza campi come `metadata.versione` e `$schema` (convenzioni effettive dipendono da ogni coppia di file).
- **Editor interattivo**: aprendo una voce del catalogo, l’app scarica **solo** lo schema e il JSON associati a quella voce e costruisce il form di conseguenza. Le bozze salvate ricordano il `webform_id` così, alla riapertura, si ricaricano le stesse risorse remote.
- **Esempio attuale “fonte autentica / EAA”**: la voce `authentic-sources-eaa` punta allo schema in [`eid-wallet-it-docs` … / json-schemas](https://github.com/italia/eid-wallet-it-docs/tree/versione-corrente/handbooks/it/authentic-sources/json-schemas) e al file di esempio nella [cartella authentic-sources](https://github.com/italia/eid-wallet-it-docs/tree/versione-corrente/handbooks/it/authentic-sources). **Altri webform** andranno aggiunti al manifest con **altri** `schemaUrl` / `dataUrl` (altri schemi e altri JSON).
- **Salvataggio locale** nel browser (localStorage) con lista delle bozze (nome e data)
- **Validazione in-browser** del dato rispetto allo **schema della voce selezionata**, secondo [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/json-schema-core.html) (via [AJV 8](https://github.com/ajv-validator/ajv))
- **Esportazione** in JSON e CSV (struttura generica ad albero)
- **Importazione** da JSON e CSV
- **Carica esempio**: ricarica il JSON da `dataUrl`; la fascia versioni si aggiorna in base al contenuto di quel JSON e allo schema remoto

## Utilizzo

Visita la [GitHub Pages del progetto](https://italia.github.io/eid-wallet-it-forms/) oppure apri `index.html` da un server locale.

### Sviluppo locale

```bash
make serve
# oppure: python3 -m http.server 8080
# poi apri http://127.0.0.1:8080
```

Sulla home, **Catalogo webform** (`#catalog`, landing) e **Bozze webform salvate** (`#bozze`) sono due viste con la navbar.

Per usare un altro manifest (URL assoluto o path): `form.html?manifest=https://…/altro-manifest.json&webform=id-voce`

## Struttura

```
├── index.html              # Catalogo webform + elenco bozze salvate
├── form.html               # Editor (query: webform, id, manifest)
├── webforms-manifest.json  # webforms[]: schemaUrl, dataUrl (niente versione: è nei file remoti)
└── assets/
    ├── css/style.css
    └── js/
        ├── storage.js
        ├── csv-utils.js
        └── form-utils.js   # Manifest, estrazione versioni da schema/JSON, validazione, toast
```

## Schema e JSON di riferimento

Gli URL sono nel manifest; **numeri e identificativi di versione** si leggono nei file stessi dopo il download (vedi `extractDocumentVersioning` in `form-utils.js`). Oggi è configurato solo *authentic-sources / EAA*; nuove voci = nuove coppie `schemaUrl` + `dataUrl`.

## Licenza

Vedi [LICENSE](LICENSE).
