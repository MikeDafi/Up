import { Location } from 'expo-location';
const fetchGeolocation = async () => {
  try {
    // Request permission
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.warn('Permission to access location was denied');
      return {city: null, region: null, country: null};
    }

    // Fetch current location
    const location = await Location.getCurrentPositionAsync({});
    const { latitude, longitude } = location.coords;

    const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
    const city = geocode[0]?.city || null;
    // get the country
    const region = geocode[0]?.region || null;
    const country = geocode[0]?.country || null;

    return { city, region, country };
  } catch (error) {
    console.error('Error fetching geolocation:', error);
    return { city: null, region: null, country: null };
  }
};