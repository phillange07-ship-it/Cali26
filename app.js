const { tripName, startDate, endDate, people, categories, spots: initialSpots, itinerary, flights, accommodations, car } = window.TRIP_DATA;
const config = window.APP_CONFIG;
let spots = initialSpots.slice();
let map;
let userMarker;
let userPosition = null;
let locationWatchId = null;
let hasCenteredOnUser = false;
let markers = new Map();
let activeCategories = new Set(Object.keys(categories));
let supabaseClient = null;
let selectedPlanDate = null;
let routeOnlyMode = false;

const $ = (id) => document.getElementById(id);
const todayISO = () => new Date().toISOString().slice(0, 10);
const byId = (id) => spots.find((s) => s.id === id);
const tripLengthDays = itinerary.length;
const LOCAL_EXPENSES_KEY = 'laExpenses';
const LOCAL_SPOTS_KEY = 'laSpots';
const LOCAL_ITINERARY_KEY = 'laItineraryDays';
const LOCAL_FIXED_GEOCODE_KEY = 'laFixedGeocodes';
const APP_VERSION = window.APP_VERSION || '2026-06-12-6';
const FIXED_STAY_COORD_OVERRIDES = {
  'san-gabriel-house': { lat: 34.085038, lng: -118.09478 },
  'las-vegas-condo': { lat: 36.0360463, lng: -115.1742481 },
  'san-diego-house': { lat: 32.7173898, lng: -117.1201655 }
};
let routePolyline = null;
let routeOutlinePolyline = null;
let activeRouteRequestId = 0;

function initSupabase() {
  if (config.SUPABASE_ENABLED && config.SUPABASE_URL && config.SUPABASE_ANON_KEY && window.supabase) {
    supabaseClient = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    $('storage-hint').textContent = getStorageHintText();
    return;
  }

  $('storage-hint').textContent = config.SUPABASE_ENABLED
    ? 'Supabase ist konfiguriert, konnte aber hier gerade nicht initialisiert werden. Bitte Seite hart neu laden.'
    : getStorageHintText();
}

async function hydrateSpots() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient.from(config.SUPABASE_SPOTS_TABLE || 'spots').select('*');
  if (error) {
    console.warn('Spots konnten nicht aus Supabase geladen werden:', error.message);
    return;
  }
  if (Array.isArray(data) && data.length) {
    const merged = new Map(initialSpots.map((spot) => [spot.id, spot]));
    data.forEach((spot) => {
      const localSpot = merged.get(spot.id);
      if (localSpot && ['stay', 'travel'].includes(localSpot.category)) {
        merged.set(spot.id, { ...spot, ...localSpot });
        return;
      }
      merged.set(spot.id, { ...localSpot, ...spot });
    });
    spots = Array.from(merged.values());
  }
}

function loadLocalSpots() {
  const stored = JSON.parse(localStorage.getItem(LOCAL_SPOTS_KEY) || 'null');
  return Array.isArray(stored) && stored.length ? stored : initialSpots.slice();
}

function persistLocalSpots() {
  localStorage.setItem(LOCAL_SPOTS_KEY, JSON.stringify(spots));
}

function loadLocalItineraryOverrides() {
  const stored = JSON.parse(localStorage.getItem(LOCAL_ITINERARY_KEY) || '[]');
  return Array.isArray(stored) ? stored : [];
}

function persistLocalItineraryOverrides(rows) {
  localStorage.setItem(LOCAL_ITINERARY_KEY, JSON.stringify(rows));
}

function loadFixedGeocodeCache() {
  try {
    const stored = JSON.parse(localStorage.getItem(LOCAL_FIXED_GEOCODE_KEY) || '{}');
    return stored && typeof stored === 'object' ? stored : {};
  } catch {
    return {};
  }
}

function persistFixedGeocodeCache(cache) {
  localStorage.setItem(LOCAL_FIXED_GEOCODE_KEY, JSON.stringify(cache));
}

async function checkForAppUpdate() {
  try {
    const response = await fetch(`version.json?v=${encodeURIComponent(APP_VERSION)}`, { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    const remoteVersion = data?.version;
    if (!remoteVersion || remoteVersion === APP_VERSION) return;

    const url = new URL(window.location.href);
    if (url.searchParams.get('cv') === remoteVersion) return;
    url.searchParams.set('cv', remoteVersion);
    window.location.replace(url.toString());
  } catch {
    // still fine offline / with flaky connectivity
  }
}

function flashNavigationTarget(hash) {
  if (!hash) return;
  const links = Array.from(document.querySelectorAll(`.app-header a[href="${hash}"], .quick-nav a[href="${hash}"]`));
  const target = document.querySelector(hash);
  if (!target) return;

  links.forEach((link) => link.classList.add('nav-flash'));
  target.classList.add('section-flash');

  window.setTimeout(() => {
    links.forEach((link) => link.classList.remove('nav-flash'));
    target.classList.remove('section-flash');
  }, 1400);
}

function bindSectionNavigation() {
  document.querySelectorAll('.app-header a[href^="#"], .quick-nav a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const hash = link.getAttribute('href');
      const target = hash ? document.querySelector(hash) : null;
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', hash);
      flashNavigationTarget(hash);
    });
  });
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizePlanItems(value, fallbackText = '') {
  if (Array.isArray(value)) {
    return value.map((item, index) => ({
      id: item.id || `plan-item-${index + 1}`,
      type: item.type || 'note',
      title: item.title || '',
      spot_id: item.spot_id || '',
      address: item.address || '',
      note: item.note || '',
      done: Boolean(item.done)
    }));
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      return normalizePlanItems(JSON.parse(value));
    } catch {
      return [];
    }
  }

  if (fallbackText.trim()) {
    return fallbackText
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((title, index) => ({
        id: `legacy-item-${index + 1}`,
        type: 'note',
        title,
        spot_id: '',
        address: '',
        note: '',
        done: false
      }));
  }

  return [];
}

function planItemsToLegacyText(items) {
  return items
    .map((item) => item.title?.trim() || item.note?.trim() || '')
    .filter(Boolean)
    .join('\n');
}

function applyItineraryOverrides(rows) {
  rows.forEach((row) => {
    const day = itinerary.find((entry) => entry.date === row.date);
    if (!day) return;
    day.title = row.title || day.title;
    day.summary = row.summary || day.summary;
    day.notes = row.notes || '';
    day.plan_items_text = row.plan_items_text || '';
    day.plan_items = normalizePlanItems(row.plan_items_json, row.plan_items_text || '');
  });
}

async function hydrateItineraryPlans() {
  if (supabaseClient) {
    const { data, error } = await supabaseClient.from(config.SUPABASE_ITINERARY_TABLE || 'itinerary_days').select('*');
    if (!error) {
      applyItineraryOverrides(data || []);
      return;
    }
    console.warn('Tagesplanung konnte nicht aus Supabase geladen werden:', error.message);
  }
  applyItineraryOverrides(loadLocalItineraryOverrides());
}

function getTodayPlan() {
  const today = todayISO();
  const exact = itinerary.find((d) => d.date === today);
  if (exact) return exact;
  const tripStart = new Date(startDate + 'T00:00:00');
  const tripEnd = new Date(endDate + 'T23:59:59');
  const now = new Date();
  if (now < tripStart) return itinerary[0];
  if (now > tripEnd) return itinerary[itinerary.length - 1];
  return itinerary[0];
}

function getSelectedPlan() {
  if (!selectedPlanDate) selectedPlanDate = getTodayPlan().date;
  return itinerary.find((d) => d.date === selectedPlanDate) || getTodayPlan();
}

function getLiveTripWindow() {
  const today = todayISO();
  const departureFlight = flights.find((flight) => flight.type === 'Hinflug');
  const returnFlight = flights.find((flight) => flight.type === 'Rückflug');
  const departureDate = departureFlight?.date || startDate;
  const returnDate = returnFlight?.date || endDate;
  const beforeTrip = today < departureDate;
  const afterTrip = today > returnDate;
  const duringTrip = !beforeTrip && !afterTrip;

  return { today, departureFlight, returnFlight, departureDate, returnDate, beforeTrip, duringTrip, afterTrip };
}

function getActiveAccommodation(date = getSelectedPlan().date) {
  return accommodations.find((stay) => date >= stay.start && date < stay.end) || accommodations[accommodations.length - 1];
}

function getNextAccommodation(date = getSelectedPlan().date) {
  return accommodations.find((stay) => stay.start > date) || null;
}

function getPlanItemsForDay(day = getSelectedPlan()) {
  day.plan_items = normalizePlanItems(day.plan_items, day.plan_items_text || '');
  return day.plan_items;
}

function getCombinedRouteIds(day = getSelectedPlan()) {
  const seen = new Set();
  const ids = [];
  const addId = (id) => {
    if (!id || seen.has(id) || !byId(id)) return;
    seen.add(id);
    ids.push(id);
  };

  (day.route || []).forEach(addId);
  getPlanItemsForDay(day)
    .filter((item) => item.type === 'spot' && item.spot_id)
    .forEach((item) => addId(item.spot_id));

  return ids;
}

function getCombinedRouteSpots(day = getSelectedPlan()) {
  return getCombinedRouteIds(day).map(byId).filter(Boolean);
}

