// Función serverless: lee el calendario iCal y devuelve los eventos en JSON.
// El navegador no puede leer el iCal directo (CORS), por eso este puente.

const ICAL_URL = 'https://calendar.google.com/calendar/ical/jose78ordu%40gmail.com/private-ca4de1d12f5af07ab0c8c7169b71054e/basic.ics';

// Desdobla líneas plegadas del formato iCal (las que empiezan con espacio continúan la anterior)
function unfold(text) {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

// Decodifica texto iCal (escapes \, \; \n etc.)
function decode(v) {
  if (!v) return '';
  return v.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
}
// Igual que decode pero conserva los saltos de línea (para descripciones largas)
function decodeMultiline(v) {
  if (!v) return '';
  let t = v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
  // limpiar HTML (Google a veces manda la descripción con <p>, <br>, etc.)
  t = t.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<\/div>/gi, '\n');
  t = t.replace(/<[^>]+>/g, '');
  t = t.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
  t = t.replace(/\n\s*\n\s*\n+/g, '\n\n').replace(/[ \t]+\n/g, '\n');
  return t.trim();
}

// Parsea una fecha iCal (20260620T090000 o 20260620 o con Z)
function parseICalDate(val) {
  if (!val) return null;
  // Quita parámetros tipo ;TZID=...: nos quedamos con el valor después de :
  const m = val.match(/(\d{8})(T(\d{6})(Z)?)?/);
  if (!m) return null;
  const y = +m[1].slice(0, 4), mo = +m[1].slice(4, 6) - 1, d = +m[1].slice(6, 8);
  let h = 0, mi = 0, s = 0;
  if (m[3]) { h = +m[3].slice(0, 2); mi = +m[3].slice(2, 4); s = +m[3].slice(4, 6); }
  // Si termina en Z es UTC; si no, lo tratamos como hora local del calendario.
  if (m[4] === 'Z') return new Date(Date.UTC(y, mo, d, h, mi, s)).toISOString();
  return new Date(y, mo, d, h, mi, s).toISOString();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60'); // cache 60s para no pegarle a Google en cada carga
  try {
    const resp = await fetch(ICAL_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ClimasGrecoAgenda/1.0)' } });
    if (!resp.ok) { res.status(502).json({ error: 'No se pudo leer el calendario', status: resp.status }); return; }
    const raw = unfold(await resp.text());
    const lines = raw.split(/\r\n|\n|\r/);

    const eventos = [];
    let cur = null;
    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
      if (line === 'END:VEVENT') { if (cur) eventos.push(cur); cur = null; continue; }
      if (!cur) continue;
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const keyPart = line.slice(0, idx);
      const value = line.slice(idx + 1);
      const key = keyPart.split(';')[0];
      if (key === 'SUMMARY') cur.titulo = decode(value);
      else if (key === 'LOCATION') cur.lugar = decode(value);
      else if (key === 'DESCRIPTION') cur.descripcion = decodeMultiline(value);
      else if (key === 'DTSTART') cur.inicio = parseICalDate(value);
      else if (key === 'DTEND') cur.fin = parseICalDate(value);
      else if (key === 'UID') cur.uid = value.trim();
      else if (key === 'STATUS') cur.status = value.trim();
    }

    res.status(200).json({ ok: true, eventos });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
};
