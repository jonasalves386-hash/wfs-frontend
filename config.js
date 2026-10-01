// config.js
const API_BASE_URL = (() => {
  const { hostname, origin } = window.location;

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${origin}/api`;
  }

  return `${origin}/api`;
})();
