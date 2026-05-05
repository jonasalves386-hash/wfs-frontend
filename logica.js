const API_URL = `${API_BASE_URL}/voos`;
const SERVICES = ['limpeza', 'qtu', 'qta', 'fonia', 'smartfuel'];
const LOTE_SIZE = 25;
const ROTATION_MS = 60 * 60 * 1000; // 1 hora
const JANELA_MINUTOS = 60;
const REMOVER_APOS_CALCO_MIN = 2;

const SVC_LABEL = {
  limpeza: 'LIMPEZA',
  qtu: 'QTU',
  qta: 'QTA',
  fonia: 'FONIA',
  smartfuel: 'SMART F.',
};

const STATUS = {
  NAO:      { label: 'NÃO ESC.',  cls: 'chip-nao'      },
  ESC:      { label: 'ESCALADO',  cls: 'chip-esc'      },
  CINZA:    { label: 'PADRÃO',    cls: 'chip-cinza'    },
  AZUL:     { label: 'ESCALADO',  cls: 'chip-azul'     },
  AMARELO:  { label: 'ATENÇÃO',   cls: 'chip-amarelo'  },
  VERMELHO: { label: 'CRÍTICO',   cls: 'chip-vermelho' },
  VERDE:    { label: 'OK',        cls: 'chip-verde'    },
};

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
  if (mins <= 0) return 't-atrasado';
  if (mins <= 15) return 't-urgente';
  if (mins <= 40) return 't-alerta';
  return 't-normal';
}

function limpezaStatus(f) {
  if (f.limpeza?.escalado) return STATUS.AZUL;
  const mins = minutesTo(f.t);
  if (mins > 5) return STATUS.CINZA;
  if (mins > 0) return STATUS.AMARELO;
  return STATUS.VERMELHO;
}

function isPending(f) {
  return Object.values(f.s).some(v => v === 'NAO');
}

function allEscalado(f) {
  return Object.values(f.s).every(v => v === 'ESC');
}

function isHorarioValido(h) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(h || '').trim());
}

function montarDataHojePorHorario(horario) {
  const horarioLimpo = String(horario || '').trim();

  if (!isHorarioValido(horarioLimpo)) return null;

  const [h, m] = horarioLimpo.split(':').map(Number);

  const data = new Date();
  data.setHours(h, m, 0, 0);

  return data;
}

function estaNaJanelaOperacional(dataVoo) {
  const diffMin = minutesTo(dataVoo);

  return diffMin >= -JANELA_MINUTOS && diffMin <= JANELA_MINUTOS;
}

function minutosDesdeHorario(horario) {
  const horarioLimpo = String(horario || '').trim();

  if (!isHorarioValido(horarioLimpo)) return null;

  const alvo = montarDataHojePorHorario(horarioLimpo);

  if (!alvo) return null;

  return Math.round((Date.now() - alvo.getTime()) / 60000);
}

function deveRemoverVoo(f) {
  if (!f.calco) return false;

  const minutos = minutosDesdeHorario(f.calco);

  if (minutos === null) return false;

  return minutos >= REMOVER_APOS_CALCO_MIN;
}

function adaptarVoos(apiVoos) {
  return apiVoos
    .map(v => {
      const horario = String(v.horario || '').trim().slice(0,5);
      const calco = String(v.calco || '').trim();

      const data = montarDataHojePorHorario(horario);

      if (!data) {
  console.warn('VOO IGNORADO POR HORARIO INVALIDO:', v);
  return null;
}

console.log('VOOS RECEBIDOS FRONT:', apiVoos.length);

      return {
        id: String(v.voo || '').trim(),
        voo: String(v.voo || '').trim(),
        route: String(v.origem || '').trim() || '-',
        t: data,
        calco: v.calco || null,
        limpeza: v.servicos?.limpeza ?? { escalado: false, valor: '' },
        s: {
          limpeza: 'ESC',
          qtu: 'ESC',
          qta: 'ESC',
          fonia: 'ESC',
          smartfuel: 'ESC',
        },
      };
    })
    .filter(Boolean)
    .filter(f => !deveRemoverVoo(f))
    .sort((a, b) => a.t - b.t)
    .slice(0, LOTE_SIZE);
}

let allFlights = [];
let currentLote = [];
let nextRotation = Date.now() + ROTATION_MS;

function buildLote() {
  return [...allFlights]
    .sort((a, b) => a.t - b.t)
    .slice(0, LOTE_SIZE)
    .map(f => f.id);
}

