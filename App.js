import VideosScreen from "./src/screens/VideosScreen";
import {NavigationContainer} from "@react-navigation/native";
import {createBottomTabNavigator} from "@react-navigation/bottom-tabs";
import Ionicons from 'react-native-vector-icons/Ionicons';

const Tab = createBottomTabNavigator();

export default function App() {
    return (
        <NavigationContainer>
            <Tab.Navigator>
                <Tab.Screen name="Home" component={VideosScreen} options={{headerShown: false}}/>
                <Tab.Screen
                    name="Settings"
                    component={VideosScreen}
                    options={{
                        tabBarIcon: ({color, size}) => (
                            <Ionicons name="cog-outline" color={color} size={size}/>
                        ),
                        headerShown: false
                    }}
                />
            </Tab.Navigator>
        </NavigationContainer>
    );
}
