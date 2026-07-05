# Security Check — Simulatore didattico di verifica del dispositivo

> ⚠️ **Progetto a scopo esclusivamente formativo.** Nessun dato viene raccolto, salvato o trasmesso: l'intera simulazione avviene localmente, nel browser dell'utente.

## Cos'è

Un modulo di **cybersecurity awareness** che simula in modo realistico un tool di verifica della sicurezza del dispositivo. L'esperienza è pensata per mostrare, in modo diretto e memorabile, quante informazioni un sito web può leggere automaticamente da un browser tramite API pubbliche e documentate — senza alcun hacking — e come questi dati possano alimentare tecniche di *device fingerprinting* e *social engineering*.

Al termine della simulazione, l'utente scopre che si trattava di una demo didattica e riceve una spiegazione completa dei dati rilevati e di come proteggersi.

## Struttura del progetto

```
├── index.html
├── css/
│   ├── variables.css     # design tokens (colori, spaziature, tipografia)
│   ├── base.css          # reset e stili di base
│   ├── components.css    # componenti UI riutilizzabili
│   ├── screens.css       # layout delle singole schermate
│   └── animations.css    # keyframes e transizioni
└── js/
    ├── uiController.js       # orchestrazione schermate, stato header, a11y
    ├── scanEngine.js         # motore della schermata di scansione simulata
    ├── dashboardRenderer.js  # raccolta dati reali del browser e rendering
    └── main.js               # entry point, orchestrazione della sequenza
```

Nessun bundler, nessuna dipendenza esterna: solo HTML5, CSS3 e JavaScript ES6+ con moduli nativi.

## Flusso applicativo

`landing → scan → alert → reveal → results`

1. **Landing** — splash di brand
2. **Scan** — diagnostica simulata con step progressivi
3. **Alert** — punteggio di rischio simulato (il "momento clou")
4. **Reveal** — si rompe l'illusione: era una simulazione
5. **Results** — dashboard con i dati reali rilevati dal browser + lezione completa su fingerprinting e protezione

## Esecuzione locale

Serve solo un web server statico (i moduli ES6 richiedono `http://`, non funzionano da `file://`):

```bash
npx serve .
# oppure
python3 -m http.server
```

## Pubblicazione su GitHub Pages

Vedi le impostazioni del repository → Settings → Pages → Branch `main`, cartella `/ (root)`.

## Licenza e uso

Materiale didattico. Riutilizzabile per attività di formazione e sensibilizzazione alla sicurezza informatica, citando la fonte.
