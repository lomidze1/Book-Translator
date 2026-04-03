import { Tabs } from 'expo-router';
import { colors } from '@/theme/colors';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.light.primary,
        tabBarInactiveTintColor: colors.light.textSecondary,
        headerStyle: { backgroundColor: colors.light.background },
        headerTintColor: colors.light.text,
      }}
    >
      <Tabs.Screen
        name="library"
        options={{
          title: 'ბიბლიოთეკა',
          tabBarLabel: 'ბიბლიოთეკა',
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'ძებნა',
          tabBarLabel: 'ძებნა',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'პროფილი',
          tabBarLabel: 'პროფილი',
        }}
      />
    </Tabs>
  );
}
