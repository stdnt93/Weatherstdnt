'use strict';

/* ================= MGRS → lat/lon (без зовнішніх бібліотек) ================= */
const MGRS = (() => {
  const BANDS = 'CDEFGHJKLMNPQRSTUVWX';
  const MIN_N = [1100000, 2000000, 2800000, 3700000, 4600000, 5500000, 6400000, 7300000,
                 8200000, 9100000, 0, 800000, 1700000, 2600000, 3500000, 4400000,
                 5300000, 6200000, 7000000, 7900000];
  const COLS = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'];
  const ROWS = 'ABCDEFGHJKLMNPQRSTUV';

  function utmToLatLon(zone, south, E, N) {
    const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996;
    const e = Math.sqrt(f * (2 - f));
    const n = f / (2 - f), n2 = n * n, n3 = n2 * n, n4 = n3 * n, n5 = n4 * n, n6 = n5 * n;
    const A = a / (1 + n) * (1 + n2 / 4 + n4 / 64 + n6 / 256);
    const beta = [null,
      n / 2 - 2 * n2 / 3 + 37 * n3 / 96 - n4 / 360 - 81 * n5 / 512 + 96199 * n6 / 604800,
      n2 / 48 + n3 / 15 - 437 * n4 / 1440 + 46 * n5 / 105 - 1118711 * n6 / 3870720,
      17 * n3 / 480 - 37 * n4 / 840 - 209 * n5 / 4480 + 5569 * n6 / 90720,
      4397 * n4 / 161280 - 11 * n5 / 504 - 830251 * n6 / 7257600,
      4583 * n5 / 161280 - 108847 * n6 / 3991680,
      20648693 * n6 / 638668800];

    const x = E - 500000;
    const y = south ? N - 10000000 : N;
    const eta = x / (k0 * A);
    const xi = y / (k0 * A);

    let xi1 = xi, eta1 = eta;
    for (let j = 1; j <= 6; j++) {
      xi1 -= beta[j] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
      eta1 -= beta[j] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
    }
    const sinhEta1 = Math.sinh(eta1);
    const sinXi1 = Math.sin(xi1), cosXi1 = Math.cos(xi1);
    const tau1 = sinXi1 / Math.hypot(sinhEta1, cosXi1);

    let tauI = tau1;
    for (let i = 0; i < 10; i++) {
      const sigmaI = Math.sinh(e * Math.atanh(e * tauI / Math.hypot(1, tauI)));
      const tauIp = tauI * Math.hypot(1, sigmaI) - sigmaI * Math.hypot(1, tauI);
      const dTau = (tau1 - tauIp) / Math.hypot(1, tauIp) *
        (1 + (1 - e * e) * tauI * tauI) / ((1 - e * e) * Math.hypot(1, tauI));
      tauI += dTau;
      if (Math.abs(dTau) < 1e-12) break;
    }

    const phi = Math.atan(tauI);
    const lambda0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
    const lambda = Math.atan2(sinhEta1, cosXi1) + lambda0;
    return [phi * 180 / Math.PI, lambda * 180 / Math.PI];
  }

  // Повертає [lat, lon] центру комірки; кидає помилку при некоректному форматі
  function toLatLon(str) {
    const s = str.toUpperCase().replace(/\s+/g, '');
    const m = /^(\d{1,2})([C-HJ-NP-X])([A-HJ-NP-Z])([A-HJ-NP-V])(\d*)$/.exec(s);
    if (!m) throw new Error('bad format');
    const zone = parseInt(m[1], 10);
    if (zone < 1 || zone > 60) throw new Error('bad zone');
    const band = m[2], colL = m[3], rowL = m[4], digits = m[5];
    if (digits.length % 2 !== 0 || digits.length > 10) throw new Error('bad digits');

    const colIdx = COLS[(zone - 1) % 3].indexOf(colL);
    if (colIdx < 0) throw new Error('bad column letter');
    const e100k = (colIdx + 1) * 100000;

    const rowIdx = ROWS.indexOf(rowL);
    const n100k = (((rowIdx - (zone % 2 === 0 ? 5 : 0)) % 20) + 20) % 20 * 100000;

    const half = digits.length / 2;
    const cell = Math.pow(10, 5 - half);                // розмір комірки, м
    const eOff = half ? parseInt(digits.slice(0, half), 10) * cell : 0;
    const nOff = half ? parseInt(digits.slice(half), 10) * cell : 0;

    const E = e100k + eOff + cell / 2;
    let N = n100k + nOff + cell / 2;
    const minN = MIN_N[BANDS.indexOf(band)];
    while (N < minN) N += 2000000;

    return utmToLatLon(zone, band < 'N', E, N);
  }

  return { toLatLon };
})();

