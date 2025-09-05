const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(express.json());

// Lightweight CORS (no external dependency)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Utilities arrays
const VALID_TYPES = ['water', 'electricity', 'gas'];
const VALID_STATUS = ['online', 'offline'];
const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 2000;

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function parseLimit(val) {
  const n = parseInt(val, 10);
  if (Number.isNaN(n) || n <= 0) return DEFAULT_LIMIT;
  return clamp(n, 1, MAX_LIMIT);
}

function toIsoDate(d) {
  if (d instanceof Date) return d.toISOString();
  try { return new Date(d).toISOString(); } catch { return new Date().toISOString(); }
}

function isValidDate(d) {
  return d instanceof Date && !Number.isNaN(d.valueOf());
}

function normalizeText(s) {
  return (s || '').toString().trim().toLowerCase();
}

function buildFiltersKey(q, status, type, accountId) {
  return JSON.stringify({ q: normalizeText(q), status: status || '', type: type || '', accountId: accountId ?? '' });
}

function encodeCursor(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}

function decodeCursor(str) {
  try {
    const val = JSON.parse(Buffer.from(str, 'base64').toString('utf8'));
    return val && typeof val === 'object' ? val : null;
  } catch (e) {
    return null;
  }
}

// Seeded RNG for deterministic dataset (per process run)
function seededRng(seed) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return function () {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

// Dataset generation
const TOTAL_METERS = 15000; // 15k for scale testing
const rng = seededRng(42);
const baseDate = new Date('2024-01-01T00:00:00.000Z');
const now = new Date();

function pad(n, width = 6) {
  const s = String(n);
  return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function randomBetween(min, max) {
  return min + (max - min) * rng();
}

function randomInt(min, maxInclusive) {
  return Math.floor(randomBetween(min, maxInclusive + 1));
}

function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }

function generateMeters(count) {
  const meters = [];
  for (let i = 1; i <= count; i++) {
    const idNum = i;
    const id = `MTR-${pad(idNum)}`;
    const type = pick(VALID_TYPES);
    const status = rng() < 0.75 ? 'online' : 'offline';
    const name = `Meter ${pad(idNum)}`;
    const meteringPoint = `MPN-${pad(idNum)}`;
    const accountId = 1000 + randomInt(1, 5);

    const createdAt = addDays(baseDate, randomInt(0, 240));
    let updatedAt = addDays(createdAt, randomInt(0, 120));
    if (updatedAt > now) updatedAt = new Date(now);

    let deletedAt = null;
    // Around 2% soft-deleted
    if (rng() < 0.02) {
      let del = addDays(updatedAt, randomInt(0, 60));
      if (del > now) del = new Date(now);
      deletedAt = del;
    }

    let lastReading;
    switch (type) {
      case 'water':
        lastReading = randomInt(0, 2000);
        break;
      case 'electricity':
        lastReading = randomInt(0, 50000);
        break;
      case 'gas':
        lastReading = randomInt(0, 10000);
        break;
      default:
        lastReading = randomInt(0, 10000);
    }

    const meter = {
      id,
      accountId,
      name,
      meteringPoint,
      meteringPointName: meteringPoint,
      type,
      meterType: type,
      status,
      lastReading,
      createdAt,
      updatedAt,
      deletedAt,
      // Precompute for fast search
      _idLower: id.toLowerCase(),
      _nameLower: name.toLowerCase(),
      _mpLower: meteringPoint.toLowerCase(),
    };

    meters.push(meter);
  }
  return meters;
}

const METERS = generateMeters(TOTAL_METERS);

// Basic route
app.get('/', (req, res) => {
  res.json({
    message: 'Smart View Mobile Backend',
    status: 'running',
    endpoints: [
      'GET /meters?limit=1000&cursor=<opaque>&q=<text>&status=<online|offline>&type=<water|electricity|gas>',
      'GET /meters/changes?since=<ISO8601>'
    ],
    totalMeters: METERS.length,
  });
});

// GET /meters with cursor-based pagination, debounced-search friendly
app.get('/meters', (req, res) => {
  try {
    const { limit: limitStr, cursor: cursorStr, q, status, type } = req.query;

    // Validate filters
    const normalizedStatus = status ? String(status) : undefined;
    const normalizedType = type ? String(type) : undefined;
    const accountIdStr = req.query.accountId;
    const accountIdFilter = accountIdStr !== undefined ? Number(accountIdStr) : undefined;
    if (accountIdStr !== undefined && Number.isNaN(accountIdFilter)) {
      return res.status(400).json({ error: 'Invalid accountId. Expect number.' });
    }
    if (normalizedStatus && !VALID_STATUS.includes(normalizedStatus)) {
      return res.status(400).json({ error: 'Invalid status. Allowed: online|offline' });
    }
    if (normalizedType && !VALID_TYPES.includes(normalizedType)) {
      return res.status(400).json({ error: 'Invalid type. Allowed: water|electricity|gas' });
    }

    const limit = parseLimit(limitStr);

    // Build filter key for cursor scoping
    const fk = buildFiltersKey(q, normalizedStatus, normalizedType, accountIdFilter);

    // Apply filters and search (cache-first model handled at client)
    const qn = normalizeText(q);

    // Exclude deleted from primary listing
    let filtered = METERS.filter((m) => !m.deletedAt);

    if (normalizedStatus) {
      filtered = filtered.filter((m) => m.status === normalizedStatus);
    }
    if (normalizedType) {
      filtered = filtered.filter((m) => m.type === normalizedType);
    }
    if (accountIdFilter !== undefined) {
      filtered = filtered.filter((m) => m.accountId === accountIdFilter);
    }
    if (qn) {
      filtered = filtered.filter((m) =>
        m._idLower.includes(qn) || m._nameLower.includes(qn) || m._mpLower.includes(qn)
      );
    }

    // Sort by ID ascending (IDs are zero-padded)
    filtered.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    // Cursor handling
    let startIndex = 0;
    if (cursorStr) {
      const cur = decodeCursor(String(cursorStr));
      if (cur && cur.lastId && cur.fk === fk) {
        const idx = filtered.findIndex((m) => m.id === cur.lastId);
        if (idx >= 0) startIndex = idx + 1;
      }
      // if cursor invalid or fk mismatch, we start from beginning
    }

    const page = filtered.slice(startIndex, startIndex + limit);

    let nextCursor = null;
    let hasMore = false;
    if (startIndex + limit < filtered.length) {
      hasMore = true;
      const lastId = page[page.length - 1].id;
      nextCursor = encodeCursor({ lastId, fk });
    }

    // Trim fields for payload
    const items = page.map((m) => ({
      id: m.id,
      accountId: m.accountId,
      name: m.name,
      meteringPoint: m.meteringPoint,
      type: m.type,
      status: m.status,
      lastReading: m.lastReading,
      updatedAt: m.updatedAt,
    }));

    res.json({
      items,
      nextCursor,
      hasMore,
      limit,
    });
  } catch (err) {
    console.error('GET /meters error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /meters/changes?since=<ISO8601>
// Returns updated (upserts) and deleted since a given timestamp.
app.get('/meters/changes', (req, res) => {
  try {
    const { since } = req.query;
    if (!since) return res.status(400).json({ error: 'Missing required query param: since (ISO8601)' });

    const sinceDate = new Date(String(since));
    if (!isValidDate(sinceDate)) {
      return res.status(400).json({ error: 'Invalid since. Expect ISO8601 date string.' });
    }

    // Use the server time as the high-water mark for the client
    const serverNow = new Date();

    const updated = METERS.filter((m) => !m.deletedAt && m.updatedAt > sinceDate).map((m) => ({
      id: m.id,
      name: m.name,
      meteringPoint: m.meteringPoint,
      type: m.type,
      status: m.status,
      lastReading: m.lastReading,
      updatedAt: m.updatedAt,
    }));

    const deleted = METERS.filter((m) => m.deletedAt && m.deletedAt > sinceDate).map((m) => ({
      id: m.id,
      deletedAt: m.deletedAt,
    }));

    res.json({
      updated,
      deleted,
      now: serverNow.toISOString(),
    });
  } catch (err) {
    console.error('GET /meters/changes error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mock JSON exports for convenience/testing
app.get('/mock/meters.json', (req, res) => {
  try {
    const items = METERS.filter((m) => !m.deletedAt).map((m) => ({
      id: m.id,
      name: m.name,
      meteringPoint: m.meteringPoint,
      type: m.type,
      status: m.status,
      lastReading: m.lastReading,
      updatedAt: m.updatedAt,
      createdAt: m.createdAt,
    }));
    res.json({ items, total: items.length });
  } catch (err) {
    console.error('GET /mock/meters.json error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/mock/changes.json', (req, res) => {
  try {
    const { since } = req.query;
    if (!since) return res.status(400).json({ error: 'Missing required query param: since (ISO8601)' });
    const sinceDate = new Date(String(since));
    if (!isValidDate(sinceDate)) {
      return res.status(400).json({ error: 'Invalid since. Expect ISO8601 date string.' });
    }

    const serverNow = new Date();

    const updated = METERS.filter((m) => !m.deletedAt && m.updatedAt > sinceDate).map((m) => ({
      id: m.id,
      name: m.name,
      meteringPoint: m.meteringPoint,
      type: m.type,
      status: m.status,
      lastReading: m.lastReading,
      updatedAt: m.updatedAt,
    }));

    const deleted = METERS.filter((m) => m.deletedAt && m.deletedAt > sinceDate).map((m) => ({
      id: m.id,
      deletedAt: m.deletedAt,
    }));

    res.json({ updated, deleted, now: serverNow.toISOString() });
  } catch (err) {
    console.error('GET /mock/changes.json error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DB-schema mock JSON
app.get('/mock/db-meters.json', (req, res) => {
  try {
    const items = METERS.filter((m) => !m.deletedAt).map((m) => ({
      id: m.id,
      accountId: m.accountId,
      name: m.name,
      meteringPointName: m.meteringPointName,
      meterType: m.meterType,
      status: m.status,
      lastReading: m.lastReading,
      updatedAt: m.updatedAt,
    }));
    res.json({ items, total: items.length });
  } catch (err) {
    console.error('GET /mock/db-meters.json error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/mock/db-changes.json', (req, res) => {
  try {
    const { since } = req.query;
    if (!since) return res.status(400).json({ error: 'Missing required query param: since (ISO8601)' });
    const sinceDate = new Date(String(since));
    if (!isValidDate(sinceDate)) {
      return res.status(400).json({ error: 'Invalid since. Expect ISO8601 date string.' });
    }

    const serverNow = new Date();

    const updated = METERS.filter((m) => !m.deletedAt && m.updatedAt > sinceDate).map((m) => ({
      id: m.id,
      accountId: m.accountId,
      name: m.name,
      meteringPointName: m.meteringPointName,
      meterType: m.meterType,
      status: m.status,
      lastReading: m.lastReading,
      updatedAt: m.updatedAt,
    }));

    const deleted = METERS.filter((m) => m.deletedAt && m.deletedAt > sinceDate).map((m) => ({
      id: m.id,
      deletedAt: m.deletedAt,
    }));

    res.json({ updated, deleted, now: serverNow.toISOString() });
  } catch (err) {
    console.error('GET /mock/db-changes.json error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
