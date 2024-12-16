import VideosScreen from "./src/screens/VideosScreen";
import CameraScreen from "./src/screens/CameraScreen";
import {NavigationContainer} from "@react-navigation/native";
import {createBottomTabNavigator} from "@react-navigation/bottom-tabs";

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
