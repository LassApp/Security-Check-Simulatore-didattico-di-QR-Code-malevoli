/* ==========================================================================
   DASHBOARDRENDERER.JS — RACCOLTA DATI REALI DEL BROWSER E RENDERING
   ==========================================================================
   Terzo modulo della fase JS. A differenza di scanEngine.js (che lavora
   su un punteggio SIMULATO), questo modulo legge dati VERI del browser
   tramite API pubbliche e documentate — sono esattamente i dati che il
   testo didattico di #screen-results promette di mostrare ("nessun
   hacking, solo API pubbliche"). Nessun dato qui è inventato: dove un
   valore non è disponibile in un dato browser, viene mostrata
   un'etichetta esplicita ("Non rilevabile"), mai un dato fittizio che
   comprometterebbe la credibilità didattica del progetto.

   RESPONSABILITÀ DI QUESTO FILE
   --------------------------------------------------------------------
   1) collectDeviceData()     — legge tutti i dati grezzi una sola volta
                                 e li restituisce come oggetto semplice,
                                 così main.js può raccoglierli UNA VOLTA
                                 sola e passarli sia a renderAlertFindings
                                 sia a renderResultsDashboard, evitando
                                 letture ripetute (e piccoli disallineamenti,
                                 es. sull'ora locale) fra le due schermate.
   2) renderAlertFindings()   — popola la lista sintetica #alert-findings
                                 nella schermata alert (poche voci, le più
                                 "d'impatto").
   3) renderResultsDashboard()— popola in un solo colpo le 7 card di
                                 #dashboard-grid, la lista completa
                                 #findings-list e i due placeholder
                                 inline della spiegazione didattica
                                 (#explain-browser-name/#explain-os-name).
                                 Le tre operazioni sono raggruppate perché
                                 main.js le invoca sempre insieme, al
                                 momento di mostrare #screen-results — non
                                 hanno mai bisogno di essere richiamate
                                 separatamente, a differenza di
                                 renderAlertFindings (che vive in un
                                 momento distinto della sequenza).

   COSA QUESTO MODULO NON FA
   --------------------------------------------------------------------
   - Non mostra/nasconde alcuna schermata: resta compito di main.js
     tramite showScreen() di uiController.js.
   - Non richiede alcun permesso al browser (geolocalizzazione, camera,
     notifiche...): tutti i dati letti qui sono disponibili senza alcuna
     autorizzazione esplicita dell'utente — è esattamente il punto
     didattico del progetto, quindi il modulo si limita deliberatamente
     alle sole API "silenziose".
   ========================================================================== */

// --------------------------------------------------------------------
// 1. RIFERIMENTI DOM
// --------------------------------------------------------------------

const dashboardGridEl = document.getElementById('dashboard-grid');
const findingsListEl = document.getElementById('findings-list');
const alertFindingsEl = document.getElementById('alert-findings');
const explainBrowserNameEl = document.getElementById('explain-browser-name');
const explainOsNameEl = document.getElementById('explain-os-name');

for (const [name, el] of Object.entries({
  dashboardGridEl,
  findingsListEl,
  alertFindingsEl,
  explainBrowserNameEl,
  explainOsNameEl,
})) {
  if (!el) {
    console.error(`[dashboardRenderer] elemento non trovato in pagina: ${name}`);
  }
}

/** Numero di voci mostrate nella lista sintetica della schermata alert:
 *  poche e ad alto impatto, la lista completa resta compito esclusivo
 *  della schermata risultati (#findings-list). */
const ALERT_FINDINGS_COUNT = 4;

// --------------------------------------------------------------------
// 2. PARSING USER AGENT — BROWSER E SISTEMA OPERATIVO
// --------------------------------------------------------------------

