// config.js
// In production this points to the deployed backend.
// After deploying the backend to Vercel, replace the URL below.
const API_BASE_URL = (() => {
  const { hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  }
  return 'https://wfs-backend-saf3.onrender.com'; // TODO: replace with Vercel URL after deploy
})();
