# eid-wallet-it-forms

Web forms utility per l'Italian eID Wallet – form di onboarding per Fonti Autentiche.

## Funzionalità

- **Form interattivo** basato sullo schema JSON [`schema-validazione-form-onboarding-fonte-autentica`](https://github.com/italia/eid-wallet-it-docs/tree/versione-corrente/handbooks/it/authentic-sources/json-schemas)
- **Salvataggio locale** nel browser (localStorage) con lista dei form salvati (nome e data)
- **Validazione in-browser** secondo JSON Schema Draft 2020-12 (via AJV 8)
- **Esportazione** in JSON e CSV
- **Importazione** da JSON e CSV
- **Caricamento esempio** con dati di esempio pre-compilati

## Utilizzo

Visita la [GitHub Pages del progetto](https://italia.github.io/eid-wallet-it-forms/) oppure apri `index.html` da un server locale.

### Sviluppo locale

```bash
python3 -m http.server 8080
# poi apri http://localhost:8080
```

## Struttura

```
├── index.html                        # Pagina di navigazione dei form salvati
├── form.html                         # Editor del form
├── schemas/
│   └── authentic-sources.schema.json # Schema JSON (da eid-wallet-it-docs)
├── examples/
│   └── progettazione-caratteristiche-eaa.json  # Dati di esempio
└── assets/
    ├── css/style.css
    └── js/
        ├── storage.js    # Gestione localStorage
        ├── csv-utils.js  # Import/export CSV
        └── form-utils.js # Utilities condivise
```

## Schema di riferimento

Lo schema JSON e i dati di esempio provengono da:
[`italia/eid-wallet-it-docs`](https://github.com/italia/eid-wallet-it-docs/tree/versione-corrente/handbooks/it/authentic-sources)

## Licenza

Vedi [LICENSE](LICENSE).