/**
 * Ricava nome e versione del browser da navigator.userAgent con un set
 * di espressioni regolari ordinate dal caso più specifico al più
 * generico (Edge ed Opera includono "Chrome" nella propria UA string,
 * quindi vanno controllati PRIMA di Chrome, o verrebbero identificati
 * erroneamente). Nessuna dipendenza da navigator.userAgentData: quella
 * API è disponibile solo su alcuni browser Chromium ed è pensata per
 * ridurre proprio il fingerprinting tramite UA — usarla al posto della
 * stringa classica indebolirebbe il valore dimostrativo della lezione,
 * il cui punto è mostrare quanto la UA "classica" sia già di per sé
 * informativa.
 * @param {string} ua - navigator.userAgent
 * @returns {{name: string, version: string}}
 */
function parseBrowser(ua) {
  const patterns = [
    { name: 'Microsoft Edge', regex: /Edg\/([\d.]+)/ },
    { name: 'Opera', regex: /(?:OPR|Opera)\/([\d.]+)/ },
    { name: 'Samsung Internet', regex: /SamsungBrowser\/([\d.]+)/ },
    { name: 'Firefox', regex: /Firefox\/([\d.]+)/ },
    { name: 'Chrome', regex: /Chrome\/([\d.]+)/ },
    { name: 'Safari', regex: /Version\/([\d.]+).*Safari/ },
  ];
  for (const { name, regex } of patterns) {
    const match = ua.match(regex);
    if (match) {
      return { name, version: match[1] };
    }
  }
  return { name: 'Browser non identificato', version: '' };
}

/**
 * Ricava un'etichetta leggibile del sistema operativo da
 * navigator.userAgent + navigator.platform. Le versioni di Windows
 * vengono distinte solo dove la UA lo permette realmente (da Windows
 * 11 in poi molti browser riportano ancora "Windows NT 10.0" per
 * ragioni di compatibilità: mostrare "Windows 10/11" invece di
 * inventare una distinzione che l'API non garantisce è una scelta di
 * onestà del dato, coerente con lo spirito dell'intero modulo).
 * @param {string} ua - navigator.userAgent
 * @returns {string}
 */
function parseOperatingSystem(ua) {
  if (/Windows NT 10\.0/.test(ua)) return 'Windows 10/11';
  if (/Windows NT 6\.3/.test(ua)) return 'Windows 8.1';
  if (/Windows NT 6\.1/.test(ua)) return 'Windows 7';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X ([\d_]+)/.test(ua)) {
    const version = ua.match(/Mac OS X ([\d_]+)/)[1].replace(/_/g, '.');
    return `macOS ${version}`;
  }
  if (/Android ([\d.]+)/.test(ua)) {
    return `Android ${ua.match(/Android ([\d.]+)/)[1]}`;
  }
  if (/iPhone|iPad|iPod/.test(ua)) {
    const match = ua.match(/OS ([\d_]+)/);
    return match ? `iOS ${match[1].replace(/_/g, '.')}` : 'iOS';
  }
  if (/Linux/.test(ua)) return 'Linux';
  return 'Sistema operativo non identificato';
}

// --------------------------------------------------------------------
// 3. RACCOLTA DATI GREZZI
// --------------------------------------------------------------------

/**
 * Formatta lo scostamento (in minuti, come restituito da
 * Date.prototype.getTimezoneOffset — segno invertito rispetto a UTC)
 * in una stringa "UTC±HH:MM" leggibile.
 * @param {number} offsetMinutes
 * @returns {string}
 */
