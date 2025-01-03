import React from 'react';
import VideosScreen from "./src/screens/VideosScreen";
import CameraScreen from "./src/screens/CameraScreen";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Image, StyleSheet } from 'react-native';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
      <NavigationContainer>
        <Tab.Navigator
            screenOptions={{
              tabBarStyle: styles.tabBarStyle, // Reduce tab bar height
              tabBarIconStyle: styles.tabBarIconStyle, // Adjust icon size (optional)
            }}
        >
          <Tab.Screen
              name="Feed"
              component={VideosScreen}
              options={{
                headerShown: false,
                tabBarIcon: ({ color, size }) => (
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
                tabBarIcon: ({ color, size }) => (
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
    height: 68, // Reduce the height of the tab bar
    backgroundColor: 'white', // Optional: Set a background color
    borderTopWidth: 0.5, // Optional: Add a border to the top
    borderTopColor: '#ccc', // Optional: Border color
  },
  tabBarIconStyle: {
    marginTop: 5, // Adjust icon alignment within the smaller tab bar
  },
  icon: {
    width: 24, // Adjust icon size
    height: 24,
  },
})