function rotateLote() {
  const exibidos = new Set(currentLote);

  const pendentes = currentLote.filter(id => {
    const f = allFlights.find(x => x.id === id);
    return f && !allEscalado(f);
  });

  const proximos = allFlights
    .filter(f => !exibidos.has(f.id))
    .sort((a, b) => a.t - b.t)
    .map(f => f.id);

  currentLote = [...pendentes, ...proximos].slice(0, LOTE_SIZE);
  nextRotation = Date.now() + ROTATION_MS;
}

function getSortedLote() {
  return currentLote
    .map(id => allFlights.find(f => f.id === id))
    .filter(Boolean)
    .filter(f => !deveRemoverVoo(f))
    .sort((a, b) => a.t - b.t)
    .slice(0, LOTE_SIZE);
}

function render() {
  const flights = getSortedLote();
  const pending = flights.filter(isPending).length;

  document.getElementById('cnt-attn').textContent = pending;
  document.getElementById('cnt-total').textContent = flights.length;

  const colPending = {};
  flights.forEach(f => {
    colPending[f.id] = isPending(f);
  });

  const table = document.getElementById('painel');
  const rows = [];

  const thVoos = flights.map(f => {
    const cls = colPending[f.id] ? 'col-voo has-pending' : 'col-voo';
    return `<th class="${cls}">${f.id}</th>`;
  }).join('');

  rows.push(`<tr><th class="row-label">VOO</th>${thVoos}</tr>`);

  const tdOrigem = flights.map(f =>
    `<td class="cell-info">${f.route}</td>`
  ).join('');

  rows.push(`<tr><td class="row-label">ORIGEM</td>${tdOrigem}</tr>`);

  const tdSta = flights.map(f =>
    `<td class="cell-info">${fmtTime(f.t)}</td>`
  ).join('');

  rows.push(`<tr><td class="row-label">ETA</td>${tdSta}</tr>`);

  const tdTempo = flights.map(f => {
    const mins = minutesTo(f.t);
    const cls = tempoClass(mins);
    return `<td class="cell-info cell-tempo ${cls}">${fmtTempo(mins)}</td>`;
  }).join('');

  rows.push(`<tr><td class="row-label">TEMPO</td>${tdTempo}</tr>`);

  const sepCols = flights.map(() => '<td></td>').join('');
  rows.push(`<tr class="sep-row"><td></td>${sepCols}</tr>`);

  SERVICES.forEach(svc => {
    const tds = flights.map(f => {
      const st = svc === 'limpeza' ? limpezaStatus(f) : (STATUS[f.s[svc]] || STATUS.ESC);
      const col = colPending[f.id] ? 'cell-svc col-pending' : 'cell-svc';

      return `<td class="${col}"><div class="chip ${st.cls}">${st.label}</div></td>`;
    }).join('');

    rows.push(`<tr><td class="row-label">${SVC_LABEL[svc]}</td>${tds}</tr>`);
  });

  table.innerHTML = rows.join('');
}

const msgs = [
  'WFS · PAINEL DE CONTROLE OPERACIONAL · GRU',
  'LATAM CHEGADA',
  'ROTAÇÃO AUTOMÁTICA A CADA 1 HORA',
  'VERMELHO = NÃO ESCALADO · CINZA = ESCALADO',
];

document.getElementById('ticker').innerHTML =
  [...msgs, ...msgs].map(m => `<span>${m}</span>`).join('');

function updateClock() {
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('pt-BR');
}

async function fetchFlights() {
  try {
    const res = await fetch(`${API_URL}?t=${Date.now()}`, {
      cache: 'no-store'
    });

    if (!res.ok) {
      throw new Error(`Erro HTTP ${res.status}`);
    }

    const data = await res.json();

    if (!Array.isArray(data)) {
      console.error('Formato inesperado da API:', data);
      allFlights = [];
      currentLote = [];
      render();
      return;
    }

    allFlights = adaptarVoos(data);
    currentLote = buildLote();

    console.log('TOTAL API:', data.length);
    console.log('VOOS FILTRADOS:', allFlights.length);
    console.log('VOOS NA TELA:', currentLote.length);

    render();

  } catch (err) {
    console.error('Erro ao buscar voos:', err);
  }
}

currentLote = [];
nextRotation = Date.now() + ROTATION_MS;

fetchFlights();
updateClock();

setInterval(updateClock, 1000);
setInterval(fetchFlights, 30000);

setInterval(() => {
  if (Date.now() >= nextRotation) rotateLote();
  render();
}, 60000);

setInterval(() => {
  console.log('🔄 Auto reload da página (15 min)');
  location.reload();
}, 15 * 60 * 1000); // 15 minutos
