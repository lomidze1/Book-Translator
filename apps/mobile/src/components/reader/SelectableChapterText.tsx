import { useRef, useState } from 'react';
import {
  Platform, StyleSheet, Text, TextInput,
  type NativeSyntheticEvent, type StyleProp, type TextInputSelectionChangeEventData, type TextStyle,
} from 'react-native';
import type { TextSegment } from '@book-translator/reader';
import { HIGHLIGHT_HEX, type HighlightColor } from './ColorPicker';

interface Props {
  chapterNumber: number;
  /** Whole chapter text, cut into runs by highlight colour. */
  segments: TextSegment[];
  style: StyleProp<TextStyle>;
  onSelect: (
    chapterNumber: number,
    start: number,
    end: number,
    input: TextInput | null,
  ) => void;
}

/**
 * A chapter rendered as selectable text that reports real character offsets.
 *
 * `<Text>` can be selected but never tells us *what* was selected — RN exposes
 * no selection callback on it — so the chapter is a read-only `TextInput`, the
 * one primitive with `onSelectionChange`. The whole chapter is a single input
 * on purpose: the reported offsets are then already offsets into
 * `translatedContent`, which is the coordinate space the API stores, and a
 * selection can still span paragraphs the way it does on web.
 */
export default function SelectableChapterText({ chapterNumber, segments, style, onSelect }: Props) {
  const inputRef = useRef<TextInput>(null);
  // Android only: bumping this remounts the input, restoring the source text.
  const [revision, setRevision] = useState(0);

  const handleSelectionChange = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    const { start, end } = e.nativeEvent.selection;
    onSelect(chapterNumber, start, end, inputRef.current);
  };

  return (
    <TextInput
      key={revision}
      ref={inputRef}
      multiline
      // The outer ScrollView owns scrolling; the input grows to its full height.
      scrollEnabled={false}
      // Android disables the view outright when `editable` is false
      // (ReactTextInputManager → `isEnabled = editable`), and a disabled
      // EditText cannot be selected at all. So it stays editable there with the
      // keyboard suppressed, while iOS keeps a genuinely read-only text view.
      editable={Platform.OS === 'android'}
      showSoftInputOnFocus={false}
      caretHidden
      // A paste from the Android context menu would desync the text from the
      // offsets we store against it — put the source text straight back.
      onChangeText={Platform.OS === 'android' ? () => setRevision((r) => r + 1) : undefined}
      onSelectionChange={handleSelectionChange}
      style={[s.input, style]}
    >
      {segments.map((segment) => (
        <Text
          key={segment.start}
          style={segment.color ? { backgroundColor: HIGHLIGHT_HEX[segment.color as HighlightColor] || HIGHLIGHT_HEX.yellow } : undefined}
        >
          {segment.text}
        </Text>
      ))}
    </TextInput>
  );
}

const s = StyleSheet.create({
  // Strip the input chrome so it reads as body text, not a form field.
  input: { padding: 0, margin: 0, textAlignVertical: 'top' },
});
