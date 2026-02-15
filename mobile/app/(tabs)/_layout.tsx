import React, { useState } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link, Tabs } from 'expo-router';
import { Image, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useAppTheme } from '@/context/ThemeContext';

// You can explore the built-in icon families and icons on the web at https://icons.expo.fyi/
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={28} style={{ marginBottom: -3 }} {...props} />;
}

function ThemeToggleButton() {
  const { mode, setMode } = useAppTheme();
  const [open, setOpen] = useState(false);
  const iconName = 'moon-o';
  const iconColor = mode === 'dark' ? '#38bdf8' : '#0ea5e9';

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.themeToggle}>
        <FontAwesome name={iconName} size={18} color={iconColor} />
      </Pressable>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.themeOverlay}>
          <View style={styles.themeMenu}>
            <View style={styles.themeHeader}>
              <Text style={styles.themeTitle}>Selecionar tema</Text>
              <Pressable onPress={() => setOpen(false)} style={styles.themeClose}>
                <Text style={styles.themeCloseText}>✕</Text>
              </Pressable>
            </View>
            <Text style={styles.themeSubtitle}>Modo atual: {mode === 'dark' ? 'Escuro' : 'Claro'}</Text>
            <Pressable
              style={[styles.themeOption, mode === 'light' ? styles.themeOptionActive : null]}
              onPress={() => {
                setMode('light');
                setOpen(false);
              }}>
              <Text style={styles.themeOptionText}>Claro</Text>
            </Pressable>
            <Pressable
              style={[styles.themeOption, mode === 'dark' ? styles.themeOptionActive : null]}
              onPress={() => {
                setMode('dark');
                setOpen(false);
              }}>
              <Text style={styles.themeOptionText}>Escuro</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

function HeaderActions({ showInfo }: { showInfo?: boolean }) {
  return (
    <View style={styles.headerActions}>
      {showInfo ? (
        <Link href="/modal" asChild>
          <Pressable style={styles.infoButton}>
            {({ pressed }) => (
              <FontAwesome
                name="info-circle"
                size={18}
                color="#93c5fd"
                style={{ opacity: pressed ? 0.6 : 1 }}
              />
            )}
          </Pressable>
        </Link>
      ) : null}
      <ThemeToggleButton />
    </View>
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isWeb = Platform.OS === 'web';
  const sidebarWidth = 140;

  return (
    <Tabs
      tabBar={(props) => {
        if (!isWeb) return null;
        const { state, descriptors, navigation } = props;
        const activeColor = '#bfdbfe';
        const inactiveColor = '#93c5fd';

        return (
          <LinearGradient
            colors={['#f97316', '#0b0f1a']}
            locations={[0, 0.55]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[styles.sidebar, { width: sidebarWidth }]}>
            {state.routes.map((route, index) => {
              const isFocused = state.index === index;
              const options = descriptors[route.key].options;
              const label = options.title ?? route.name;
              const color = isFocused ? activeColor : inactiveColor;
              const icon =
                typeof options.tabBarIcon === 'function'
                  ? options.tabBarIcon({ color, focused: isFocused, size: 22 })
                  : null;

              const onPress = () => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });

                if (!isFocused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              };

              const onLongPress = () => {
                navigation.emit({ type: 'tabLongPress', target: route.key });
              };

              return (
                <Pressable
                  key={route.key}
                  onPress={onPress}
                  onLongPress={onLongPress}
                  style={({ pressed }) => [
                    styles.sidebarItem,
                    isFocused ? styles.sidebarItemActive : null,
                    pressed ? styles.sidebarItemPressed : null,
                  ]}>
                  {icon}
                  <View style={styles.sidebarLabelWrapper}>
                    <Text style={[styles.sidebarLabel, { color }]}>{label}</Text>
                  </View>
                </Pressable>
              );
            })}
            <View style={styles.sidebarSpacer} />
            <View style={styles.sidebarOwlWrap}>
              <Image
                source={require('@/assets/images/portfolio-logo.png')}
                style={styles.sidebarLogo}
                resizeMode="contain"
              />
              <LinearGradient
                colors={['#f97316', '#7dd3fc']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.owlTitleWrap}>
                <Text style={styles.owlTitle}>OwlFund</Text>
              </LinearGradient>
            </View>
          </LinearGradient>
        );
      }}
      screenOptions={{
        tabBarActiveTintColor: '#bfdbfe',
        tabBarInactiveTintColor: '#93c5fd',
        tabBarStyle: isWeb
          ? { display: 'none' }
          : {
              backgroundColor: Colors[colorScheme ?? 'light'].background,
              borderTopColor: 'rgba(124, 58, 237, 0.4)',
              borderTopWidth: 1,
            },
        headerStyle: {
          backgroundColor: Colors[colorScheme ?? 'light'].background,
          marginLeft: isWeb ? sidebarWidth : 0,
        },
        headerTitleStyle: {
          color: Colors[colorScheme ?? 'light'].text,
          fontWeight: '700',
        },
        headerRight: () => <HeaderActions />,
        sceneContainerStyle: isWeb
          ? {
              paddingLeft: sidebarWidth,
              paddingTop: 12,
              paddingRight: 12,
              paddingBottom: 12,
              backgroundColor: Colors[colorScheme ?? 'light'].background,
            }
          : undefined,
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Resumo',
          tabBarIcon: ({ color }) => <TabBarIcon name="pie-chart" color={color} />,
          headerRight: () => <HeaderActions showInfo />,
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          title: 'Portfólio',
          tabBarIcon: ({ color }) => <TabBarIcon name="briefcase" color={color} />,
        }}
      />
      <Tabs.Screen
        name="manage"
        options={{
          title: 'Gerenciar',
          tabBarIcon: ({ color }) => <TabBarIcon name="sliders" color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#0b0f1a',
    borderRightWidth: 1,
    borderRightColor: 'rgba(56, 189, 248, 0.45)',
    paddingTop: 48,
    gap: 6,
    zIndex: 10,
  },
  sidebarSpacer: {
    flex: 1,
  },
  sidebarOwlWrap: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 92,
    gap: 8,
  },
  owlTitleWrap: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    opacity: 0.8,
  },
  owlTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: '#0b0f1a',
  },
  sidebarLogo: {
    width: 76,
    height: 76,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    transform: [{ scaleX: -1 }],
  },
  sidebarItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    marginHorizontal: 10,
    gap: 6,
  },
  sidebarItemActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
  },
  sidebarItemPressed: {
    opacity: 0.8,
  },
  sidebarLabelWrapper: {
    alignItems: 'center',
  },
  sidebarLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginRight: 12,
  },
  infoButton: {
    padding: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  themeToggle: {
    padding: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
  },
  themeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  themeMenu: {
    width: 220,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    backgroundColor: '#0b0f1a',
    padding: 16,
    gap: 10,
  },
  themeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  themeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#e2e8f0',
  },
  themeSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
  },
  themeClose: {
    padding: 4,
  },
  themeCloseText: {
    fontSize: 16,
    color: '#94a3b8',
  },
  themeOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
  },
  themeOptionActive: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
  },
  themeOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e2e8f0',
  },
});
