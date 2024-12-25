import VideosScreen from "./src/screens/VideosScreen";
import CameraScreen from "./src/screens/CameraScreen";
import {NavigationContainer} from "@react-navigation/native";
import {createBottomTabNavigator} from "@react-navigation/bottom-tabs";
import { Image } from 'react-native';


const Tab = createBottomTabNavigator();

export default function App() {
    return (
        <NavigationContainer>
            <Tab.Navigator>
                <Tab.Screen
                    name="Feed"
                    component={VideosScreen}
                    options={{
                      headerShown: false,
                      tabBarIcon: ({ color, size }) => (
                          <Image
                              source={require('@assets/icons/tab_bar/two_way.png')}
                              style={{ width: size, height: size, tintColor: color }}
                          />
                      ),
                }}
                />
                <Tab.Screen
                    name="Camera"
                    component={CameraScreen}
                    options={{
                      headerShown: false,
                      tabBarIcon: ({ color, size }) => (
                          <Image
                              source={require('@assets/icons/tab_bar/upload.png')}
                              style={{ width: size, height: size, tintColor: color }}
                          />
                      ),
                    }}
                />
            </Tab.Navigator>
        </NavigationContainer>
    );
}
