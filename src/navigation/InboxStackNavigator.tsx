import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import InboxScreen from '../screens/InboxScreen';
import RequestDetailScreen from '../screens/RequestDetailScreen';

export type InboxStackParamList = {
  InboxList: undefined;
  RequestDetail: { assignmentId: string };
};

const Stack = createNativeStackNavigator<InboxStackParamList>();

export default function InboxStackNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator>
      <Stack.Screen name="InboxList" component={InboxScreen} options={{ title: 'Inbox' }} />
      <Stack.Screen
        name="RequestDetail"
        component={RequestDetailScreen}
        options={{
          title: 'Request Detail',
          gestureEnabled: true,
          gestureResponseDistance: 20, // only trigger back from within 20px of screen edge — slider starts at 26px so no conflict
        }}
      />
    </Stack.Navigator>
  );
}
