# eid-wallet-it-forms

Web forms utility per l'Italian eID Wallet – form di onboarding per Fonti Autentiche.

## Funzionalità

- **Catalogo webform** da `webforms-manifest.json`: per ogni voce, schema JSON e JSON di esempio sono caricati **solo da URL** (es. [`eid-wallet-it-docs` / authentic-sources](https://github.com/italia/eid-wallet-it-docs/tree/versione-corrente/handbooks/it/authentic-sources)), senza duplicati nel repo
- **Form interattivo** basato sullo schema pubblicato in [`json-schemas`](https://github.com/italia/eid-wallet-it-docs/tree/versione-corrente/handbooks/it/authentic-sources/json-schemas)
- **Salvataggio locale** nel browser (localStorage) con lista dei form salvati (nome e data)
- **Validazione in-browser** secondo [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/json-schema-core.html) (via [AJV 8](https://github.com/ajv-validator/ajv))
- **Esportazione** in JSON e CSV
- **Importazione** da JSON e CSV
- **Caricamento esempio** con dati di esempio pre-compilati

## Utilizzo

Visita la [GitHub Pages del progetto](https://italia.github.io/eid-wallet-it-forms/) oppure apri `index.html` da un server locale.

### Sviluppo locale

```bash
make serve
# oppure: python3 -m http.server 8080
# poi apri http://127.0.0.1:8080
```

Per usare un altro manifest (URL assoluto o path): `form.html?manifest=https://…/altro-manifest.json&webform=id-voce`

## Struttura

```
├── index.html              # Catalogo webform + elenco bozze salvate
├── form.html               # Editor (query: webform, id, manifest)
├── webforms-manifest.json  # Elenco webform con schemaUrl e dataUrl remoti
└── assets/
    ├── css/style.css
    └── js/
        ├── storage.js
        ├── csv-utils.js
        └── form-utils.js   # Manifest, schema, validazione, toast
```

## Schema di riferimento

Gli URL effettivi sono definiti in `webforms-manifest.json` e puntano alle risorse in
[`italia/eid-wallet-it-docs` (authentic-sources)](https://github.com/italia/eid-wallet-it-docs/tree/versione-corrente/handbooks/it/authentic-sources) e altre eventuali.

## Licenza

Vedi [LICENSE](LICENSE).
