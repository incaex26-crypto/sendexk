// Geocoding behind a swappable provider interface.
// Default: public Nominatim — light use only; 1 req/s, no bulk, no autocomplete.
// Before launch: replace with a self-hosted or paid provider.

const USER_AGENT = 'SenDexk-delivery-platform/0.1';

async function nominatimProvider(address, region) {
  if (!region.country) throw new Error('region.country is required for geocoding');
  const cc = region.country;
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=${cc}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Nominatim error ${res.status}`);
  const [hit] = await res.json();
  if (!hit) return null;
  return {
    lat: parseFloat(hit.lat),
    lng: parseFloat(hit.lon),
    confidence: hit.type === 'house' ? 'exact' : hit.type === 'street' ? 'street' : 'suburb',
  };
}

/**
 * Geocode an address string for the given region.
 * Pass a custom `provider(address, region) => Promise<{lat,lng,confidence}|null>` to swap the backend.
 */
function geocode(address, region, provider = nominatimProvider) {
  return provider(address, region);
}

module.exports = { geocode, nominatimProvider };
