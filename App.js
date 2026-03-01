import React, { Component, useState, useEffect } from 'react';
import VideosScreen from "./src/screens/VideosScreen";
import CameraScreen from "./src/screens/CameraScreen";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Image, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { applyDecayToAllConfidenceScores } from "./src/components/atoms/confidencescores";
import { isTrustedDevice, getSessionToken } from "./src/components/atoms/attestation";
import { hasAcceptedEULA, acceptEULA } from "./src/components/atoms/moderation";
import EULAScreen from "./src/components/molecules/EULAScreen";

class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorBoundary}>
          <Text style={styles.errorBoundaryTitle}>Something went wrong</Text>
          <Text style={styles.errorBoundaryMessage}>
            The app ran into an unexpected error. Please try again.
          </Text>
          <TouchableOpacity style={styles.errorBoundaryButton} onPress={this.handleReset}>
            <Text style={styles.errorBoundaryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const Tab = createBottomTabNavigator();

export default function App() {
  const [trusted, setTrusted] = useState(null); // null: loading, false: blocked, true: continue
  const [eulaAccepted, setEulaAccepted] = useState(null); // null: loading, false: show EULA, true: continue

  useEffect(() => {
    const initialize = async () => {
      // Run device trust + EULA check in parallel — neither depends on the other
      const [trustedResult, acceptedResult] = await Promise.all([
        isTrustedDevice(),
        hasAcceptedEULA(),
      ]);

      setTrusted(trustedResult);
      setEulaAccepted(acceptedResult);

      // Eagerly attest + decay scores during loading screen so feeds
      // launch with a valid JWT and fresh confidence scores.
      if (trustedResult && acceptedResult) {
        Promise.all([
          getSessionToken(),
          applyDecayToAllConfidenceScores(),
        ]).catch(error =>
          console.error('Error during initialization:', error)
        );
      }
    };

    initialize();
  }, []);

  const handleAcceptEULA = async () => {
    const success = await acceptEULA();
    if (success) {
      setEulaAccepted(true);
      try {
        await Promise.all([
          getSessionToken(),
          applyDecayToAllConfidenceScores(),
        ]);
      } catch (error) {
        console.error('Error during initialization:', error);
      }
    }
  };

  if (trusted === null || (trusted && eulaAccepted === null)) {
    return null; // loading
  }

  if (!trusted) {
    return (
        <View style={styles.blocked}>
          <Text style={styles.blockedText}>⚠️ Device not supported.</Text>
        </View>
    );
  }

  if (!eulaAccepted) {
    return <EULAScreen onAccept={handleAcceptEULA} />;
  }

  return (
    <ErrorBoundary>
      <NavigationContainer>
        <Tab.Navigator
            screenOptions={{
              tabBarStyle: styles.tabBarStyle,
              tabBarIconStyle: styles.tabBarIconStyle,
              tabBarActiveTintColor: '#ffffff',
              tabBarInactiveTintColor: '#888888',
              tabBarLabelStyle: { color: '#ffffff' },
            }}
        >
          <Tab.Screen
              name="Feed"
              component={VideosScreen}
              options={{
                headerShown: false,
                tabBarIcon: ({ color }) => (
                    <Image
                        source={require('@assets/icons/tab_bar/dual_play.png')}
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
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  tabBarStyle: {
    height: 68,
    backgroundColor: '#000000',
    borderTopWidth: 0.5,
    borderTopColor: '#333',
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
  errorBoundary: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 24,
  },
  errorBoundaryTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  errorBoundaryMessage: {
    fontSize: 16,
    color: '#aaa',
    textAlign: 'center',
    marginBottom: 24,
  },
  errorBoundaryButton: {
    backgroundColor: '#333',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  errorBoundaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});