function formatUtcOffset(offsetMinutes) {
  const sign = offsetMinutes <= 0 ? '+' : '-'; // getTimezoneOffset ha segno invertito
  const abs = Math.abs(offsetMinutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, '0');
  const minutes = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${hours}:${minutes}`;
}

/**
 * Raccoglie in un solo oggetto tutti i dati grezzi che il resto del
 * modulo userà per popolare card, findings e placeholder testuali.
 * Va chiamata UNA SOLA VOLTA da main.js (subito dopo la fine di
 * scanEngine.runScan()) e il risultato va riutilizzato sia per
 * renderAlertFindings sia per renderResultsDashboard: rileggere i dati
 * due volte in momenti diversi produrrebbe un'ora locale leggermente
 * diversa fra le due schermate, un dettaglio piccolo ma che un occhio
 * attento potrebbe notare e che comprometterebbe la coerenza percepita
 * del "report".
 * @returns {object} dati grezzi del dispositivo
 */
function collectDeviceData() {
  const ua = navigator.userAgent || '';
  const browser = parseBrowser(ua);
  const os = parseOperatingSystem(ua);

  const dpr = window.devicePixelRatio || 1;
  const resolution = `${window.screen.width}×${window.screen.height}`;
  const colorDepth = window.screen.colorDepth || null;

  const cpuCores = typeof navigator.hardwareConcurrency === 'number'
    ? navigator.hardwareConcurrency
    : null;

  let timezoneName = 'Non rilevabile';
  try {
    timezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone || timezoneName;
  } catch {
    // Intl.DateTimeFormat non dovrebbe mai lanciare in un browser
    // moderno, ma un fallback esplicito evita che un'eccezione qui
    // blocchi l'intera schermata risultati per un dato non essenziale.
  }
  const utcOffset = formatUtcOffset(new Date().getTimezoneOffset());

  const now = new Date();
  const localTime = now.toLocaleTimeString(navigator.language || 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const languages = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language || 'Non rilevabile'];

  const prefersDark = window.matchMedia
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const prefersReducedMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const doNotTrack = navigator.doNotTrack === '1' || navigator.doNotTrack === 'yes';
  const cookiesEnabled = Boolean(navigator.cookieEnabled);

  return {
    browserName: browser.name,
    browserVersion: browser.version,
    osName: os,
    resolution,
    dpr,
    colorDepth,
    cpuCores,
    timezoneName,
    utcOffset,
    localTime,
    languages,
    prefersDark,
    prefersReducedMotion,
    doNotTrack,
    cookiesEnabled,
  };
}

// --------------------------------------------------------------------
// 4. COSTRUZIONE MARKUP — CARD E VOCI DI RISCHIO
// --------------------------------------------------------------------

/**
 * Crea una singola card della dashboard, seguendo esattamente la
 * struttura già documentata in components.css (icona in wrap + label +
 * value).
 * @param {{iconId: string, label: string, value: string}} card
 * @returns {HTMLDivElement}
 */
function createDashboardCard({ iconId, label, value }) {
  const card = document.createElement('div');
  card.className = 'dashboard-card';
  card.innerHTML = `
    <div class="dashboard-card__icon-wrap">
      <svg class="icon icon--dashboard-card" aria-hidden="true" focusable="false">
        <use href="#${iconId}"></use>
      </svg>
    </div>
    <div class="dashboard-card__body">
      <p class="dashboard-card__label"></p>
      <p class="dashboard-card__value"></p>
    </div>
  `;
  // Testo assegnato via textContent (mai innerHTML) anche per i due nodi
  // di testo: i valori grezzi del browser (es. user agent completo)
  // potrebbero in teoria contenere caratteri "<"/">" in configurazioni
  // esotiche, quindi vanno sempre trattati come testo puro, mai come
  // markup.
  card.querySelector('.dashboard-card__label').textContent = label;
  card.querySelector('.dashboard-card__value').textContent = value;
  return card;
}

/**
 * Crea una singola voce di rischio (.finding-item), riutilizzata sia
 * da #alert-findings sia da #findings-list — struttura e mapping icone
 * già documentati in components.css.
 * @param {{severity: 'success'|'warning'|'danger', text: string}} finding
 * @returns {HTMLLIElement}
 */
function createFindingItem({ severity, text }) {
  const li = document.createElement('li');
  li.className = `finding-item finding-item--${severity}`;
  const iconId = severity === 'success' ? 'icon-check-circle' : 'icon-warning';
  li.innerHTML = `
    <svg class="icon icon--finding" aria-hidden="true" focusable="false">
      <use href="#${iconId}"></use>
    </svg>
    <span class="finding-item__text"></span>
  `;
  li.querySelector('.finding-item__text').textContent = text;
  return li;
}

// --------------------------------------------------------------------
// 5. GENERAZIONE DELLE VOCI DI RISCHIO A PARTIRE DAI DATI RACCOLTI
// --------------------------------------------------------------------

/**
 * Traduce i dati grezzi in un elenco ORDINATO di voci di rischio
 * (dalla più "d'impatto" alla più marginale): l'ordine conta perché
 * renderAlertFindings ne mostra solo le prime N, quindi le voci più
 * rilevanti dal punto di vista didattico devono comparire per prime.
 * Ogni voce è una conseguenza diretta di un dato REALMENTE raccolto:
 * nessuna voce generica "di riempimento" che non corrisponda a un dato
 * puntuale in `data`.
 * @param {object} data - oggetto restituito da collectDeviceData()
 * @returns {Array<{severity: 'success'|'warning'|'danger', text: string}>}
 */
function buildFindings(data) {
  const findings = [];

  // Combinazione ad alta entropia: è il concetto chiave della lezione
  // (device fingerprinting), quindi in cima con severità massima.
  findings.push({
    severity: 'danger',
    text: 'La combinazione di risoluzione, fuso orario, lingua e hardware rilevati può rendere questo dispositivo praticamente unico fra migliaia di altri, anche senza cookie.',
  });

  findings.push({
    severity: 'warning',
    text: `Il tuo browser dichiara pubblicamente di essere ${data.browserName}${data.browserVersion ? ' ' + data.browserVersion : ''}: un dettaglio che rende più credibile un falso avviso di aggiornamento mirato.`,
  });

  findings.push({
    severity: 'warning',
    text: `Il sistema operativo (${data.osName}) è leggibile da qualunque sito, un'informazione spesso usata per costruire falsi messaggi di supporto tecnico "su misura".`,
  });

  findings.push({
    severity: 'warning',
    text: `Fuso orario (${data.timezoneName}, ${data.utcOffset}) e ora locale (${data.localTime}) sono esposti automaticamente: permettono di calcolare in quale fascia oraria e con ogni probabilità in quale area geografica ti trovi.`,
  });

  findings.push({
    severity: 'warning',
    text: `Risoluzione dello schermo (${data.resolution}, densità pixel ${data.dpr}×) e numero di core del processore${data.cpuCores ? ` (${data.cpuCores})` : ''} contribuiscono ulteriormente a un'impronta hardware distintiva.`,
  });

  findings.push({
    severity: 'warning',
    text: `Le lingue preferite dal browser (${data.languages.join(', ')}) rivelano provenienza o abitudini linguistiche, utili per phishing localizzato.`,
  });

  // Le uniche due voci potenzialmente "success": dipendono da
  // impostazioni che l'utente potrebbe già avere attivo. Vengono
  // aggiunte in coda perché rappresentano una buona notizia, non un
  // rischio da approfondire con priorità.
  findings.push({
    severity: data.doNotTrack ? 'success' : 'warning',
    text: data.doNotTrack
      ? 'Il tuo browser sta inviando il segnale "Do Not Track": un buon segnale, anche se molti siti scelgono comunque di ignorarlo.'
      : 'Il segnale "Do Not Track" non risulta attivo: puoi abilitarlo dalle impostazioni del browser, anche se non tutti i siti sono tenuti a rispettarlo.',
  });

  findings.push({
    severity: 'success',
    text: 'Nessuno di questi dati è stato copiato, salvato o inviato altrove: l\'intera analisi è avvenuta localmente, nel tuo browser.',
  });

  return findings;
}

