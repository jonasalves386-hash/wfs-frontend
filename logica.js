'use strict';

const API_URL = `${API_BASE_URL}/chegadas/voos`;
const POLL_MS = 60000;
const REQUEST_TIMEOUT_MS = 125000;
const STORAGE_KEY = 'wfs-chegadas:last-valid-flights';
const ROWS = ['VOO', 'ORIGEM', 'ETA', 'TEMPO', 'BOX', 'FONIA', 'LIMPEZA', 'REST.', 'QTU', 'QTA', 'SMARTF'];

function loadStoredFlights() {
  try {
    const payload = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(payload) ? payload.map(normalizeFlight) : [];
  } catch {
    return [];
  }
}

function storeFlights(payload) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // O cache do navegador é apenas uma proteção de recarga; a API continua sendo a fonte oficial.
  }
}

let lastValidFlights = loadStoredFlights();
let requestInProgress = false;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatEta(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatRemaining(minutes) {
  if (minutes === null) return '';
  if (minutes < 60) return `${Math.max(0, minutes)}min`;
  return '1h';
}

function timeClass(minutes) {
  if (minutes <= 5) return 'time-critical';
  if (minutes <= 15) return 'time-warning';
  return 'time-normal';
}

function infoCell(value, extraClass = '') {
  return `<td class="cell-info ${extraClass}">${escapeHtml(value)}</td>`;
}

function statusCell(status, text = '', extraClass = '') {
  return `<td class="cell-status status-${status} ${extraClass}">${escapeHtml(text)}</td>`;
}

function buildRow(label, cells) {
  const tag = label === 'VOO' ? 'th' : 'td';
  return `<tr><${tag} class="row-label" scope="row">${label}</${tag}>${cells}</tr>`;
}

function render() {
  const nowMs = Date.now();
  const flights = PanelRules.visibleFlights(lastValidFlights, nowMs);
  document.getElementById('cnt-total').textContent = String(flights.length);

  const values = {
    VOO: flights.map((flight) => `<th class="flight-number" scope="col">${escapeHtml(flight.flightNumber)}</th>`).join(''),
    ORIGEM: flights.map((flight) => infoCell(flight.origin)).join(''),
    ETA: flights.map((flight) => infoCell(formatEta(flight.eta))).join(''),
    TEMPO: flights.map((flight) => {
      const minutes = PanelRules.minutesUntil(flight.eta, nowMs);
      return infoCell(formatRemaining(minutes), `cell-time ${timeClass(minutes)}`);
    }).join(''),
    BOX: flights.map((flight) => statusCell('gray', flight.box, 'cell-gate')).join(''),
    FONIA: flights.map((flight) => {
      const status = PanelRules.foniaStatus(flight, nowMs);
      const teamName = status === 'blue' || status === 'green' ? flight.fonia?.teamName : '';
      return statusCell(status, teamName, 'cell-fonia');
    }).join(''),
    LIMPEZA: flights.map(() => statusCell('gray')).join(''),
    'REST.': flights.map((flight) => statusCell(PanelRules.restStatus(flight, nowMs))).join(''),
    QTU: flights.map(() => statusCell('gray')).join(''),
    QTA: flights.map(() => statusCell('gray')).join(''),
    SMARTF: flights.map((flight) => {
      const status = PanelRules.smartFuelStatus(flight, nowMs);
      const teamName = status === 'blue' || status === 'green' ? flight.smartFuel?.teamName : '';
      return statusCell(status, teamName);
    }).join(''),
  };

  document.getElementById('painel').innerHTML = ROWS.map((label) => buildRow(label, values[label])).join('');
}

function updateClock() {
  document.getElementById('clock').textContent = new Date().toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour12: false,
  });
}

function setAvailability(available) {
  const live = document.querySelector('.live');
  const label = document.querySelector('.live-text');
  live.classList.toggle('unavailable', !available);
  label.textContent = available ? 'AO VIVO' : 'ATUALIZAÇÃO INDISPONÍVEL';
}

function normalizeFlight(raw) {
  return {
    operationId: String(raw.id || ''),
    serviceKey: String(raw.serviceKey || ''),
    flightNumber: String(raw.flightNumber || ''),
    origin: String(raw.origin || ''),
    eta: raw.eta || null,
    box: String(raw.box || ''),
    paxDoorOpen: String(raw.paxDoorOpen || ''),
    onChock: raw.chocksOn ? true : null,
    doorOpen: Boolean(raw.gateOpen),
    fonia: {
      integrated: raw.fonia?.integrated === true,
      teamName: String(raw.fonia?.teamName || ''),
      inPosition: Boolean(raw.fonia?.inPosition),
    },
    rest: {
      integrated: raw.rest?.integrated === true,
      assigned: Boolean(raw.rest?.assigned),
    },
    smartFuel: {
      integrated: raw.smartFuel?.integrated === true,
      assigned: Boolean(raw.smartFuel?.assigned),
      completed: Boolean(raw.smartFuel?.completed),
      teamName: String(raw.smartFuel?.teamName || ''),
    },
  };
}

async function fetchFlights() {
  if (requestInProgress) return;
  requestInProgress = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_URL}?t=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error('Formato inesperado: a API não retornou uma lista');

    lastValidFlights = payload.map(normalizeFlight);
    storeFlights(payload);
    setAvailability(response.headers.get('X-Data-Stale') !== 'true');
    render();
  } catch (error) {
    console.error('[Painel de Chegadas] atualização remota falhou; último estado preservado.', error);
    setAvailability(false);
  } finally {
    clearTimeout(timeout);
    requestInProgress = false;
  }
}

updateClock();
render();
setAvailability(false);
fetchFlights();

setInterval(() => {
  updateClock();
  render();
}, 1000);
setInterval(fetchFlights, POLL_MS);
