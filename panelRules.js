(function exposePanelRules(root, factory) {
  const rules = factory();
  if (typeof module === 'object' && module.exports) module.exports = rules;
  root.PanelRules = rules;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createPanelRules() {
  'use strict';

  const WINDOW_MINUTES = 60;
  const MAX_FLIGHTS = 12;
  const HOLD_MAX_MINUTES = 180;

  function timestamp(value) {
    const parsed = Date.parse(value || '');
    return Number.isFinite(parsed) ? parsed : null;
  }

  function minutesUntil(eta, nowMs = Date.now()) {
    const etaMs = timestamp(eta);
    return etaMs === null ? null : Math.ceil((etaMs - nowMs) / 60000);
  }

  function visibleFlights(flights, nowMs = Date.now()) {
    return flights
      .filter((flight) => {
        const etaMs = timestamp(flight.eta);
        if (etaMs === null) return false;
        const exactMinutes = (etaMs - nowMs) / 60000;
        // Travado pelo backend (sem "na posição" na Fonia): continua na tela.
        if (flight.held) return exactMinutes >= -HOLD_MAX_MINUTES;
        return exactMinutes >= 0
          && exactMinutes <= WINDOW_MINUTES
          && !flight.onChock
          && !flight.doorOpen;
      })
      .sort((a, b) => timestamp(a.eta) - timestamp(b.eta))
      .slice(0, MAX_FLIGHTS);
  }

  function pendingStatus(minutes) {
    if (minutes <= 5) return 'red';
    if (minutes <= 15) return 'yellow';
    return 'gray';
  }

  // Serviço sem integração (ou com falha prolongada) fica cinza: sem sinal não
  // pode virar alarme amarelo/vermelho na operação.
  function notIntegrated(service) {
    return service?.integrated === false;
  }

  function foniaStatus(flight, nowMs = Date.now()) {
    if (notIntegrated(flight.fonia)) return 'gray';
    if (flight.fonia?.teamName && flight.fonia.inPosition) return 'green';
    if (flight.fonia?.teamName) return 'blue';
    return pendingStatus(minutesUntil(flight.eta, nowMs));
  }

  // REST.: azul escalado; sem escala, amarelo piscando a <= 5 min, vermelho
  // piscando com o ETA zerado; cinza antes disso e para voo sem registro.
  function restStatus(flight, nowMs = Date.now()) {
    if (notIntegrated(flight.rest)) return 'gray';
    if (flight.rest?.assigned) return 'blue';
    const minutes = minutesUntil(flight.eta, nowMs);
    if (minutes <= 0) return 'red';
    if (minutes <= 5) return 'yellow-blink';
    return 'gray';
  }

  function smartFuelStatus(flight, nowMs = Date.now()) {
    if (notIntegrated(flight.smartFuel)) return 'gray';
    if (flight.smartFuel?.completed) return 'green';
    if (flight.smartFuel?.assigned) return 'blue';
    return pendingStatus(minutesUntil(flight.eta, nowMs));
  }

  return {
    WINDOW_MINUTES,
    MAX_FLIGHTS,
    timestamp,
    minutesUntil,
    visibleFlights,
    pendingStatus,
    foniaStatus,
    restStatus,
    smartFuelStatus,
  };
}));
