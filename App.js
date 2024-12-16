import VideosScreen from "./src/screens/VideosScreen";
import CameraScreen from "./src/screens/CameraScreen";
import {View, Text} from "react-native";
import {NavigationContainer} from "@react-navigation/native";
import {createBottomTabNavigator} from "@react-navigation/bottom-tabs";
import Ionicons from 'react-native-vector-icons/Ionicons';

const Tab = createBottomTabNavigator();

export default function App() {
    return (
        <NavigationContainer>
            <Tab.Navigator>
                <Tab.Screen name="Home" component={VideosScreen} options={{headerShown: false}}/>
                <Tab.Screen name="Camera" component={CameraScreen} options={{headerShown: false}}/>
            </Tab.Navigator>
        </NavigationContainer>
    );
}
