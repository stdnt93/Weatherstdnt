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
