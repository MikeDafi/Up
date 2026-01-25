import React, { useState, useEffect } from 'react';
import VideosScreen from "./src/screens/VideosScreen";
import CameraScreen from "./src/screens/CameraScreen";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Image, StyleSheet, View, Text } from 'react-native';
import { applyDecayToAllConfidenceScores } from "./src/components/atoms/confidencescores";
import { aggregateUpdateUserData } from "./src/components/atoms/user_functions";
import { isTrustedDevice } from "./src/components/atoms/attestation";
import { hasAcceptedEULA, acceptEULA } from "./src/components/atoms/moderation";
import EULAScreen from "./src/components/molecules/EULAScreen";

const Tab = createBottomTabNavigator();

export default function App() {
  const [trusted, setTrusted] = useState(null); // null: loading, false: blocked, true: continue
  const [eulaAccepted, setEulaAccepted] = useState(null); // null: loading, false: show EULA, true: continue

  useEffect(() => {
    const checkDeviceTrust = async () => {
      const trusted = await isTrustedDevice();
      setTrusted(trusted);

      if (trusted) {
        // Check EULA acceptance
        const accepted = await hasAcceptedEULA();
        setEulaAccepted(accepted);

        if (accepted) {
          try {
            await applyDecayToAllConfidenceScores();
            await aggregateUpdateUserData();
          } catch (error) {
            console.error('Error during initialization:', error);
          }
        }
      }
    };

    checkDeviceTrust();
  }, []);

  const handleEULAAccept = async () => {
    await acceptEULA();
    setEulaAccepted(true);
    
    // Run initialization after EULA acceptance
    try {
      await applyDecayToAllConfidenceScores();
      await aggregateUpdateUserData();
    } catch (error) {
      console.error('Error during initialization:', error);
    }
  };

  if (trusted === null || (trusted && eulaAccepted === null)) {
    return null; // or splash screen / loading indicator
  }

  if (!trusted) {
    return (
        <View style={styles.blocked}>
          <Text style={styles.blockedText}>⚠️ Device not supported.</Text>
        </View>
    );
  }

  if (!eulaAccepted) {
    return <EULAScreen onAccept={handleEULAAccept} />;
  }

  return (
      <NavigationContainer>
        <Tab.Navigator
            screenOptions={{
              tabBarStyle: styles.tabBarStyle,
              tabBarIconStyle: styles.tabBarIconStyle,
            }}
        >
          <Tab.Screen
              name="Feed"
              component={VideosScreen}
              options={{
                headerShown: false,
                tabBarIcon: ({ color }) => (
                    <Image
                        source={require('@assets/icons/tab_bar/two_way.png')}
                        style={[styles.icon, { tintColor: color }]}
                    />
                ),
              }}
          />
          <Tab.Screen
              name="Create"
              component={CameraScreen}
              options={{
                headerShown: false,
                tabBarIcon: ({ color }) => (
                    <Image
                        source={require('@assets/icons/tab_bar/upload.png')}
                        style={[styles.icon, { tintColor: color }]}
                    />
                ),
              }}
          />
        </Tab.Navigator>
      </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBarStyle: {
    height: 68,
    backgroundColor: 'white',
    borderTopWidth: 0.5,
    borderTopColor: '#ccc',
  },
  tabBarIconStyle: {
    marginTop: 5,
  },
  icon: {
    width: 24,
    height: 24,
  },
  blocked: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  blockedText: {
    fontSize: 18,
    color: '#444',
  },
});