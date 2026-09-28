import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import InboxScreen from '../screens/InboxScreen';
import RequestDetailScreen from '../screens/RequestDetailScreen';
import { useThemeColors } from '../../constants/theme';

export type InboxStackParamList = {
  InboxList: undefined;
  RequestDetail: { assignmentId: string };
};

const Stack = createNativeStackNavigator<InboxStackParamList>();

export default function InboxStackNavigator(): React.JSX.Element {
  const C = useThemeColors();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: C.white },
        headerTintColor: C.black,
        headerTitleStyle: { color: C.black },
      }}
    >
      <Stack.Screen name="InboxList" component={InboxScreen} options={{ title: 'Inbox' }} />
      <Stack.Screen
        name="RequestDetail"
        component={RequestDetailScreen}
        options={{ title: 'Request Detail', gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
