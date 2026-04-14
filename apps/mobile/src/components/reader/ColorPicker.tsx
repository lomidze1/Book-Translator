import { View, TouchableOpacity, StyleSheet } from 'react-native';

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'red';

const COLORS: { key: HighlightColor; hex: string }[] = [
  { key: 'yellow', hex: '#facc15' },
  { key: 'green', hex: '#22c55e' },
  { key: 'blue', hex: '#3b82f6' },
  { key: 'red', hex: '#ef4444' },
];

interface ColorPickerProps {
  selected?: HighlightColor;
  onSelect: (color: HighlightColor) => void;
}

export default function ColorPicker({ selected, onSelect }: ColorPickerProps) {
  return (
    <View style={s.container}>
      {COLORS.map((c) => (
        <TouchableOpacity
          key={c.key}
          style={[
            s.dot,
            { backgroundColor: c.hex },
            selected === c.key && s.dotSelected,
          ]}
          onPress={() => onSelect(c.key)}
          accessibilityLabel={c.key}
        />
      ))}
    </View>
  );
}

export const HIGHLIGHT_HEX: Record<HighlightColor, string> = {
  yellow: '#facc15',
  green: '#22c55e',
  blue: '#3b82f6',
  red: '#ef4444',
};

const s = StyleSheet.create({
  container: { flexDirection: 'row', gap: 10, justifyContent: 'center', paddingVertical: 8 },
  dot: { width: 28, height: 28, borderRadius: 14 },
  dotSelected: { borderWidth: 3, borderColor: '#000' },
});
