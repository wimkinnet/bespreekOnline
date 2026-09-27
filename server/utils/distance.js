// Driving distance between two postal addresses, using free OpenStreetMap services:
// Nominatim to geocode each address, OSRM to route between them. No API key needed,
// but Nominatim asks for an identifying User-Agent and max ~1 request/second,
// so results are cached in memory.

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';

const geocodeCache = new Map();
const routeCache = new Map();

function userAgent() {
  return process.env.GEOCODER_USER_AGENT || 'bespreekOnline';
}

function travelRatePerKm() {
  const rate = Number(process.env.TRAVEL_RATE_PER_KM);
  return Number.isFinite(rate) && rate >= 0 ? rate : 0.45;
}

function formatAddress(address = {}) {
  return [address.street, [address.postalCode, address.city].filter(Boolean).join(' '), address.country]
    .filter(Boolean)
    .join(', ');
}

function hasAddress(address) {
  return Boolean(address && (address.city || address.postalCode));
}

class DistanceError extends Error {}

async function geocode(address) {
  const key = formatAddress(address).toLowerCase();
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  const params = new URLSearchParams({ format: 'json', limit: '1' });
  if (address.street) params.set('street', address.street);
  if (address.postalCode) params.set('postalcode', address.postalCode);
  if (address.city) params.set('city', address.city);
  params.set('country', address.country || 'Belgium');

  const res = await fetch(`${NOMINATIM_URL}?${params}`, { headers: { 'User-Agent': userAgent() } });
  if (!res.ok) throw new DistanceError(`Address lookup failed (${res.status}).`);
  const results = await res.json();
  if (!results.length) throw new DistanceError(`Address not found: ${formatAddress(address)}`);

  const point = { lat: Number(results[0].lat), lon: Number(results[0].lon) };
  geocodeCache.set(key, point);
  return point;
}

// Returns the one-way driving distance in km, rounded to one decimal
async function drivingDistanceKm(fromAddress, toAddress) {
  const cacheKey = `${formatAddress(fromAddress)}|${formatAddress(toAddress)}`.toLowerCase();
  if (routeCache.has(cacheKey)) return routeCache.get(cacheKey);

  const from = await geocode(fromAddress);
  const to = await geocode(toAddress);
  const res = await fetch(`${OSRM_URL}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`, {
    headers: { 'User-Agent': userAgent() },
  });
  if (!res.ok) throw new DistanceError(`Route lookup failed (${res.status}).`);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) throw new DistanceError('No driving route found.');

  const km = Math.round(data.routes[0].distance / 100) / 10;
  routeCache.set(cacheKey, km);
  return km;
}

// Full travel calculation for a consultant visiting a client (round trip)
async function travelForConsultant(consultant, client) {
  if (!hasAddress(consultant.homeAddress)) {
    throw new DistanceError(`${consultant.name} has no home address yet.`);
  }
  if (!hasAddress(client.address)) {
    throw new DistanceError(`${client.name} has no address yet.`);
  }
  const oneWayKm = await drivingDistanceKm(consultant.homeAddress, client.address);
  const roundTripKm = Math.round(oneWayKm * 2 * 10) / 10;
  const ratePerKm = travelRatePerKm();
  return {
    from: formatAddress(consultant.homeAddress),
    to: formatAddress(client.address),
    oneWayKm,
    roundTripKm,
    ratePerKm,
    travelAmount: Math.round(roundTripKm * ratePerKm * 100) / 100,
  };
}

module.exports = { travelForConsultant, travelRatePerKm, DistanceError };
