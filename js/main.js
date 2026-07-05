/* ==========================================================================
   MAIN.JS — ENTRY POINT, ORCHESTRAZIONE DELL'INTERA SEQUENZA APPLICATIVA
   ==========================================================================
   Unico modulo importato direttamente da index.html
   (<script type="module" src="js/main.js">). Non contiene logica propria
   di rendering o di calcolo — quella vive già nei tre moduli precedenti —
   ma decide QUANDO ciascun pezzo entra in scena e CON QUALE stato
   dell'header/annuncio per lo screen reader, cioè la sequenza narrativa
   completa:

     landing --(timer)--> scan --(runScan)--> alert --(click|timeout)-->
     reveal --(click)--> results --(click)--> fine lezione

   RESPONSABILITÀ DI QUESTO FILE
   --------------------------------------------------------------------
   1) Avviare la sequenza al caricamento (splash landing con timer).
   2) Invocare scanEngine.runScan() e, alla sua risoluzione, raccogliere
      UNA SOLA VOLTA i dati reali del dispositivo (collectDeviceData) e
      popolare la lista sintetica dei rischi nella schermata alert
      (renderAlertFindings) — a quel punto #screen-alert è già visibile
      e il suo gauge già animato, per costruzione di scanEngine.js.
   3) Far avanzare la schermata alert verso il reveal, al click
      sull'intera schermata O dopo un timeout automatico (comportamento
      già descritto nel commento di index.html sopra #screen-alert, e
      già implementato come utility generica in uiController.js:
      waitForAdvance).
   4) Al click su "Vedi il report completo" (#btn-see-results), popolare
      la dashboard reale dei risultati riusando gli STESSI dati già
      raccolti al punto 2 (mai una seconda lettura: garantisce coerenza
      fra "ora locale" mostrata in alert e in results, come già
      documentato in dashboardRenderer.js) e mostrare #screen-results.
   5) Al click su "Continua la lezione" (#btn-continue-lesson), chiudere
      il modulo con un esito credibile e definitivo (non un
      placeholder): il bottone si disattiva, il testo della sezione CTA
      viene sostituito con una conferma di completamento, e l'esito
      viene annunciato alla live region — coerente con l'impostazione
      "nessuna azione esterna, tutto avviene localmente" di tutta l'app.

   NESSUNA LOGICA DI CALCOLO O DI DOM RENDERING "NUOVA" VIVE QUI: questo
   file chiama sempre le funzioni già esposte dagli altri tre moduli,
   mai duplicandone il comportamento — è puro orchestratore.
   ========================================================================== */

import { showScreen, setHeaderStatus, announce, waitForAdvance } from './uiController.js';
import { runScan } from './scanEngine.js';
import {
  collectDeviceData,
  renderAlertFindings,
  renderResultsDashboard,
} from './dashboardRenderer.js';

// --------------------------------------------------------------------
// 1. RIFERIMENTI DOM
// --------------------------------------------------------------------

const screenAlertEl = document.getElementById('screen-alert');
const btnSeeResults = document.getElementById('btn-see-results');
const btnContinueLesson = document.getElementById('btn-continue-lesson');
const ctaSectionEl = document.querySelector('.cta-section');

for (const [name, el] of Object.entries({
  screenAlertEl,
  btnSeeResults,
  btnContinueLesson,
  ctaSectionEl,
})) {
  if (!el) {
    console.error(`[main] elemento non trovato in pagina: ${name}`);
  }
}

