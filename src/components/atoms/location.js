import * as Location from 'expo-location';

export const fetchGeoLocation = async () => {
  console.debug('Fetching geolocation...');
  try {
    // Request permission
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.warn('Permission to access location was denied');
      return {city: null, region: null, country: null};
    }

    // Fetch current location
    const location = await Location.getCurrentPositionAsync({});
    const {latitude, longitude} = location.coords;

    const geocode = await Location.reverseGeocodeAsync({latitude, longitude});
    const city = geocode[0]?.city || null;
    // get the country
    const region = geocode[0]?.region || null;
    const country = geocode[0]?.country || null;
    console.debug('Geolocation:', {city, region, country});

    return {city, region, country};
  } catch (error) {
    console.error('Error fetching geolocation:', error);
    return {city: null, region: null, country: null};
  }
};