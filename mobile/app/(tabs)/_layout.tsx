import React, { useState } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link, Tabs } from 'expo-router';
import { Image, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

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
  return <FontAwesome size={20} style={{ marginBottom: -3 }} {...props} />;
}

function ThemeToggleButton() {
  const { mode, setMode } = useAppTheme();
  const [open, setOpen] = useState(false);
  const iconName = 'moon-o';
  const iconColor = mode === 'dark' ? '#fb923c' : '#f97316';

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
                color="#94a3b8"
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
  const sidebarWidth = 200;

  return (
    <Tabs
      initialRouteName="two"
      tabBar={(props) => {
        if (!isWeb) return null;
        const { state, descriptors, navigation } = props;

        return (
          <View style={[styles.sidebar, { width: sidebarWidth }]}>
            {/* Marca — como no site: ícone + CHAINFOLIOAI + subtítulo */}
            <View style={styles.brandWrap}>
              <View style={styles.brandIconWrap}>
                <Image
                  source={require('@/assets/images/icon.png')}
                  style={styles.brandIcon}
                  resizeMode="cover"
                />
              </View>
              <View style={styles.brandTextWrap}>
                <Text style={styles.brandTitle}>CHAINFOLIOAI</Text>
                <Text style={styles.brandSubtitle}>Portfolio Analytics</Text>
              </View>
            </View>

            <Text style={styles.navLabel}>Navigation</Text>

            {state.routes.map((route, index) => {
              const isFocused = state.index === index;
              const options = descriptors[route.key].options;
              const label = options.title ?? route.name;
              const iconColor = isFocused ? '#fb923c' : '#64748b';
              const icon =
                typeof options.tabBarIcon === 'function'
                  ? options.tabBarIcon({ color: iconColor, focused: isFocused, size: 20 })
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
                  <Text
                    style={[
                      styles.sidebarLabel,
                      { color: isFocused ? '#ffffff' : '#94a3b8' },
                    ]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
            <View style={styles.sidebarSpacer} />
          </View>
        );
      }}
      screenOptions={{
        tabBarActiveTintColor: '#fb923c',
        tabBarInactiveTintColor: '#64748b',
        tabBarStyle: isWeb
          ? { display: 'none' }
          : {
              backgroundColor: '#000000',
              borderTopColor: 'rgba(255, 255, 255, 0.06)',
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
        sceneStyle: isWeb
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
        name="two"
        options={{
          title: 'Portfolio',
          tabBarIcon: ({ color }) => <TabBarIcon name="pie-chart" color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Mercado',
          tabBarIcon: ({ color }) => <TabBarIcon name="line-chart" color={color} />,
          headerRight: () => <HeaderActions showInfo />,
        }}
      />
      <Tabs.Screen
        name="manage"
        options={{
          title: 'Gerenciar',
          tabBarIcon: ({ color }) => <TabBarIcon name="sliders" color={color} />,
        }}
      />
      <Tabs.Screen
        name="conta"
        options={{
          title: 'Conta',
          tabBarIcon: ({ color }) => <TabBarIcon name="user-circle" color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // Sidebar preta como o site (bg-black, border white/6).
  sidebar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#000000',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 12,
    gap: 4,
    zIndex: 10,
  },
  brandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 22,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 12,
  },
  brandIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  brandIcon: {
    width: '100%',
    height: '100%',
  },
  brandTextWrap: {
    flexShrink: 1,
  },
  brandTitle: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: '#fb923c',
  },
  brandSubtitle: {
    fontSize: 9,
    color: '#64748b',
    marginTop: 2,
  },
  navLabel: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2.2,
    color: '#475569',
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  sidebarItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  sidebarItemPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  sidebarLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  sidebarSpacer: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 8,
    backgroundColor: 'transparent',
  },
  infoButton: {
    padding: 8,
  },
  themeToggle: {
    padding: 8,
  },
  themeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  themeMenu: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: 'rgba(30, 41, 59, 0.9)',
    padding: 16,
    gap: 8,
  },
  themeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  themeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  themeClose: {
    padding: 6,
  },
  themeCloseText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  themeSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
  },
  themeOption: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  themeOptionActive: {
    backgroundColor: 'rgba(249, 115, 22, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.5)',
  },
  themeOptionText: {
    color: '#f1f5f9',
    fontSize: 14,
    fontWeight: '600',
  },
});
