import * as Location from 'expo-location';

// Cache geo result for 5 minutes — avoids redundant GPS activations during
// multi-upload sessions while still picking up meaningful location changes.
const GEO_CACHE_TTL_MS = 60 * 60 * 1000;
let _cachedGeo = null;
let _cachedGeoExpiry = 0;

export const fetchGeoLocation = async () => {
  // Return cached result if still fresh
  if (_cachedGeo && Date.now() < _cachedGeoExpiry) {
    console.debug('Geolocation resolved (cached)');
    return _cachedGeo;
  }

  console.debug('Fetching geolocation...');
  try {
    // Request permission
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.warn('Permission to access location was denied');
      return {city: null, region: null, country: null};
    }

    // Use balanced accuracy — city/region resolution doesn't need high-accuracy GPS
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const {latitude, longitude} = location.coords;

    const geocode = await Location.reverseGeocodeAsync({latitude, longitude});
    const city = geocode[0]?.city || null;
    const region = geocode[0]?.region || null;
    const country = geocode[0]?.country || null;
    console.debug('Geolocation resolved');

    const result = {city, region, country};
    _cachedGeo = result;
    _cachedGeoExpiry = Date.now() + GEO_CACHE_TTL_MS;

    return result;
  } catch (error) {
    console.error('Error fetching geolocation:', error.message);
    return {city: null, region: null, country: null};
  }
};