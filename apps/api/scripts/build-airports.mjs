// Builds src/data/airports.json (code -> [lat, lon]) from OurAirports
// (public domain, https://ourairports.com/data/), for drawing route lines.
// Keeps airports with scheduled service plus all large and medium ones.
// Usage: node scripts/build-airports.mjs path/to/airports.csv
import { readFileSync, writeFileSync } from 'node:fs';

const [csvPath] = process.argv.slice(2);
if (!csvPath) throw new Error('Pass the path to OurAirports airports.csv');

/** Splits one CSV line, honouring quoted fields. */
function fields(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') ((cur += '"'), i++);
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') (out.push(cur), (cur = ''));
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const [header, ...rows] = readFileSync(csvPath, 'utf8').split(/\r?\n/).filter(Boolean);
const col = Object.fromEntries(fields(header).map((name, i) => [name, i]));
const airports = {};
for (const row of rows) {
  const f = fields(row);
  const type = f[col.type];
  if (f[col.scheduled_service] !== 'yes' && type !== 'large_airport' && type !== 'medium_airport')
    continue;
  const pos = [Number(f[col.latitude_deg]).toFixed(3), Number(f[col.longitude_deg]).toFixed(3)].map(
    Number,
  );
  // IATA codes are 3 letters, ICAO 4; a 3-character local code could clash with an IATA one.
  const iata = f[col.iata_code];
  const icao = f[col.icao_code] || f[col.gps_code];
  if (/^[A-Z]{3}$/.test(iata) && !(iata in airports)) airports[iata] = pos;
  if (/^[A-Z0-9]{4}$/.test(icao) && !(icao in airports)) airports[icao] = pos;
}
const sorted = Object.fromEntries(Object.entries(airports).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(new URL('../src/data/airports.json', import.meta.url), JSON.stringify(sorted) + '\n');
console.log(`${Object.keys(sorted).length} codes`);
