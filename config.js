// config.js
const API_BASE_URL = (() => {
  const { hostname } = window.location;

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  }

  return 'http://2.24.107.151:3001';
})();