function buildDayRouteWaypoints(day = getSelectedPlan()) {
  const waypoints = [];
  const seen = new Set();
  const activeStay = getActiveAccommodation(day.date);

  const addPoint = (point, type = 'spot') => {
    if (!point || point.lat == null || point.lng == null) return;
    const key = point.id || `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
    if (seen.has(key)) return;
    seen.add(key);
    waypoints.push({
      id: point.id || key,
      name: point.name || point.city || 'Punkt',
      lat: Number(point.lat),
      lng: Number(point.lng),
      type
    });
  };

  addPoint(activeStay, 'stay');
  getCombinedRouteSpots(day).forEach((spot) => addPoint(spot, 'spot'));
  return waypoints;
}

function getTimelineEntries(day = getSelectedPlan()) {
  const fixedEntries = (day.route || []).map((spotId, index) => ({
    key: `fixed-${spotId}-${index}`,
    kind: 'fixed-spot',
    stepType: 'base',
    title: '',
    note: '',
    done: false,
    itemId: null,
    spot: byId(spotId),
    address: ''
  }));

  const plannedEntries = getPlanItemsForDay(day).map((item) => ({
    key: item.id,
    kind: item.type || 'note',
    stepType: 'planned',
    title: item.title || '',
    note: item.note || '',
    done: Boolean(item.done),
    itemId: item.id,
    spot: item.type === 'spot' && item.spot_id ? byId(item.spot_id) : null,
    address: item.address || ''
  }));

  const firstPendingIndex = plannedEntries.findIndex((entry) => !entry.done);
  return [...fixedEntries, ...plannedEntries].map((entry, index) => ({
    ...entry,
    index,
    isNext: entry.stepType === 'planned' && firstPendingIndex >= 0 && plannedEntries[firstPendingIndex]?.itemId === entry.itemId
  }));
}

function getPlannedProgress(day = getSelectedPlan()) {
  const plannedEntries = getTimelineEntries(day).filter((entry) => entry.stepType === 'planned');
  const doneCount = plannedEntries.filter((entry) => entry.done).length;
  const nextEntry = plannedEntries.find((entry) => !entry.done) || null;
  return { total: plannedEntries.length, doneCount, nextEntry };
}

function getFocusedRouteSpotId(day = getSelectedPlan()) {
  const progress = getPlannedProgress(day);
  if (progress.nextEntry?.kind === 'spot' && progress.nextEntry.spot?.id) {
    return progress.nextEntry.spot.id;
  }

  const nextOpenSpot = getTimelineEntries(day).find((entry) => !entry.done && entry.spot?.id);
  if (nextOpenSpot?.spot?.id) return nextOpenSpot.spot.id;

  return getCombinedRouteIds(day)[0] || '';
}

function describeTimelineEntry(entry) {
  if (entry.kind === 'fixed-spot') {
    if (!entry.spot) {
      return {
        title: 'Spot fehlt',
        detail: 'Dieser feste Routeneintrag existiert aktuell nicht mehr in den Spots.',
        href: '',
        icon: '📍'
      };
    }
    const category = categories[entry.spot.category] || { icon: '📍' };
    return {
      title: entry.spot.name,
      detail: entry.spot.note || '',
      href: googleMapsLink(entry.spot),
      icon: category.icon
    };
  }

  if (entry.kind === 'spot') {
    if (!entry.spot) {
      return {
        title: entry.title || 'Geplanter Spot',
        detail: 'Der verknüpfte Spot existiert aktuell nicht mehr.',
        href: '',
        icon: '📍'
      };
    }
    const category = categories[entry.spot.category] || { icon: '📍' };
    return {
      title: entry.title || entry.spot.name,
      detail: entry.note || entry.spot.note || '',
      href: googleMapsLink(entry.spot),
      icon: category.icon
    };
  }

  if (entry.kind === 'address') {
    return {
      title: entry.title || 'Adresse',
      detail: entry.note || entry.address || '',
      href: entry.address ? googleMapsAddressLink(entry.address) : '',
      icon: '📍'
    };
  }

  return {
    title: entry.title || 'Freier Punkt',
    detail: entry.note || 'Ohne zusätzliche Notiz',
    href: '',
    icon: '📝'
  };
}

function renderTimelineItem(entry) {
  const meta = describeTimelineEntry(entry);
  const classes = ['timeline-item'];
  if (entry.stepType === 'base') classes.push('is-base');
  if (entry.done) classes.push('is-done');
  if (entry.isNext) classes.push('is-next');

  const badge = entry.stepType === 'base'
    ? '<span class="timeline-badge">Basis</span>'
    : (entry.done ? '<span class="timeline-badge">Erledigt</span>' : (entry.isNext ? '<span class="timeline-badge">Als Nächstes</span>' : '<span class="timeline-badge">Offen</span>'));

  const action = entry.stepType === 'planned'
    ? `<button class="secondary timeline-toggle" type="button" data-toggle-plan-item="${escapeHtml(entry.itemId)}">${entry.done ? 'Wieder offen' : 'Erledigt'}</button>`
    : '';

  return `
    <li class="${classes.join(' ')}">
      <span class="step">${entry.index + 1}</span>
      <div class="timeline-body">
        <div class="timeline-head">
          <b>${meta.icon} ${escapeHtml(meta.title)}</b>
          ${badge}
        </div>
        <small>${escapeHtml(meta.detail)}</small>
        <div class="timeline-links">
          ${meta.href ? `<a class="map-link secondary" target="_blank" href="${meta.href}">Route öffnen</a>` : ''}
          ${action}
        </div>
      </div>
    </li>
  `;
}

function getSpotsForSelectedDay() {
  return getCombinedRouteSpots(getSelectedPlan());
}

function daysUntil(isoDate, baseDate = getSelectedPlan().date) {
  const start = new Date(`${baseDate}T00:00:00`);
  const end = new Date(`${isoDate}T00:00:00`);
  return Math.round((end - start) / 86400000);
}

function formatDistance(distance) {
  if (distance == null) return 'Distanz nach Standortfreigabe';
  if (distance < 1000) return `${Math.round(distance)} m entfernt`;
  return `${(distance / 1000).toFixed(1).replace('.', ',')} km entfernt`;
}

function getSpotDistance(spot) {
  if (!userPosition) return null;
  return distanceMeters(userPosition, spot);
}

function getVisibleSpots() {
  const routeIds = new Set(getCombinedRouteIds(getSelectedPlan()));
  return spots.filter((spot) => activeCategories.has(spot.category) && (!routeOnlyMode || routeIds.has(spot.id)));
}

function getAccommodationCountdownLabel() {
  const { today, beforeTrip, duringTrip, afterTrip } = getLiveTripWindow();

  if (beforeTrip) {
    const firstStay = accommodations[0];
    const diff = daysUntil(firstStay.start, today);
    if (diff <= 0) return `Heute Check-in in ${firstStay.city}`;
    if (diff === 1) return `Noch 1 Tag bis ${firstStay.city}`;
    return `Noch ${diff} Tage bis ${firstStay.city}`;
  }

  if (afterTrip) return 'Keine weitere Unterkunft geplant';

  const nextStay = accommodations.find((stay) => stay.start > today) || null;
  if (!duringTrip || !nextStay) return 'Letzte Unterkunft der Reise aktiv';

  const diff = daysUntil(nextStay.start, today);
  if (diff <= 0) return `Heute Wechsel nach ${nextStay.city}`;
  if (diff === 1) return `Noch 1 Tag bis ${nextStay.city}`;
  return `Noch ${diff} Tage bis ${nextStay.city}`;
}

function getTripPhaseSummary() {
  const { today, departureFlight, returnFlight, departureDate, returnDate, beforeTrip, duringTrip, afterTrip } = getLiveTripWindow();

  if (beforeTrip) {
    const diff = daysUntil(departureDate, today);
    if (diff <= 0) {
      return { label: 'Abreise', value: 'Heute geht es los', detail: `Abflug um ${departureFlight?.depart || '--:--'} ab BER` };
    }
    if (diff === 1) {
      return { label: 'Abreise', value: 'Noch 1 Tag bis zur Abreise', detail: `BER -> LAX am ${dateShort(departureDate)}` };
    }
    return { label: 'Abreise', value: `Noch ${diff} Tage bis zur Abreise`, detail: `BER -> LAX am ${dateShort(departureDate)}` };
  }

  if (afterTrip) {
    return { label: 'Reise', value: 'Reise abgeschlossen', detail: `Rückflug war am ${dateShort(returnDate)}` };
  }

  const todayPlan = duringTrip ? (itinerary.find((day) => day.date === today) || getTodayPlan()) : getTodayPlan();
  const nextPlan = itinerary.find((day) => day.date > today);
  return {
    label: 'Heute',
    value: todayPlan.title,
      detail: nextPlan ? `Als nächstes: ${nextPlan.title} am ${dateShort(nextPlan.date)}` : `Rückflug um ${returnFlight?.depart || '--:--'} ab LAX`
  };
}

function getStorageHintText() {
  if (supabaseClient) {
    return '';
  }
  if (config.SUPABASE_ENABLED) {
    return 'Supabase ist konfiguriert, konnte aber hier gerade nicht initialisiert werden. Bitte Seite hart neu laden.';
  }
  return 'Aktuell: lokaler Demo-Speicher. Für gemeinsame Ausgaben, Beteiligte und Bon-Fotos bitte Supabase in config.js aktivieren.';
}

function getReceiptUrl(expense) {
  if (expense.receipt_url) return expense.receipt_url;
  if (supabaseClient && expense.receipt_path) {
    const { data } = supabaseClient.storage.from(config.SUPABASE_RECEIPT_BUCKET).getPublicUrl(expense.receipt_path);
    return data?.publicUrl || '';
  }
  if (expense.receipt_data_url) return expense.receipt_data_url;
  return '';
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function generateSpotId(name) {
  return `${slugify(name) || 'spot'}-${Date.now()}`;
}

function extractCoordsFromText(value) {
  const directMatch = value.match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  if (directMatch) {
    return { lat: Number(directMatch[1]), lng: Number(directMatch[2]) };
  }

  const mapMatch = value.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (mapMatch) {
    return { lat: Number(mapMatch[1]), lng: Number(mapMatch[2]) };
  }

  return null;
}

function extractQueryFromMapsLink(value) {
  try {
    const url = new URL(value);
    const candidates = ['q', 'query', 'destination'];
    for (const key of candidates) {
      const param = url.searchParams.get(key);
      if (param) return param;
    }

    const placeMatch = decodeURIComponent(url.pathname).match(/\/place\/([^/]+)/);
    if (placeMatch?.[1]) {
      return placeMatch[1].replaceAll('+', ' ').trim();
    }

    const pathSegments = decodeURIComponent(url.pathname)
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean)
      .filter((segment) => !['maps', 'place', 'search', 'dir'].includes(segment.toLowerCase()));
    if (pathSegments.length) {
      return pathSegments[pathSegments.length - 1].replaceAll('+', ' ').trim();
    }
  } catch {
    return '';
  }
  return '';
}

function normalizeAddressQuery(value) {
  return value
    .replace(/^https?:\/\/\S+$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\bUSA\b/gi, '')
    .replace(/\bUnited States\b/gi, '')
    .replace(/\s+-\s+/g, ' ')
    .trim()
    .replace(/^"+|"+$/g, '');
}

function getGeocodingCandidates(rawInput) {
  const trimmed = rawInput.trim();
  const fromLink = extractQueryFromMapsLink(trimmed);
  const candidates = [
    trimmed,
    fromLink,
    normalizeAddressQuery(fromLink || trimmed)
  ].filter(Boolean);

  return [...new Set(candidates)];
}

async function geocodeSpotInput(rawInput) {
  const trimmed = rawInput.trim();
  const directCoords = extractCoordsFromText(trimmed);
  if (directCoords) return { ...directCoords, resolvedLabel: trimmed };

  const candidates = getGeocodingCandidates(trimmed);
  for (const query of candidates) {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: '1',
      countrycodes: 'us',
      addressdetails: '1'
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { 'Accept-Language': 'de,en;q=0.8' }
    });
    if (!response.ok) {
      throw new Error(`Geocoding fehlgeschlagen (${response.status})`);
    }
    const results = await response.json();
    if (Array.isArray(results) && results.length) {
      return {
        lat: Number(results[0].lat),
        lng: Number(results[0].lon),
        resolvedLabel: results[0].display_name || query
      };
    }
  }

  throw new Error('Kein passender Ort gefunden. Bitte Adresse oder Maps-Link prüfen.');
}

async function syncFixedAccommodationCoordinates() {
  const cache = loadFixedGeocodeCache();
  const stayLikeIds = new Set(accommodations.map((stay) => stay.id));

  for (const stay of accommodations) {
    if (!stay.address) continue;

    let coords = FIXED_STAY_COORD_OVERRIDES[stay.id] || cache[stay.id];
    if (!coords) {
      try {
        const geocoded = await geocodeSpotInput(stay.address);
        coords = { lat: geocoded.lat, lng: geocoded.lng };
        cache[stay.id] = coords;
      } catch (error) {
        console.warn(`Unterkunft konnte nicht geocodet werden: ${stay.name}`, error);
        continue;
      }
    }

    stay.lat = coords.lat;
    stay.lng = coords.lng;
    cache[stay.id] = coords;
  }

  spots.forEach((spot) => {
    if (!stayLikeIds.has(spot.id) || !spot.address) return;
    const coords = cache[spot.id];
    if (!coords) return;
    spot.lat = coords.lat;
    spot.lng = coords.lng;
  });

  persistFixedGeocodeCache(cache);
}

function currency(value) {
  return `${Number(value || 0).toFixed(2)} $`;
}

function getSelectedParticipants() {
  return Array.from(document.querySelectorAll('.participant-toggle:checked')).map((input) => input.value);
}

function getSplitMode() {
  return $('expense-split-mode')?.value || 'equal';
}

function renderParticipantSelector() {
  $('expense-participants').innerHTML = people.map((person) => `
    <label class="participant-chip">
      <input class="participant-toggle" type="checkbox" value="${person}" checked />
      <span>${person}<small> ist an diesem Beleg beteiligt</small></span>
    </label>
  `).join('');

  document.querySelectorAll('.participant-toggle').forEach((input) => {
    input.addEventListener('change', () => {
      renderSplitEditor();
      updateSplitPreview();
    });
  });
}

function renderSplitEditor() {
  const selected = getSelectedParticipants();
  const splitMode = getSplitMode();

  if (!selected.length) {
    $('split-editor').innerHTML = '<p class="hint">Bitte mindestens eine beteiligte Person auswählen.</p>';
    return;
  }

  if (splitMode === 'equal') {
    $('split-editor').innerHTML = `
      <div class="field-heading">
        <strong>Aufteilung</strong>
        <small>Gesamtbetrag inklusive Tip wird gleich auf alle beteiligten Personen verteilt.</small>
      </div>
    `;
    return;
  }

  $('split-editor').innerHTML = `
    <div class="field-heading">
      <strong>Individuelle Anteile ohne Tip</strong>
      <small>Trage pro Person nur Essen/Getränke ein. Der Tip wird automatisch gleich verteilt.</small>
    </div>
    ${selected.map((person) => `
      <div class="split-row">
        <div>
          <strong>${person}</strong>
          <small>Eigenanteil ohne Tip</small>
        </div>
        <label>
          <span class="sr-only">${person}</span>
          <input class="split-amount-input" data-person="${person}" type="number" min="0" step="0.01" value="0" placeholder="0.00" />
        </label>
      </div>
    `).join('')}
  `;

  document.querySelectorAll('.split-amount-input').forEach((input) => {
    input.addEventListener('input', updateSplitPreview);
  });
}

function getSplitDraft() {
  const total = Number($('expense-amount').value || 0);
  const tip = Number($('expense-tip').value || 0);
  const participants = getSelectedParticipants();
  const splitMode = getSplitMode();
  const subtotal = Math.max(0, total - tip);

  if (tip > total) {
    return { ok: false, message: 'Der Tip kann nicht größer als der Gesamtbetrag sein.' };
  }

  if (!participants.length) {
    return { ok: false, message: 'Bitte mindestens eine beteiligte Person auswählen.' };
  }

  if (splitMode === 'equal') {
    const perPerson = participants.length ? total / participants.length : 0;
    const perTip = participants.length ? tip / participants.length : 0;
    const perFood = participants.length ? subtotal / participants.length : 0;
    return {
      ok: true,
      splitMode,
      participants,
      total,
      tip,
      subtotal,
      splits: participants.map((person) => ({
        person,
        food_amount: perFood,
        tip_amount: perTip,
        total_amount: perPerson
      }))
    };
  }

  const splits = participants.map((person) => {
    const input = document.querySelector(`.split-amount-input[data-person="${CSS.escape(person)}"]`);
    const foodAmount = Number(input?.value || 0);
    const tipAmount = participants.length ? tip / participants.length : 0;
    return {
      person,
      food_amount: foodAmount,
      tip_amount: tipAmount,
      total_amount: foodAmount + tipAmount
    };
  });

  const customSubtotal = splits.reduce((sum, split) => sum + split.food_amount, 0);
  if (Math.abs(customSubtotal - subtotal) > 0.02) {
    return {
      ok: false,
      message: `Die individuellen Anteile ergeben ${currency(customSubtotal)}. Erwartet werden ${currency(subtotal)} ohne Tip.`
    };
  }

  return { ok: true, splitMode, participants, total, tip, subtotal, splits };
}

function updateSplitPreview() {
  const draft = getSplitDraft();
  if (!draft.ok) {
    $('split-preview').textContent = draft.message;
    return;
  }

  $('split-preview').innerHTML = draft.splits.map((split) => `
    <div><strong>${split.person}</strong>: ${currency(split.total_amount)} <small>(${currency(split.food_amount)} + ${currency(split.tip_amount)} Tip)</small></div>
  `).join('');
}

function fillSpotCategories() {
  $('spot-category').innerHTML = Object.entries(categories)
    .filter(([key]) => !['stay', 'travel'].includes(key))
    .map(([key, category]) => `<option value="${key}">${category.icon} ${category.label}</option>`)
    .join('');
}

function setPanelState(panelId, buttonId, isOpen) {
  const panel = $(panelId);
  const button = $(buttonId);
  panel.hidden = !isOpen;
  button.setAttribute('aria-expanded', String(isOpen));
}

function togglePanel(panelId, buttonId) {
  const panel = $(panelId);
  setPanelState(panelId, buttonId, panel.hidden);
}

function resetSpotForm() {
  $('spot-id').value = '';
  $('spot-form-title').textContent = 'Neuen Spot anlegen';
  $('spot-submit').textContent = 'Spot speichern';
  $('spot-cancel-edit').hidden = true;
  $('spot-form').reset();
  $('spot-status').textContent = 'Neue Spots erscheinen direkt auf Karte, in Nearby und in den Filtern.';
  $('spot-category').value = 'food';
}

function editSpot(spotId) {
  const spot = byId(spotId);
  if (!spot) return;
  $('spot-id').value = spot.id;
  $('spot-name').value = spot.name;
  $('spot-category').value = spot.category;
  $('spot-address').value = spot.address || `${spot.lat}, ${spot.lng}`;
  $('spot-note').value = spot.note || '';
  $('spot-form-title').textContent = 'Spot bearbeiten';
  $('spot-submit').textContent = 'Spot aktualisieren';
  $('spot-cancel-edit').hidden = false;
  $('spot-status').textContent = 'Änderungen werden direkt für alle gespeichert.';
  setPanelState('spot-form-panel', 'toggle-spot-form', true);
  $('spot-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderSpotList() {
  const sorted = [...spots].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  $('spot-count').textContent = `${sorted.length} Spots`;
  $('spot-list').innerHTML = sorted.map((spot) => {
    const category = categories[spot.category] || { label: spot.category, icon: '📍' };
    return `
      <article class="spot-item">
        <div class="spot-item-header">
          <div>
            <b>${category.icon} ${spot.name}</b>
            <small>${category.label}</small>
            <small>${spot.note || 'Keine Beschreibung hinterlegt.'}</small>
          </div>
          <small>${spot.address || `${spot.lat}, ${spot.lng}`}</small>
        </div>
        <div class="spot-item-actions">
          <button class="secondary" type="button" data-edit-spot="${spot.id}">Bearbeiten</button>
          <button class="secondary" type="button" data-delete-spot="${spot.id}">Löschen</button>
          <a class="map-link secondary" target="_blank" rel="noreferrer" href="${googleMapsLink(spot)}">Route</a>
        </div>
      </article>
    `;
  }).join('');

  document.querySelectorAll('[data-edit-spot]').forEach((button) => {
    button.addEventListener('click', () => editSpot(button.dataset.editSpot));
  });
  document.querySelectorAll('[data-delete-spot]').forEach((button) => {
    button.addEventListener('click', () => deleteSpot(button.dataset.deleteSpot));
  });
}

function refreshSpotsUI({ focusSpotId = '' } = {}) {
  if (focusSpotId && routeOnlyMode) {
    routeOnlyMode = false;
    $('toggle-route-only').checked = false;
  }
  if (map) rebuildSpotMarkers();
  renderSpotList();
  updateNearby();
  if (focusSpotId && map) {
    const spot = byId(focusSpotId);
    if (spot) map.setView([spot.lat, spot.lng], 14);
  }
}

async function persistSpot(spot) {
  if (supabaseClient) {
    const table = config.SUPABASE_SPOTS_TABLE || 'spots';
    const payload = {
      id: spot.id,
      name: spot.name,
      category: spot.category,
      lat: spot.lat,
      lng: spot.lng,
      note: spot.note,
      address: spot.address || ''
    };
    const fallbackPayload = {
      id: spot.id,
      name: spot.name,
      category: spot.category,
      lat: spot.lat,
      lng: spot.lng,
      note: spot.note
    };
    const runMutation = async (body) => {
      if (spot.id && byId(spot.id)) {
        return supabaseClient.from(table).update(body).eq('id', spot.id);
      }
      return supabaseClient.from(table).insert(body);
    };

    let { error } = await runMutation(payload);
    if (error && /address/i.test(error.message || '')) {
      ({ error } = await runMutation(fallbackPayload));
    }
    if (error) {
      throw error;
    }
    return;
  }

  const existingIndex = spots.findIndex((entry) => entry.id === spot.id);
  if (existingIndex >= 0) spots.splice(existingIndex, 1, spot);
  else spots.push(spot);
  persistLocalSpots();
}

async function deleteSpot(spotId) {
  const spot = byId(spotId);
  if (!spot) return;
  if (!confirm(`Spot "${spot.name}" wirklich löschen?`)) return;

  if (supabaseClient) {
    const { error } = await supabaseClient.from(config.SUPABASE_SPOTS_TABLE || 'spots').delete().eq('id', spotId);
    if (error) {
      alert(`Spot konnte nicht gelöscht werden: ${error.message}`);
      return;
    }
  }

  spots = spots.filter((entry) => entry.id !== spotId);
  if (!supabaseClient) persistLocalSpots();
  refreshSpotsUI();
  renderToday();
  renderItinerary();
}

function updateHomebaseSummary() {
  const selected = getSelectedPlan();
  const phase = getTripPhaseSummary();
  $('homebase-summary').textContent = `${dateShort(selected.date)} · ${phase.value}`;
}

function renderTripStatus() {
  const { today, beforeTrip, duringTrip, afterTrip } = getLiveTripWindow();
  const livePlan = duringTrip ? (itinerary.find((day) => day.date === today) || null) : null;
  const activeStay = duringTrip ? accommodations.find((stay) => today >= stay.start && today < stay.end) : null;
  const nextStay = beforeTrip ? accommodations[0] : accommodations.find((stay) => stay.start > today) || null;
  const routeSpots = livePlan ? getCombinedRouteSpots(livePlan) : [];
  const startPlanSpots = getCombinedRouteSpots(getTodayPlan());
  const phase = getTripPhaseSummary();
  const todayNearby = userPosition
    ? getVisibleSpots()
        .map((spot) => distanceMeters(userPosition, spot))
        .filter((distance) => distance <= Number($('nearby-radius').value)).length
    : null;

  const cards = [
    {
      label: phase.label,
      value: phase.value,
      detail: phase.detail
    },
    {
      label: 'Aktive Unterkunft',
      value: activeStay?.city || (beforeTrip ? 'Noch keine aktive Unterkunft' : 'Keine Unterkunft aktiv'),
      detail: activeStay ? `${activeStay.checkin} Check-in · ${activeStay.checkout} Check-out` : (beforeTrip ? `Erster Check-in in ${accommodations[0].city} am ${dateShort(accommodations[0].start)}` : 'Reise ausserhalb des Unterkunftszeitraums')
    },
    {
      label: 'Unterkunftswechsel',
      value: getAccommodationCountdownLabel(),
      detail: nextStay ? `${beforeTrip ? 'Erster Check-in' : 'Nächster Wechsel'}: ${dateShort(nextStay.start)} nach ${nextStay.city}` : 'Kein weiterer Wechsel'
    },
    {
      label: beforeTrip ? 'Starttag' : 'Heutige Spots',
      value: beforeTrip ? `${startPlanSpots.length} geplant am ${dateShort(getTodayPlan().date)}` : (afterTrip ? 'Keine aktiven Spots' : `${routeSpots.length} geplant`),
      detail: beforeTrip
        ? `${getTodayPlan().title} · ${startPlanSpots.map((spot) => spot.name).join(' · ')}`
        : (afterTrip ? 'Reise ist bereits beendet' : (routeSpots.map((spot) => spot.name).join(' · ') || 'Noch keine Spots'))
    },
    {
      label: 'Nearby',
      value: todayNearby == null ? 'Standort aus' : `${todayNearby} im Radius`,
      detail: userPosition ? `Radius: ${Number($('nearby-radius').value) >= 1000 ? `${Number($('nearby-radius').value) / 1000} km` : `${$('nearby-radius').value} m`}` : 'Nach Freigabe sofort sichtbar'
    }
  ];

  $('trip-status-grid').innerHTML = cards.map((card) => `
    <article class="status-card">
      <span>${card.label}</span>
      <strong>${card.value}</strong>
      <small>${card.detail}</small>
    </article>
  `).join('');
}

function renderToday() {
  const plan = getSelectedPlan();
  const index = itinerary.findIndex((d) => d.date === plan.date) + 1;
  const activeStay = getActiveAccommodation(plan.date);
  const timelineItems = getTimelineEntries(plan);
  const progress = getPlannedProgress(plan);
  $('trip-day-badge').textContent = `${tripName} · Tag ${index} von ${tripLengthDays}`;
  $('today-title').textContent = plan.title;
  $('today-summary').textContent = `${plan.summary} Aktuelle Basis: ${activeStay.city}.`;
  $('today-date-label').textContent = new Date(plan.date + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' });

  $('today-route-list').innerHTML = timelineItems.map(renderTimelineItem).join('');
  $('today-route-list').dataset.planDate = plan.date;
  $('today-route-list').dataset.progress = progress.total
    ? `${progress.doneCount}/${progress.total}`
    : '0/0';
  bindTimelineActions();

  updateHomebaseSummary();
  renderTripStatus();
}

function fillDayPlanForm() {
  const selected = getSelectedPlan();
  selected.plan_items = getPlanItemsForDay(selected);
  $('day-plan-date').value = selected.date;
  $('day-plan-title').value = selected.title || '';
  $('day-plan-summary').value = selected.summary || '';
  $('day-plan-notes').value = selected.notes || '';
  $('day-plan-status').textContent = 'Diese Planung wird mit allen geteilt.';
  renderDayPlanItemsEditor(selected.plan_items, selected.route);
}

function buildDayPlanItem(item = {}) {
  return {
    id: item.id || crypto.randomUUID(),
    type: item.type || 'spot',
    title: item.title || '',
    spot_id: item.spot_id || '',
    address: item.address || '',
    note: item.note || '',
    done: Boolean(item.done)
  };
}

function updateDayPlanItemVisibility(itemElement) {
  const type = itemElement.querySelector('.day-plan-item-type')?.value || 'note';
  itemElement.querySelectorAll('.day-plan-type-fields').forEach((section) => {
    section.hidden = section.dataset.type !== type;
  });
}

function getSelectableDayPlanSpots(selectedRoute = [], currentSpotId = '', reservedSpotIds = []) {
  const blocked = new Set([...selectedRoute, ...reservedSpotIds].filter(Boolean));
  return spots.filter((spot) => {
    if (['stay', 'travel'].includes(spot.category)) return false;
    if (spot.id === currentSpotId) return true;
    return !blocked.has(spot.id);
  });
}

function collectDayPlanItems(includeIncomplete = false) {
  return Array.from(document.querySelectorAll('.day-plan-item')).map((itemElement) => ({
    id: itemElement.dataset.planItemId || crypto.randomUUID(),
    type: itemElement.querySelector('.day-plan-item-type')?.value || 'note',
    title: itemElement.querySelector('.day-plan-item-title')?.value.trim() || '',
    spot_id: itemElement.querySelector('.day-plan-item-spot')?.value || '',
    address: itemElement.querySelector('.day-plan-item-address')?.value.trim() || '',
    note: itemElement.querySelector('.day-plan-item-note')?.value.trim() || '',
    done: itemElement.querySelector('.day-plan-item-done')?.checked || false
  })).filter((item) => includeIncomplete || item.title || item.spot_id || item.address || item.note);
}

function rerenderCurrentDayPlanItems() {
  renderDayPlanItemsEditor(collectDayPlanItems(true), getSelectedPlan().route);
}

function moveDayPlanItem(fromIndex, direction) {
  const items = collectDayPlanItems(true);
  const toIndex = fromIndex + direction;
  if (toIndex < 0 || toIndex >= items.length) return;
  [items[fromIndex], items[toIndex]] = [items[toIndex], items[fromIndex]];
  renderDayPlanItemsEditor(items, getSelectedPlan().route);
}

function createDayPlanItemEditor(item = {}, selectedRoute = [], allItems = [], index = 0) {
  const normalized = buildDayPlanItem(item);
  const reservedSpotIds = allItems
    .filter((entry) => entry.id !== normalized.id && entry.type === 'spot' && entry.spot_id)
    .map((entry) => entry.spot_id);
  const selectableSpots = getSelectableDayPlanSpots(selectedRoute, normalized.spot_id, reservedSpotIds);
  const wrapper = document.createElement('div');
  wrapper.className = 'day-plan-item';
  wrapper.dataset.planItemId = normalized.id;

  wrapper.innerHTML = `
    <div class="day-plan-item-head">
      <strong>Punkt ${index + 1}</strong>
      <div class="day-plan-item-actions">
        <button class="secondary" type="button" data-move-day-plan-item="-1" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button class="secondary" type="button" data-move-day-plan-item="1" ${index === allItems.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="secondary" type="button" data-remove-day-plan-item>Entfernen</button>
      </div>
    </div>
    <div class="day-plan-item-grid">
      <label class="full">Titel
        <input class="day-plan-item-title" type="text" value="${escapeHtml(normalized.title)}" placeholder="z. B. Morgens einkaufen" />
      </label>
      <label>Typ
        <select class="day-plan-item-type">
          <option value="spot"${normalized.type === 'spot' ? ' selected' : ''}>Bestehender Spot</option>
          <option value="note"${normalized.type === 'note' ? ' selected' : ''}>Freier Punkt</option>
          <option value="address"${normalized.type === 'address' ? ' selected' : ''}>Adresse / Maps-Link</option>
        </select>
      </label>
      <label class="day-plan-type-fields full" data-type="spot">Spot
        <select class="day-plan-item-spot">
          <option value="">Spot auswählen</option>
          ${selectableSpots.map((spot) => `<option value="${escapeHtml(spot.id)}"${normalized.spot_id === spot.id ? ' selected' : ''}>${escapeHtml(spot.name)}</option>`).join('')}
        </select>
      </label>
      <label class="day-plan-type-fields full" data-type="address">Adresse oder Google-Maps-Link
        <textarea class="day-plan-item-address" rows="3" placeholder="Adresse oder Maps-Link">${escapeHtml(normalized.address)}</textarea>
      </label>
      <label class="full">Hinweis
        <input class="day-plan-item-note" type="text" value="${escapeHtml(normalized.note)}" placeholder="z. B. vorher Tickets prüfen oder Parken" />
      </label>
      <label class="full day-plan-item-check">
        <input class="day-plan-item-done" type="checkbox" ${normalized.done ? 'checked' : ''} />
        <span>Punkt bereits erledigt</span>
      </label>
    </div>
  `;

  wrapper.querySelector('.day-plan-item-type')?.addEventListener('change', () => {
    updateDayPlanItemVisibility(wrapper);
    rerenderCurrentDayPlanItems();
  });
  wrapper.querySelector('.day-plan-item-spot')?.addEventListener('change', rerenderCurrentDayPlanItems);
  wrapper.querySelectorAll('[data-move-day-plan-item]').forEach((button) => {
    button.addEventListener('click', () => moveDayPlanItem(index, Number(button.dataset.moveDayPlanItem || 0)));
  });
  wrapper.querySelector('[data-remove-day-plan-item]')?.addEventListener('click', () => {
    const items = collectDayPlanItems(true).filter((entry) => entry.id !== normalized.id);
    renderDayPlanItemsEditor(items.length ? items : [buildDayPlanItem()], getSelectedPlan().route);
  });
  updateDayPlanItemVisibility(wrapper);
  return wrapper;
}

function renderDayPlanItemsEditor(items = [], selectedRoute = []) {
  const list = $('day-plan-items-list');
  list.innerHTML = '';
  const source = items.length ? items : [buildDayPlanItem()];
  source.forEach((item, index) => list.appendChild(createDayPlanItemEditor(item, selectedRoute, source, index)));
}

function renderTripOverview() {
  const flightCards = flights.map((f) => `
    <article class="trip-card">
      <p class="eyebrow">${f.type}</p>
      <h3>${f.from} → ${f.to}</h3>
      <p><b>${new Date(f.date + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}</b> · ${f.depart} - ${f.arrive}</p>
      <p>${f.airline} · ${f.details}</p>
    </article>
  `).join('');

  const stayCards = accommodations.map((a) => `
    <article class="trip-card">
      <p class="eyebrow">${a.city}</p>
      <h3>${a.name}</h3>
      <p>${dateShort(a.start)} - ${dateShort(a.end)}</p>
      <p>Check-in ab ${a.checkin} · Check-out bis ${a.checkout}</p>
      <a class="map-link secondary" target="_blank" href="${googleMapsLink(a)}">Route öffnen</a>
    </article>
  `).join('');

  $('trip-overview').innerHTML = `
    ${flightCards}
    ${stayCards}
  `;
}

function dateShort(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function renderItinerary() {
  const current = getTodayPlan();
  const selected = getSelectedPlan();
  const timelineItems = getTimelineEntries(selected);
  const progress = getPlannedProgress(selected);
  const combinedRouteSpots = getCombinedRouteSpots(selected);

  $('day-picker').innerHTML = itinerary.map((day, i) => {
    const active = day.date === selected.date ? 'active' : '';
    const todayLabel = day.date === current.date ? 'Heute · ' : '';
    return `<button class="day-button ${active}" data-date="${day.date}"><strong>Tag ${i + 1}</strong><span>${todayLabel}${dateShort(day.date)}</span></button>`;
  }).join('');

  document.querySelectorAll('.day-button').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedPlanDate = btn.dataset.date;
      renderToday();
      renderItinerary();
      updateMarkers(true);
      updateNearby();
    });
  });

  $('selected-day-detail').innerHTML = `
    <p class="eyebrow">Ausgewählter Tag · ${new Date(selected.date + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' })}</p>
    <h3>${selected.title}</h3>
    <p>${selected.summary}</p>
    ${selected.notes ? `<p>${selected.notes}</p>` : ''}
    <div class="timeline-summary">
      <span><b>${combinedRouteSpots.length}</b> Spot${combinedRouteSpots.length === 1 ? '' : 's'} in der Tagesroute</span>
      <span><b>${progress.doneCount}/${progress.total}</b> geplante Punkte erledigt</span>
      <span>${progress.nextEntry ? `Als Nächstes: ${escapeHtml(describeTimelineEntry(progress.nextEntry).title)}` : 'Alle geplanten Punkte erledigt'}</span>
    </div>
    <h4>Tagesablauf</h4>
    <ol class="timeline-list" data-plan-date="${escapeHtml(selected.date)}">${timelineItems.map(renderTimelineItem).join('')}</ol>
  `;
  bindTimelineActions();
  fillDayPlanForm();
  renderTripStatus();
}

function highlightSelectedRoute(shouldFit = false) {
  const routeIds = new Set(getCombinedRouteIds(getSelectedPlan()));
  const focusedSpotId = getFocusedRouteSpotId(getSelectedPlan());
  markers.forEach((marker, id) => {
    const el = marker.getElement();
    if (!el) return;
    if (routeIds.has(id)) el.classList.add('route-active-marker');
    else el.classList.remove('route-active-marker');
    if (focusedSpotId && focusedSpotId === id) el.classList.add('current-route-marker');
    else el.classList.remove('current-route-marker');
  });

  const routeSpots = getCombinedRouteSpots(getSelectedPlan());
  if (shouldFit && routeSpots.length && map) {
    const bounds = L.latLngBounds(routeSpots.map(s => [s.lat, s.lng]));
    map.fitBounds(bounds.pad(0.25));
  }
}

function makeIcon(spot) {
  const c = categories[spot.category];
  return L.divIcon({
    className: '',
    html: `<div class="marker-pin" style="background:${c.color}"><span>${c.icon}</span></div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 38],
    popupAnchor: [0, -35]
  });
}

function googleMapsLink(spot) {
  const destination = spot.address ? encodeURIComponent(spot.address) : `${spot.lat},${spot.lng}`;
  const includeOrigin = userPosition && spot.lat != null && spot.lng != null
    ? distanceMeters(userPosition, spot) <= 250000
    : Boolean(userPosition);
  const origin = includeOrigin && userPosition ? `&origin=${userPosition.lat},${userPosition.lng}` : '';
  return `https://www.google.com/maps/dir/?api=1${origin}&destination=${destination}&travelmode=driving`;
}

function googleMapsAddressLink(address) {
  const { duringTrip } = getLiveTripWindow();
  const origin = duringTrip && userPosition ? `&origin=${userPosition.lat},${userPosition.lng}` : '';
  return `https://www.google.com/maps/dir/?api=1${origin}&destination=${encodeURIComponent(address)}&travelmode=driving`;
}

function popupMarkup(spot) {
  const c = categories[spot.category];
  const distance = getSpotDistance(spot);
  return `
    <div class="map-popup">
      <b>${c.icon} ${spot.name}</b>
      <span>${c.label}</span>
      <p>${spot.note}</p>
      <small>${formatDistance(distance)}</small>
      <a class="popup-route" target="_blank" rel="noreferrer" href="${googleMapsLink(spot)}">Route starten</a>
    </div>
  `;
}

function clearRouteOverlay() {
  if (routePolyline && map?.hasLayer(routePolyline)) map.removeLayer(routePolyline);
  if (routeOutlinePolyline && map?.hasLayer(routeOutlinePolyline)) map.removeLayer(routeOutlinePolyline);
  routePolyline = null;
  routeOutlinePolyline = null;
}

function drawRouteOverlay(latlngs) {
  clearRouteOverlay();
  if (!map || !latlngs || latlngs.length < 2) return;

  routeOutlinePolyline = L.polyline(latlngs, {
    color: 'rgba(17, 24, 39, 0.24)',
    weight: 10,
    opacity: 0.9,
    lineJoin: 'round',
    lineCap: 'round'
  }).addTo(map);

  routePolyline = L.polyline(latlngs, {
    color: '#ff6b35',
    weight: 5,
    opacity: 0.95,
    lineJoin: 'round',
    lineCap: 'round',
    dashArray: '14 10'
  }).addTo(map);

  routeOutlinePolyline.bringToBack();
  routePolyline.bringToFront();
  markers.forEach((marker) => marker.bringToFront());
  if (userMarker) userMarker.bringToFront();
}

async function updateRouteOverlay() {
  if (!map) return;

  const routeRequestId = ++activeRouteRequestId;
  const waypoints = buildDayRouteWaypoints(getSelectedPlan());
  if (waypoints.length < 2) {
    clearRouteOverlay();
    return;
  }

  const fallbackLatLngs = waypoints.map((point) => [point.lat, point.lng]);
  const coordinates = waypoints.map((point) => `${point.lng},${point.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`;

  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Routing-Status ${response.status}`);
    const data = await response.json();
    const geometry = data?.routes?.[0]?.geometry?.coordinates;
    const latlngs = Array.isArray(geometry) && geometry.length
      ? geometry.map(([lng, lat]) => [lat, lng])
      : fallbackLatLngs;

    if (routeRequestId !== activeRouteRequestId) return;
    drawRouteOverlay(latlngs);
  } catch (error) {
    if (routeRequestId !== activeRouteRequestId) return;
    console.warn('Tagesroute konnte nicht als Straßenroute geladen werden:', error.message || error);
    drawRouteOverlay(fallbackLatLngs);
  }
}

function buildSpotMarker(spot) {
  const marker = L.marker([spot.lat, spot.lng], { icon: makeIcon(spot) })
    .bindPopup(popupMarkup(spot));
  markers.set(spot.id, marker);
  marker.addTo(map);
}

function rebuildSpotMarkers() {
  markers.forEach((marker) => {
    if (map.hasLayer(marker)) map.removeLayer(marker);
  });
  markers.clear();
  spots.forEach(buildSpotMarker);
  updateMarkers(false);
}

function initMap() {
  map = L.map('map').setView([34.0522, -118.2437], 11);
  setTimeout(() => map.invalidateSize(), 250);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  }).addTo(map);

  spots.forEach(buildSpotMarker);
  updateRouteOverlay();
}

function renderCategoryFilters() {
  $('category-filters').innerHTML = Object.entries(categories).map(([key, c]) => `
    <label><input type="checkbox" class="category-toggle" value="${key}" checked /> ${c.icon} ${c.label}</label>
  `).join('');

  document.querySelectorAll('.category-toggle').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) activeCategories.add(input.value); else activeCategories.delete(input.value);
      $('toggle-all').checked = activeCategories.size === Object.keys(categories).length;
      updateMarkers(false);
      updateNearby();
    });
  });

  $('toggle-all').addEventListener('change', (e) => {
    activeCategories = new Set(e.target.checked ? Object.keys(categories) : []);
    document.querySelectorAll('.category-toggle').forEach((input) => input.checked = e.target.checked);
    updateMarkers(false);
    updateNearby();
  });
}

function updateMarkers(shouldFit = false) {
  const routeIds = new Set(getCombinedRouteIds(getSelectedPlan()));
  markers.forEach((marker, id) => {
    const spot = byId(id);
    const routeMatch = !routeOnlyMode || routeIds.has(id);
    if (activeCategories.has(spot.category) && routeMatch) {
      if (!map.hasLayer(marker)) marker.addTo(map);
    } else {
      if (map.hasLayer(marker)) map.removeLayer(marker);
    }
    marker.setPopupContent(popupMarkup(spot));
  });
  updateRouteOverlay();
  highlightSelectedRoute(shouldFit);
}

function locateUser(silent = false, forceCenter = false) {
  const status = $('location-status');
  if (status) status.textContent = 'Standort wird geladen ...';
  if (!navigator.geolocation) {
    if (!silent) alert('Dein Browser unterstützt keine Standortabfrage.');
    return;
  }

  const onSuccess = (pos) => {
    userPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    if (status) status.textContent = 'Standort aktiv';
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker([userPosition.lat, userPosition.lng], {
      icon: L.divIcon({ className: '', html: '<div class="user-pin"></div>', iconSize: [24, 24], iconAnchor: [12, 12] })
    }).addTo(map).bindPopup('Du bist hier');
    if (forceCenter || !hasCenteredOnUser) {
      map.setView([userPosition.lat, userPosition.lng], 14);
      hasCenteredOnUser = true;
    }
    updateMarkers(false);
    updateNearby();
    renderTripStatus();
  };

  const onError = () => {
    if (status) status.textContent = 'Standort nicht freigegeben';
    if (!silent) alert('Standort konnte nicht geladen werden. Bitte Freigabe prüfen.');
    $('nearby-list').innerHTML = 'Standortfreigabe fehlt. Bitte erneut auf "Standort aktivieren" tippen.';
    renderTripStatus();
  };

  navigator.geolocation.getCurrentPosition(onSuccess, onError, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });

  if (locationWatchId === null && navigator.geolocation.watchPosition) {
    locationWatchId = navigator.geolocation.watchPosition(onSuccess, onError, { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 });
  }
}

function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

function updateNearby() {
  if (!userPosition) {
    $('nearby-list').textContent = 'Standort aktivieren, dann werden Spots in der Nähe angezeigt.';
    renderTripStatus();
    return;
  }
  const radius = Number($('nearby-radius').value);
  const nearby = getVisibleSpots()
    .map((s) => ({ ...s, distance: distanceMeters(userPosition, s) }))
    .filter((s) => s.distance <= radius)
    .sort((a, b) => a.distance - b.distance);

  $('nearby-list').innerHTML = nearby.length ? nearby.map((s) => {
    const c = categories[s.category];
    return `<div class="nearby-item"><b>${c.icon} ${s.name}</b><small>${formatDistance(s.distance)} · ${c.label}</small><br><a target="_blank" rel="noreferrer" href="${googleMapsLink(s)}">Route starten</a></div>`;
  }).join('') : 'Keine aktiven Spots im gewählten Radius.';
  renderTripStatus();
}

function fitAll() {
  const active = getVisibleSpots();
  if (!active.length) {
    alert('Aktuell sind keine Kategorien aktiv. Bitte mindestens eine Kategorie einschalten.');
    return;
  }
  const points = active.map((s) => [s.lat, s.lng]);
  if (userPosition) points.push([userPosition.lat, userPosition.lng]);
  const bounds = L.latLngBounds(points);
  map.fitBounds(bounds.pad(0.15));
}

function fillPeople() {
  $('expense-person').innerHTML = people.map((p) => `<option value="${p}">${p}</option>`).join('');
  $('expense-person').value = people[0];
  $('expense-date').value = todayISO();
  renderParticipantSelector();
  renderSplitEditor();
  updateSplitPreview();
}

async function loadExpenses() {
  if (supabaseClient) {
    const expensesTable = config.SUPABASE_EXPENSES_TABLE || 'expenses';
    const splitsTable = config.SUPABASE_EXPENSE_SPLITS_TABLE || 'expense_splits';
    const { data: expenses, error } = await supabaseClient.from(expensesTable).select('*').order('created_at', { ascending: false });
    if (!error) {
      const { data: splits, error: splitError } = await supabaseClient.from(splitsTable).select('*');
      if (splitError) {
        console.warn(splitError);
        return expenses || [];
      }
      const splitsByExpense = new Map();
      (splits || []).forEach((split) => {
        const list = splitsByExpense.get(split.expense_id) || [];
        list.push(split);
        splitsByExpense.set(split.expense_id, list);
      });
      return (expenses || []).map((expense) => ({ ...expense, splits: splitsByExpense.get(expense.id) || [] }));
    }
    console.warn(error);
  }
  return JSON.parse(localStorage.getItem('laExpenses') || '[]');
}

async function saveExpense(expense, receiptFile) {
  const splitDraft = getSplitDraft();
  if (!splitDraft.ok) {
    alert(splitDraft.message);
    return;
  }

  expense.subtotal_amount = splitDraft.subtotal;
  expense.tip_amount = splitDraft.tip;
  expense.split_mode = splitDraft.splitMode;
  expense.participant_count = splitDraft.participants.length;
  expense.participants = splitDraft.participants;

  if (supabaseClient) {
    if (receiptFile) {
      const filePath = `${Date.now()}-${receiptFile.name}`;
      const { error: uploadError } = await supabaseClient.storage.from(config.SUPABASE_RECEIPT_BUCKET).upload(filePath, receiptFile);
      if (!uploadError) {
        expense.receipt_path = filePath;
        const { data } = supabaseClient.storage.from(config.SUPABASE_RECEIPT_BUCKET).getPublicUrl(filePath);
        expense.receipt_url = data?.publicUrl || '';
      } else {
        alert('Bon-Foto konnte nicht hochgeladen werden: ' + uploadError.message);
      }
    }
    const expensesTable = config.SUPABASE_EXPENSES_TABLE || 'expenses';
    const splitsTable = config.SUPABASE_EXPENSE_SPLITS_TABLE || 'expense_splits';
    const { data: insertedExpense, error } = await supabaseClient.from(expensesTable).insert(expense).select().single();
    if (error) {
      alert('Supabase Fehler: ' + error.message);
      return;
    }
    if (splitDraft.splits.length) {
      const rows = splitDraft.splits.map((split) => ({
        expense_id: insertedExpense.id,
        person: split.person,
        food_amount: split.food_amount,
        tip_amount: split.tip_amount,
        total_amount: split.total_amount
      }));
      const { error: splitInsertError } = await supabaseClient.from(splitsTable).insert(rows);
      if (splitInsertError) {
        alert('Aufteilung konnte nicht gespeichert werden: ' + splitInsertError.message);
      }
    }
  } else {
    const expenses = JSON.parse(localStorage.getItem('laExpenses') || '[]');
    const receiptDataUrl = receiptFile ? await fileToDataUrl(receiptFile) : '';
    expenses.unshift({
      ...expense,
      receipt_data_url: receiptDataUrl,
      splits: splitDraft.splits,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString()
    });
    localStorage.setItem('laExpenses', JSON.stringify(expenses));
  }
  renderExpenses();
}

async function deleteExpense(expenseId) {
  if (!expenseId) return;

  if (supabaseClient) {
    const expensesTable = config.SUPABASE_EXPENSES_TABLE || 'expenses';
    const { error } = await supabaseClient.from(expensesTable).delete().eq('id', expenseId);
    if (error) {
      alert(`Ausgabe konnte nicht gelöscht werden: ${error.message}`);
      return;
    }
  } else {
    const expenses = JSON.parse(localStorage.getItem(LOCAL_EXPENSES_KEY) || '[]');
    localStorage.setItem(LOCAL_EXPENSES_KEY, JSON.stringify(expenses.filter((expense) => expense.id !== expenseId)));
  }

  renderExpenses();
}

async function renderExpenses() {
  const expenses = await loadExpenses();
  $('expense-list').innerHTML = expenses.length ? expenses.map((e) => `
    <div class="expense-item">
      <div><b>${e.description}</b><br><small>${e.person} · ${e.category} · ${new Date(e.date || e.created_at).toLocaleDateString('de-DE')}</small><br><small>Ohne Tip: ${currency(e.subtotal_amount || Number(e.amount) - Number(e.tip_amount || 0))} · Tip: ${currency(e.tip_amount || 0)}${Number(e.participant_count || 0) > 0 ? ` · ${currency((Number(e.tip_amount || 0) / Number(e.participant_count || 1)) || 0)} pro Person` : ''}</small><br><small>${(e.splits?.length ? e.splits.map((split) => `${split.person}: ${currency(split.total_amount)} (${currency(split.food_amount || 0)} + ${currency(split.tip_amount || 0)} Tip)`).join(' · ') : `${e.participant_count || 1} Beteiligte`)}</small>${getReceiptUrl(e) ? `<br><a target="_blank" rel="noreferrer" href="${getReceiptUrl(e)}">Bon ansehen</a>` : ''}</div>
      <div>
        <strong>${currency(e.amount)}</strong>
        <br>
        <button class="tiny expense-delete" type="button" data-expense-id="${e.id}" data-expense-description="${(e.description || '').replace(/"/g, '&quot;')}">Löschen…</button>
      </div>
    </div>
  `).join('') : '<p class="hint">Noch keine Ausgaben eingetragen.</p>';

  document.querySelectorAll('.expense-delete').forEach((button) => {
    button.addEventListener('click', async () => {
      const label = button.dataset.expenseDescription || 'diesen Beleg';
      const typed = window.prompt(`Zum Löschen von "${label}" bitte LÖSCHEN eingeben.`);
      if (typed !== 'LÖSCHEN') return;
      await deleteExpense(button.dataset.expenseId);
    });
  });

  renderSettlement(expenses);
}

function renderSettlement(expenses) {
  const paidTotals = Object.fromEntries(people.map((p) => [p, 0]));
  const owedTotals = Object.fromEntries(people.map((p) => [p, 0]));
  const tipTotals = Object.fromEntries(people.map((p) => [p, 0]));
  const pairwiseClaims = new Map();
  let totalTip = 0;

  function addPairwiseClaim(from, to, amount) {
    if (!from || !to || from === to || amount <= 0.009) return;
    const key = `${from}__${to}`;
    pairwiseClaims.set(key, (pairwiseClaims.get(key) || 0) + amount);
  }

  expenses.forEach((expense) => {
    paidTotals[expense.person] = (paidTotals[expense.person] || 0) + Number(expense.amount);
    totalTip += Number(expense.tip_amount || 0);

    if (expense.splits?.length) {
      expense.splits.forEach((split) => {
        owedTotals[split.person] = (owedTotals[split.person] || 0) + Number(split.total_amount);
        tipTotals[split.person] = (tipTotals[split.person] || 0) + Number(split.tip_amount || 0);
        addPairwiseClaim(split.person, expense.person, Number(split.total_amount || 0));
      });
      return;
    }

    const participants = expense.participants?.length ? expense.participants : people.slice(0, Number(expense.participant_count || people.length));
    const share = participants.length ? Number(expense.amount) / participants.length : Number(expense.amount);
    const tipShare = participants.length ? Number(expense.tip_amount || 0) / participants.length : Number(expense.tip_amount || 0);
    participants.forEach((person) => {
      owedTotals[person] = (owedTotals[person] || 0) + share;
      tipTotals[person] = (tipTotals[person] || 0) + tipShare;
      addPairwiseClaim(person, expense.person, share);
    });
  });

  const total = Object.values(paidTotals).reduce((a, b) => a + b, 0);
  const balances = people.map((p) => ({ person: p, balance: paidTotals[p] - owedTotals[p] }));
  const transfers = [];

  pairwiseClaims.forEach((amount, key) => {
    const [from, to] = key.split('__');
    const reverseKey = `${to}__${from}`;
    if (pairwiseClaims.has(reverseKey) && key > reverseKey) return;

    const reverseAmount = pairwiseClaims.get(reverseKey) || 0;
    const net = amount - reverseAmount;
    if (net > 0.009) {
      transfers.push(`${from} zahlt ${currency(net)} an ${to}`);
    } else if (net < -0.009) {
      transfers.push(`${to} zahlt ${currency(Math.abs(net))} an ${from}`);
    }
  });

  transfers.sort((a, b) => a.localeCompare(b, 'de'));

  $('settlement').innerHTML = `
    <h3>Abrechnung</h3>
    <p>Gesamt: <b>${currency(total)}</b> · Tip gesamt: <b>${currency(totalTip)}</b> · Berechnet nach echten Beteiligungen pro Beleg.</p>
    <div class="settlement-grid">${people.map(p => `<div class="settle-card"><b>${p}</b><br>${currency(paidTotals[p])} gezahlt<br>${currency(owedTotals[p])} verbraucht<br>${currency(tipTotals[p])} Tip-Anteil<br><small>${currency(balances.find((entry) => entry.person === p)?.balance || 0)} Balance</small></div>`).join('')}</div>
    <h3>Wer zahlt wem?</h3>
    <p class="hint">Die Liste ist belegbasiert: Jede Person zahlt an die Person zurück, die vorgestreckt hat.</p>
    ${transfers.length ? `<ul>${transfers.map(t => `<li>${t}</li>`).join('')}</ul>` : '<p class="hint">Aktuell ist alles ausgeglichen oder es gibt noch keine Ausgaben.</p>'}
  `;
}

async function saveDayPlan() {
  const date = $('day-plan-date').value;
  const day = itinerary.find((entry) => entry.date === date);
  if (!day) {
    alert('Tag konnte nicht gefunden werden.');
    return;
  }

  const planItems = collectDayPlanItems();

  const payload = {
    date,
    title: $('day-plan-title').value.trim(),
    summary: $('day-plan-summary').value.trim(),
    notes: $('day-plan-notes').value.trim(),
    plan_items_text: planItemsToLegacyText(planItems),
    plan_items_json: planItems
  };

  day.title = payload.title;
  day.summary = payload.summary;
  day.notes = payload.notes;
  day.plan_items_text = payload.plan_items_text;
  day.plan_items = payload.plan_items_json;

  const saved = await persistDayPlanPayload(payload);
  if (!saved) return;

  renderToday();
  renderItinerary();
  $('day-plan-status').textContent = 'Tag erfolgreich gespeichert.';
}

async function persistDayPlanPayload(payload) {
  if (supabaseClient) {
    const { error } = await supabaseClient.from(config.SUPABASE_ITINERARY_TABLE || 'itinerary_days').upsert(payload, { onConflict: 'date' });
    if (error) {
      alert(`Tagesplanung konnte nicht gespeichert werden: ${error.message}`);
      return false;
    }
  } else {
    const rows = loadLocalItineraryOverrides();
    const index = rows.findIndex((entry) => entry.date === payload.date);
    if (index >= 0) rows.splice(index, 1, payload);
    else rows.push(payload);
    persistLocalItineraryOverrides(rows);
  }

  return true;
}

async function togglePlanItemDone(date, itemId) {
  const day = itinerary.find((entry) => entry.date === date);
  if (!day) return;

  const planItems = getPlanItemsForDay(day).map((item) => (
    item.id === itemId ? { ...item, done: !item.done } : item
  ));

  day.plan_items = planItems;
  day.plan_items_text = planItemsToLegacyText(planItems);

  const payload = {
    date,
    title: day.title,
    summary: day.summary,
    notes: day.notes || '',
    plan_items_text: day.plan_items_text,
    plan_items_json: planItems
  };

  const saved = await persistDayPlanPayload(payload);
  if (!saved) return;

  if ($('day-plan-date').value === date) {
    fillDayPlanForm();
    $('day-plan-status').textContent = 'Fortschritt aktualisiert.';
  }
  renderToday();
  renderItinerary();
}

function bindTimelineActions() {
  document.querySelectorAll('[data-toggle-plan-item]').forEach((button) => {
    if (button.dataset.bound === 'true') return;
    button.dataset.bound = 'true';
    button.addEventListener('click', async () => {
      const container = button.closest('[data-plan-date]');
      const date = container?.dataset.planDate || getSelectedPlan().date;
      const itemId = button.dataset.togglePlanItem;
      if (!date || !itemId) return;
      button.disabled = true;
      await togglePlanItemDone(date, itemId);
    });
  });
}

function bindEvents() {
  $('locate-btn').addEventListener('click', () => locateUser(false, true));
  $('show-all-btn').addEventListener('click', fitAll);
  $('nearby-radius').addEventListener('change', updateNearby);
  $('expense-amount').addEventListener('input', updateSplitPreview);
  $('expense-tip').addEventListener('input', updateSplitPreview);
  $('expense-split-mode').addEventListener('change', () => {
    renderSplitEditor();
    updateSplitPreview();
  });
  $('toggle-spot-form').addEventListener('click', () => togglePanel('spot-form-panel', 'toggle-spot-form'));
  $('toggle-spot-list').addEventListener('click', () => togglePanel('spot-list-panel', 'toggle-spot-list'));
  $('toggle-day-detail').addEventListener('click', () => togglePanel('day-detail-panel', 'toggle-day-detail'));
  $('toggle-day-plan').addEventListener('click', () => togglePanel('day-plan-panel', 'toggle-day-plan'));
  $('toggle-route-only').addEventListener('change', (event) => {
    routeOnlyMode = event.target.checked;
    updateMarkers(true);
    updateNearby();
  });
  $('day-plan-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveDayPlan();
    setPanelState('day-plan-panel', 'toggle-day-plan', false);
  });
  $('add-day-plan-item').addEventListener('click', () => {
    const items = [...collectDayPlanItems(true), buildDayPlanItem()];
    renderDayPlanItemsEditor(items, getSelectedPlan().route);
  });
  $('expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('expense-person').setCustomValidity('');
    if (!$('expense-person').value) {
      $('expense-person').setCustomValidity('Bitte eine Person auswählen.');
      $('expense-person').reportValidity();
      return;
    }
    const receiptFile = $('expense-receipt').files[0];
    await saveExpense({
      person: $('expense-person').value,
      amount: Number($('expense-amount').value),
      notes: $('expense-description').value,
      description: $('expense-description').value,
      category: $('expense-category').value,
      date: $('expense-date').value
    }, receiptFile);
    e.target.reset();
    fillPeople();
  });
  $('spot-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const spotId = $('spot-id').value;
    const rawAddress = $('spot-address').value.trim();
    $('spot-status').textContent = 'Ort wird gesucht und gespeichert ...';

    try {
      const geocoded = await geocodeSpotInput(rawAddress);
      const spot = {
        id: spotId || generateSpotId($('spot-name').value),
        name: $('spot-name').value.trim(),
        category: $('spot-category').value,
        lat: geocoded.lat,
        lng: geocoded.lng,
        note: $('spot-note').value.trim(),
        address: geocoded.resolvedLabel
      };
      await persistSpot(spot);
      if (supabaseClient && !spotId) spots.push(spot);
      else if (supabaseClient) {
        const index = spots.findIndex((entry) => entry.id === spot.id);
        if (index >= 0) spots.splice(index, 1, spot);
      }
      refreshSpotsUI({ focusSpotId: spot.id });
      setPanelState('spot-list-panel', 'toggle-spot-list', true);
      resetSpotForm();
      $('spot-status').textContent = `Spot gespeichert: ${spot.name}`;
    } catch (error) {
      $('spot-status').textContent = error.message || 'Spot konnte nicht gespeichert werden.';
      alert(error.message || 'Spot konnte nicht gespeichert werden.');
    }
  });
  $('spot-cancel-edit').addEventListener('click', resetSpotForm);
}

async function bootstrap() {
  checkForAppUpdate();
  initSupabase();
  $('storage-hint').textContent = getStorageHintText();
  if (!supabaseClient) spots = loadLocalSpots();
  await hydrateSpots();
  await syncFixedAccommodationCoordinates();
  await hydrateItineraryPlans();
  selectedPlanDate = getTodayPlan().date;
  renderTripOverview();
  renderToday();
  renderItinerary();
  renderCategoryFilters();
  fillSpotCategories();
  fillPeople();
  initMap();
  bindEvents();
  bindSectionNavigation();
  updateMarkers(true);
  locateUser(true, false);
  renderSpotList();
  resetSpotForm();
  setPanelState('spot-form-panel', 'toggle-spot-form', false);
  setPanelState('spot-list-panel', 'toggle-spot-list', false);
  setPanelState('day-detail-panel', 'toggle-day-detail', true);
  setPanelState('day-plan-panel', 'toggle-day-plan', false);
  renderExpenses();
  if (window.location.hash) flashNavigationTarget(window.location.hash);
}

bootstrap();
