import { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, TouchableOpacity, PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast, type Toast as ToastItem } from '@/context/ToastContext';
import { useTheme } from '@/theme/ThemeContext';

const TOAST_COLORS = {
  success: { bg: '#22c55e', text: '#fff' },
  error: { bg: '#ef4444', text: '#fff' },
  info: { bg: '#3b82f6', text: '#fff' },
};

function ToastCard({ toast }: { toast: ToastItem }) {
  const { removeToast } = useToast();
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const panX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();
  }, [slideAnim]);

  const dismiss = () => {
    Animated.timing(slideAnim, {
      toValue: -100,
      duration: 200,
      useNativeDriver: true,
    }).start(() => removeToast(toast.id));
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10,
      // Manual setValue avoids Animated.event's useNativeDriver:false,
      // keeping panX consistently on the native driver (release uses native driver too).
      onPanResponderMove: (_, g) => {
        panX.setValue(g.dx);
      },
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) > 80) {
          Animated.timing(panX, {
            toValue: g.dx > 0 ? 400 : -400,
            duration: 200,
            useNativeDriver: true,
          }).start(() => removeToast(toast.id));
        } else {
          Animated.spring(panX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  const colors = TOAST_COLORS[toast.type];

  return (
    <Animated.View
      style={[
        s.toast,
        { backgroundColor: colors.bg, transform: [{ translateY: slideAnim }, { translateX: panX }] },
      ]}
      accessibilityRole="alert"
      {...panResponder.panHandlers}
    >
      <TouchableOpacity style={s.toastInner} onPress={dismiss} activeOpacity={0.8}>
        <Text style={[s.toastText, { color: colors.text }]}>{toast.message}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function ToastContainer() {
  const { toasts } = useToast();
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View style={[s.container, { top: insets.top + 8 }]} pointerEvents="box-none">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    gap: 8,
  },
  toast: {
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  toastInner: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
});