// --------------------------------------------------------------------
// 6. FUNZIONI ESPORTATE
// --------------------------------------------------------------------

/**
 * Popola la lista sintetica #alert-findings nella schermata di alert,
 * con le prime ALERT_FINDINGS_COUNT voci generate da buildFindings()
 * (le più rilevanti dal punto di vista didattico — vedi ordine in
 * buildFindings). Va chiamata da main.js subito dopo la risoluzione di
 * scanEngine.runScan(), quando #screen-alert è già visibile: senza
 * questa chiamata l'utente vedrebbe momentaneamente una lista vuota,
 * come già segnalato nel banner introduttivo di scanEngine.js.
 * @param {object} data - oggetto restituito da collectDeviceData()
 */
function renderAlertFindings(data) {
  if (!alertFindingsEl) return;
  const findings = buildFindings(data).slice(0, ALERT_FINDINGS_COUNT);
  alertFindingsEl.innerHTML = '';
  const fragment = document.createDocumentFragment();
  findings.forEach((finding) => fragment.appendChild(createFindingItem(finding)));
  alertFindingsEl.appendChild(fragment);
}

/**
 * Popola in un solo colpo tutto il contenuto "a dati reali" della
 * schermata risultati: le 7 card di #dashboard-grid, la lista completa
 * #findings-list e i due placeholder inline della spiegazione didattica
 * (#explain-browser-name/#explain-os-name). Va chiamata da main.js nel
 * momento in cui #screen-results sta per diventare visibile.
 * @param {object} data - oggetto restituito da collectDeviceData()
 */
