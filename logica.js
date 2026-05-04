const API_URL = `${API_BASE_URL}/voos`;
const SERVICES  = ['limpeza', 'qtu', 'qta', 'fonia', 'smartfuel'];
const LOTE_SIZE = 25;
const ROTATION_MS = 60 * 60 * 1000; // 1 hora

const SVC_LABEL = {
  limpeza: 'LIMPEZA',
  qtu:     'QTU',
  qta:     'QTA',
  fonia:   'FONIA',
  smartfuel:   'SMART F.',
};

const STATUS = {
  NAO: { label: 'NÃO ESC.', cls: 'chip-nao' },
  ESC: { label: 'ESCALADO', cls: 'chip-esc' },
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function off(m) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + m, 0, 0);
  return d;
}

function rndSvc() {
  const opts = ['ESC', 'ESC', 'ESC', 'NAO'];
  const s = {};
  SERVICES.forEach(k => s[k] = opts[Math.floor(Math.random() * opts.length)]);
  return s;
}

function minutesTo(date) {
  return Math.round((date - Date.now()) / 60000);
}

function fmtTime(d) {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function fmtTempo(mins) {
  if (mins <= 0) return `-${Math.abs(mins)}min`;
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

function tempoClass(mins) {
  if (mins <= 0)  return 't-atrasado';
  if (mins <= 15) return 't-urgente';
  if (mins <= 40) return 't-alerta';
  return 't-normal';
}

function isPending(f) {
  return Object.values(f.s).some(v => v === 'NAO');
}

function allEscalado(f) {
  return Object.values(f.s).every(v => v === 'ESC');
}

function adaptarVoos(apiVoos) {
  return apiVoos
    .filter(v => v.horario && isHorarioValido(v.horario))
    .map(v => {
      const [h, m] = v.horario.split(':').map(Number);

      const data = new Date();
      data.setHours(h, m, 0, 0);

      return {
        id: v.voo,
        route: v.origem,
        t: data,
        calco: v.calco || null,

        s: {
          limpeza: v.tempo < 0 ? 'NAO' : 'ESC',
          qtu: 'ESC',
          qta: 'ESC',
          fonia: 'ESC',
          smartfuel: 'ESC'
        }
      };
    });
}

function isHorarioValido(h) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(h);
}

function minutosDesdeHorario(horario) {
  if (!isHorarioValido(horario)) return null;

  const [h, m] = horario.split(':').map(Number);
  const agora = new Date();
  const alvo = new Date();
  alvo.setHours(h, m, 0, 0);

  return Math.round((agora - alvo) / 60000);
}

function deveRemoverVoo(f) {
  if (!f.calco) return false;

  const minutos = minutosDesdeHorario(f.calco);

  if (minutos === null) return false;

  return minutos >= 3;
}
// ─────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────
let allFlights = [];
// ─────────────────────────────────────────────────────────────
// ESTADO
// ─────────────────────────────────────────────────────────────
let currentLote  = [];
let nextRotation = Date.now() + ROTATION_MS;

function buildLote() {
  return [...allFlights]
    .sort((a, b) => a.t - b.t)
    .slice(0, LOTE_SIZE)
    .map(f => f.id);
}

function rotateLote() {
  const exibidos  = new Set(currentLote);
  const pendentes = currentLote.filter(id => {
    const f = allFlights.find(x => x.id === id);
    return f && !allEscalado(f);
  });
  const proximos = allFlights
    .filter(f => !exibidos.has(f.id))
    .sort((a, b) => a.t - b.t)
    .map(f => f.id);
  currentLote  = [...pendentes, ...proximos].slice(0, LOTE_SIZE);
  nextRotation = Date.now() + ROTATION_MS;
}

function getSortedLote() {
  return currentLote
    .map(id => allFlights.find(f => f.id === id))
    .filter(Boolean)
    .sort((a, b) => a.t - b.t);
}

// ─────────────────────────────────────────────────────────────
// RENDER — tabela transposta
// ─────────────────────────────────────────────────────────────
function render() {
  const flights = getSortedLote().filter(f => !deveRemoverVoo(f));
  const pending  = flights.filter(isPending).length;

  document.getElementById('cnt-attn').textContent  = pending;
  document.getElementById('cnt-total').textContent = flights.length;

  // detecta quais colunas têm pendência (pra destacar toda a coluna)
  const colPending = {};
  flights.forEach(f => { colPending[f.id] = isPending(f); });

  const table = document.getElementById('painel');
  const rows  = [];

  // ── LINHA 0: cabeçalho com número do voo ──
  const thVoos = flights.map(f => {
    const cls = colPending[f.id] ? 'col-voo has-pending' : 'col-voo';
    return `<th class="${cls}">${f.id}</th>`;
  }).join('');
  rows.push(`<tr><th class="row-label">VOO</th>${thVoos}</tr>`);

  // ── LINHA 1: ORIGEM ──
  const tdOrigem = flights.map(f =>
    `<td class="cell-info">${f.route}</td>`
  ).join('');
  rows.push(`<tr><td class="row-label">ORIGEM</td>${tdOrigem}</tr>`);

  // ── LINHA 2: STA ──
  const tdSta = flights.map(f =>
    `<td class="cell-info">${fmtTime(f.t)}</td>`
  ).join('');
  rows.push(`<tr><td class="row-label">ETA</td>${tdSta}</tr>`);

  // ── LINHA 3: TEMPO ──
  const tdTempo = flights.map(f => {
    const mins = minutesTo(f.t);
    const cls  = tempoClass(mins);
    return `<td class="cell-info cell-tempo ${cls}">${fmtTempo(mins)}</td>`;
  }).join('');
  rows.push(`<tr><td class="row-label">TEMPO</td>${tdTempo}</tr>`);

  // ── SEPARADOR ──
  const sepCols = flights.map(() => '<td></td>').join('');
  rows.push(`<tr class="sep-row"><td></td>${sepCols}</tr>`);

  // ── LINHAS DE SERVIÇO ──
  SERVICES.forEach(svc => {
    const tds = flights.map(f => {
      const st  = STATUS[f.s[svc]] || STATUS.ESC;
      const col = colPending[f.id] ? 'cell-svc col-pending' : 'cell-svc';
      return `<td class="${col}"><div class="chip ${st.cls}">${st.label}</div></td>`;
    }).join('');
    rows.push(`<tr><td class="row-label">${SVC_LABEL[svc]}</td>${tds}</tr>`);
  });

  table.innerHTML = rows.join('');
}

// ─────────────────────────────────────────────────────────────
// TICKER
// ─────────────────────────────────────────────────────────────
const msgs = [
  'WFS · PAINEL DE CONTROLE OPERACIONAL · GRU',
  'LATAM CHEGADA',
  'ROTAÇÃO AUTOMÁTICA A CADA 1 HORA',
  'VERMELHO = NÃO ESCALADO · CINZA = ESCALADO',
];
document.getElementById('ticker').innerHTML =
  [...msgs, ...msgs].map(m => `<span>${m}</span>`).join('');

// ─────────────────────────────────────────────────────────────
// CLOCK
// ─────────────────────────────────────────────────────────────
function updateClock() {
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('pt-BR');
}

// ─────────────────────────────────────────────────────────────
async function fetchFlights() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();

  if (Array.isArray(data) && data.length > 0) {
  allFlights = adaptarVoos(data);
}

currentLote = buildLote();

    render();

  } catch (err) {
    console.error('Erro ao buscar voos:', err);
  }
}

// ─────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────
currentLote  = [];
nextRotation = Date.now() + ROTATION_MS;

fetchFlights();
updateClock();

setInterval(updateClock, 1000);
setInterval(fetchFlights, 30000);
setInterval(() => {
  if (Date.now() >= nextRotation) rotateLote();
  render();
}, 60000);