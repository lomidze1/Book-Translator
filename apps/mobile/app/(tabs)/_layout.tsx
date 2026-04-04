import { Tabs } from 'expo-router';
import { useTheme } from '@/theme/ThemeContext';

export default function TabsLayout() {
  const { theme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.background, borderTopColor: theme.border },
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
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