/* ================================= Мапа ================================= */
// maxNativeZoom — максимальний рівень, який реально віддає сервер тайлів.
// Вище цього рівня Leaflet розтягує останній доступний тайл замість помилки
// "Map data not available" / "Zoom level not supported".
const MAX_ZOOM = 22;

const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxNativeZoom: 19,
  maxZoom: MAX_ZOOM,
  attribution: '© OpenStreetMap'
});

const satelliteLayer = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxNativeZoom: 17,
  maxZoom: MAX_ZOOM,
  attribution: 'Tiles © Esri'
});

const map = L.map('map', {
  center: [48.3794, 31.1656],
  zoom: 6,
  maxZoom: MAX_ZOOM,
  layers: [osmLayer]
});

L.control.layers({
  'Звичайна (OSM)': osmLayer,
  'Супутник (Esri)': satelliteLayer
}, null, { position: 'topright' }).addTo(map);

let currentMarker = null;
let radarLayer = null;

/* ============================ Радар RainViewer ============================ */
// RainViewer віддає тайли лише до zoom 7 — саме це давало помилку при збільшенні.
async function loadRadarLayer() {
  try {
    const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    const data = await response.json();

    if (data && data.radar && data.radar.past && data.radar.past.length) {
      const lastFrame = data.radar.past[data.radar.past.length - 1];
      const radarUrl = `${data.host}${lastFrame.path}/256/{z}/{x}/{y}/2/1_1.png`;

      if (radarLayer) map.removeLayer(radarLayer);

      radarLayer = L.tileLayer(radarUrl, {
        opacity: 0.6,
        zIndex: 500,
        maxNativeZoom: 7,
        maxZoom: MAX_ZOOM
      }).addTo(map);
    }
  } catch (err) {
    console.error('Помилка завантаження шару радара:', err);
  }
}

/* ================================ Погода ================================ */
function getWindDirectionSymbol(deg) {
  if (deg === null || deg === undefined) return '--';
  const directions = ['Пн ↑', 'Пн-Сх ↗', 'Сх →', 'Пд-Сх ↘', 'Пд ↓', 'Пд-Зх ↙', 'Зх ←', 'Пн-Зх ↖'];
  const index = Math.round(deg / 45) % 8;
  return `${deg}° (${directions[index]})`;
}

const val = (v) => (v === null || v === undefined ? '--' : v);
const setText = (id, text) => { document.getElementById(id).innerText = text; };

async function fetchWeatherData(lat, lon) {
  try {
    const params = [
      'precipitation',
      'wind_speed_10m', 'wind_direction_10m',
      'wind_speed_80m', 'wind_direction_80m',
      'wind_speed_120m', 'wind_direction_120m',
      'wind_speed_180m', 'wind_direction_180m',
      'wind_gusts_10m'
    ].join(',');

    // wind_speed_unit=ms — без цього Open-Meteo віддає км/год, а в інтерфейсі підписано м/с
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
                `&current=${params}&wind_speed_unit=ms`;
    const res = await fetch(url);
    const data = await res.json();
    const c = data.current;
    if (!c) throw new Error('no data');

    setText('precip', val(c.precipitation));
    for (const h of [10, 80, 120, 180]) {
      const sp = c[`wind_speed_${h}m`];
      setText(`wind-${h}m`, sp === null || sp === undefined ? '--' : `${sp} м/с`);
      setText(`dir-${h}m`, getWindDirectionSymbol(c[`wind_direction_${h}m`]));
    }
    setText('wind-gusts', val(c.wind_gusts_10m));

    setText('coords-display', `Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`);
    document.getElementById('weather-card').classList.remove('hidden');
  } catch (err) {
    alert('Не вдалося завантажити дані погоди.');
  }
}

/* ============================ MGRS: пошук ============================ */
function processMGRS() {
  const mgrsStr = document.getElementById('mgrs-input').value.trim();
  if (!mgrsStr) return;

  let lat, lon;
  try {
    [lat, lon] = MGRS.toLatLon(mgrsStr);
  } catch (e) {
    alert('Некоректний формат MGRS. Перевірте введені дані.');
    return;
  }

  map.setView([lat, lon], 12);
  if (currentMarker) map.removeLayer(currentMarker);
  currentMarker = L.marker([lat, lon]).addTo(map);
  fetchWeatherData(lat, lon);
}

document.getElementById('search-btn').addEventListener('click', processMGRS);
document.getElementById('mgrs-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') processMGRS();
});
document.getElementById('close-card').addEventListener('click', () => {
  document.getElementById('weather-card').classList.add('hidden');
});

loadRadarLayer();
setInterval(loadRadarLayer, 5 * 60 * 1000); // оновлення радара кожні 5 хв