function renderResultsDashboard(data) {
  // --- 7 card della dashboard --------------------------------------
  if (dashboardGridEl) {
    const cards = [
      {
        iconId: 'icon-browser',
        label: 'Browser',
        value: data.browserVersion ? `${data.browserName} ${data.browserVersion}` : data.browserName,
      },
      { iconId: 'icon-os', label: 'Sistema operativo', value: data.osName },
      {
        iconId: 'icon-display',
        label: 'Risoluzione schermo',
        value: `${data.resolution} · dpr ${data.dpr}×${data.colorDepth ? ` · ${data.colorDepth}-bit` : ''}`,
      },
      {
        iconId: 'icon-cpu',
        label: 'CPU / core logici',
        value: data.cpuCores ? `${data.cpuCores} core` : 'Non rilevabile',
      },
      {
        iconId: 'icon-network',
        label: 'Fuso orario',
        value: `${data.timezoneName} (${data.utcOffset})`,
      },
      { iconId: 'icon-clock', label: 'Ora locale rilevata', value: data.localTime },
      {
        iconId: 'icon-sliders',
        label: 'Preferenze',
        value: `${data.languages.join(', ')} · Tema ${data.prefersDark ? 'scuro' : 'chiaro'} · Movimento ridotto: ${data.prefersReducedMotion ? 'sì' : 'no'}`,
      },
    ];
    dashboardGridEl.innerHTML = '';
    const cardsFragment = document.createDocumentFragment();
    cards.forEach((card) => cardsFragment.appendChild(createDashboardCard(card)));
    dashboardGridEl.appendChild(cardsFragment);
  }

  // --- Lista completa delle voci di rischio -------------------------
  if (findingsListEl) {
    const findings = buildFindings(data);
    findingsListEl.innerHTML = '';
    const findingsFragment = document.createDocumentFragment();
    findings.forEach((finding) => findingsFragment.appendChild(createFindingItem(finding)));
    findingsListEl.appendChild(findingsFragment);
  }

  // --- Placeholder inline nel testo didattico -----------------------
  if (explainBrowserNameEl) {
    explainBrowserNameEl.textContent = data.browserVersion
      ? `${data.browserName} ${data.browserVersion}`
      : data.browserName;
  }
  if (explainOsNameEl) {
    explainOsNameEl.textContent = data.osName;
  }
}

export { collectDeviceData, renderAlertFindings, renderResultsDashboard };