// --------------------------------------------------------------------
// 2. UTILITY LOCALI
// --------------------------------------------------------------------
// prefersReducedMotion non è fra le esportazioni di uiController.js/
// scanEngine.js (tenuta privata in entrambi di proposito): ogni modulo
// che ne ha bisogno se ne ridichiara una copia minima locale, stessa
// scelta già motivata nel banner introduttivo di scanEngine.js.

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Promise che si risolve dopo `ms` millisecondi. */
function wait(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --------------------------------------------------------------------
// 3. COSTANTI DI SEQUENZA
// --------------------------------------------------------------------

/**
 * Durata dello splash di landing in condizioni normali: abbastanza
 * lunga da leggere il brand e percepire un "avvio" reale del motore di
 * sicurezza (coerente col testo "Initializing security engine…"), ma
 * senza risultare un'attesa fastidiosa.
 */
const LANDING_DURATION_MS = 2200;

/**
 * Sotto prefers-reduced-motion lo splash resta comunque percepibile
 * (non è un'animazione da sopprimere, è un tempo di lettura) ma si
 * riduce: chi ha richiesto meno movimento nel sistema difficilmente
 * vuole anche attendere secondi extra di puro branding.
 */
const LANDING_DURATION_REDUCED_MS = 700;

/**
 * Timeout massimo di permanenza sulla schermata alert prima di passare
 * automaticamente al reveal, se l'utente non clicca prima. Abbastanza
 * lungo da permettere la lettura del gauge e delle findings sintetiche,
 * coerente con l'hint testuale "Click anywhere to continue" (che resta
 * comunque la via più rapida).
 */
const ALERT_AUTO_ADVANCE_MS = 6000;

// --------------------------------------------------------------------
// 4. STATO CONDIVISO FRA LE FASI
// --------------------------------------------------------------------

/**
 * Dati reali del dispositivo, raccolti UNA SOLA VOLTA subito dopo la
 * fine della scansione simulata e riusati sia per la schermata alert
 * sia per la schermata risultati — mai riletti una seconda volta (vedi
 * banner introduttivo e nota in dashboardRenderer.js).
 * @type {object|null}
 */
let deviceData = null;

// --------------------------------------------------------------------
// 5. FASE 1 — LANDING → SCAN
// --------------------------------------------------------------------

/**
 * Attende il tempo di splash della landing (già visibile di default
 * nell'HTML statico, nessuna chiamata a showScreen necessaria per
 * mostrarla) e poi avvia la sequenza di scansione.
 * @returns {Promise<void>}
 */
async function runLandingPhase() {
  const durationMs = prefersReducedMotion()
    ? LANDING_DURATION_REDUCED_MS
    : LANDING_DURATION_MS;
  await wait(durationMs);

  await showScreen('screen-scan', {
    statusState: 'active',
    statusLabel: 'Analyzing device…',
    announceText: 'Starting security diagnostics.',
  });
}

// --------------------------------------------------------------------
// 6. FASE 2 — SCAN → ALERT (+ raccolta dati e findings sintetiche)
// --------------------------------------------------------------------

/**
 * Esegue la scansione simulata (che si occupa da sola di navigare
 * verso #screen-alert e animare il proprio gauge) e, alla sua
 * risoluzione, raccoglie i dati reali del dispositivo popolando subito
 * la lista sintetica dei rischi — senza questa chiamata immediata
 * l'utente vedrebbe momentaneamente #alert-findings vuoto, come già
 * segnalato nel banner introduttivo di scanEngine.js.
 * @returns {Promise<void>}
 */
async function runScanPhase() {
  await runScan();

  // Prima e unica lettura dei dati reali del dispositivo: da qui in
  // avanti ogni schermata successiva riusa `deviceData`, mai una nuova
  // chiamata a collectDeviceData().
  deviceData = collectDeviceData();
  renderAlertFindings(deviceData);
}

// --------------------------------------------------------------------
// 7. FASE 3 — ALERT → REVEAL (click sulla schermata o timeout)
// --------------------------------------------------------------------

/**
 * Attende che l'utente clicchi in un punto qualunque della schermata
 * alert, oppure che scada il timeout automatico — la prima delle due
 * condizioni vince (comportamento già descritto in index.html e già
 * implementato come utility generica in uiController.js). Al termine,
 * transita verso il reveal.
 * @returns {Promise<void>}
 */
async function runAlertPhase() {
  if (!screenAlertEl) return;

  await waitForAdvance(screenAlertEl, ALERT_AUTO_ADVANCE_MS);

  await showScreen('screen-reveal', {
    statusState: 'neutral',
    statusLabel: 'Simulation complete',
    announceText: 'This was a training simulation. No data was collected.',
  });
}

// --------------------------------------------------------------------
// 8. FASE 4 — REVEAL → RESULTS (click su #btn-see-results)
// --------------------------------------------------------------------

/**
 * Gestore del click su "Vedi il report completo": popola la dashboard
 * reale (card + lista completa + placeholder inline) riusando i dati
 * già raccolti in fase 2, poi mostra la schermata risultati con stato
 * header "success" (verifica conclusa, esito stabile — coerente con la
 * semantica non pulsante di .status-dot--success già documentata in
 * components.css).
 * @returns {Promise<void>}
 */
async function handleSeeResultsClick() {
  if (!deviceData) {
    // Non dovrebbe mai accadere nel flusso normale (il bottone diventa
    // visibile solo dopo runScanPhase), ma un fallback esplicito evita
    // un report vuoto in caso di sequenza anomala (es. test manuale
    // della schermata isolata).
    console.error('[main] dati del dispositivo non ancora raccolti: report non generabile.');
    deviceData = collectDeviceData();
  }

  renderResultsDashboard(deviceData);

  await showScreen('screen-results', {
    statusState: 'success',
    statusLabel: 'Report generated',
    announceText: 'Full security report ready.',
  });
}

// --------------------------------------------------------------------
// 9. FASE 5 — CHIUSURA LEZIONE (click su #btn-continue-lesson)
// --------------------------------------------------------------------

/**
 * Gestore del click su "Continua la lezione": non esiste una schermata
 * successiva nel progetto (5 schermate totali, già tutte attraversate),
 * quindi l'esito credibile e definitivo è chiudere il modulo qui,
 * sostituendo la sola CTA con una conferma di completamento — mai un
 * semplice "TODO" o un alert() invasivo, che romperebbero il registro
 * professionale mantenuto in tutta l'app. Il bottone viene disattivato
 * per impedire riattivazioni accidentali della stessa conferma.
 */
function handleContinueLessonClick() {
  if (!ctaSectionEl || !btnContinueLesson) return;

  btnContinueLesson.disabled = true;

  // Sostituisce il contenuto della sola sezione CTA (non l'intera
  // schermata risultati, che resta consultabile: dashboard e findings
  // restano visibili sopra, l'utente può ancora rileggerli in
  // qualunque momento) con un messaggio di chiusura in linea con il
  // tono didattico e rassicurante già stabilito nel reveal. Costruito
  // via DOM API (mai innerHTML con stringhe interpolate) per restare
  // coerente con la convenzione "testo dinamico sempre via textContent"
  // già seguita in dashboardRenderer.js.
  ctaSectionEl.innerHTML = '';

  const completionIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  completionIcon.setAttribute('class', 'icon icon--reveal');
  completionIcon.setAttribute('aria-hidden', 'true');
  completionIcon.setAttribute('focusable', 'false');
  completionIcon.style.marginInline = 'auto';
  const useEl = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  useEl.setAttribute('href', '#icon-check-circle');
  completionIcon.appendChild(useEl);

  const completionTitle = document.createElement('h3');
  completionTitle.textContent = 'Modulo completato';
  completionTitle.style.marginTop = 'var(--space-4)';

  const completionText = document.createElement('p');
  completionText.textContent = 'Hai completato la simulazione di cybersecurity awareness. Ricorda i punti chiave: mantieni aggiornati i tuoi dispositivi, diffida dei messaggi non richiesti e limita le informazioni che condividi online.';
  completionText.style.marginTop = 'var(--space-3)';
  completionText.style.color = 'var(--color-text-secondary)';
  completionText.style.lineHeight = 'var(--leading-relaxed)';
  completionText.style.maxWidth = 'var(--container-default)';
  completionText.style.marginInline = 'auto';

  ctaSectionEl.appendChild(completionIcon);
  ctaSectionEl.appendChild(completionTitle);
  ctaSectionEl.appendChild(completionText);

  setHeaderStatus('success', 'Module completed');
  announce('Training module completed. Thank you for taking part.');
}

// --------------------------------------------------------------------
// 10. INIZIALIZZAZIONE
// --------------------------------------------------------------------

/**
 * Collega i gestori di evento delle due CTA manuali (indipendenti dal
 * timing della sequenza automatica: possono scattare in qualunque
 * momento le rispettive schermate diventino visibili) e avvia la
 * sequenza automatica landing → scan → alert → reveal.
 * @returns {Promise<void>}
 */
async function init() {
  if (btnSeeResults) {
    btnSeeResults.addEventListener('click', handleSeeResultsClick);
  }
  if (btnContinueLesson) {
    btnContinueLesson.addEventListener('click', handleContinueLessonClick);
  }

  await runLandingPhase();
  await runScanPhase();
  await runAlertPhase();
}

// Gli script type="module" sono deferred per specifica: al momento
// dell'esecuzione il DOM è già completamente analizzato, quindi non
// serve attendere DOMContentLoaded. Un catch esplicito evita che un
// errore imprevisto in una qualunque fase resti silenzioso in console
// senza un log riconoscibile come proveniente da questo orchestratore.
init().catch((error) => {
  console.error('[main] errore durante l\'inizializzazione della sequenza:', error);
});
