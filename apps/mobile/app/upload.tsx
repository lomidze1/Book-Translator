import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { authService } from '@/services/auth';
import { useTheme } from '@/theme/ThemeContext';
import { useTranslation } from '@/i18n/useTranslation';
import { useToast } from '@/context/ToastContext';
import { API_URL } from '@/config';

const MAX_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_EXTENSIONS = ['pdf', 'epub', 'txt', 'docx'];

interface UploadResult {
  duplicate: boolean;
  book: { id: string; title?: string };
  translationAvailable?: boolean;
  message: string;
}

type UploadState = 'idle' | 'selected' | 'uploading' | 'success' | 'error';

export default function UploadScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  // Abort XHR on unmount
  useEffect(() => {
    return () => {
      if (xhrRef.current) {
        xhrRef.current.abort();
        xhrRef.current = null;
      }
    };
  }, []);

  const [state, setState] = useState<UploadState>('idle');
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);

  const handlePickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/epub+zip',
          'text/plain',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets?.[0]) return;

      const picked = res.assets[0];
      const ext = (picked.name || '').split('.').pop()?.toLowerCase();

      if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
        showToast(t('upload.error_type'), 'error');
        return;
      }

      if (picked.size && picked.size > MAX_SIZE) {
        showToast(t('upload.error_size'), 'error');
        return;
      }

      setFile(picked);
      setState('selected');
    } catch {
      showToast(t('upload.error_upload'), 'error');
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setState('uploading');
    setProgress(0);

    try {
      const token = await authService.getToken();
      if (!token) throw new Error('Unauthorized');

      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        name: file.name,
        type: file.mimeType || 'application/octet-stream',
      } as any);

      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;

      const uploadPromise = new Promise<UploadResult>((resolve, reject) => {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 90));
          }
        };

        xhr.onload = () => {
          setProgress(100);
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              reject(new Error(t('upload.error_upload')));
            }
          } else {
            reject(new Error(t('upload.error_upload')));
          }
        };

        xhr.onerror = () => reject(new Error(t('upload.error_network')));
        xhr.ontimeout = () => reject(new Error(t('upload.error_network')));

        xhr.open('POST', `${API_URL}/api/books/upload`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.timeout = 120000;
        xhr.send(formData);
      });

      const data = await uploadPromise;
      setResult(data);
      setState('success');

      if (data.duplicate) {
        showToast(t('upload.duplicate_exists'), 'info');
      } else {
        showToast(t('upload.success'), 'success');
      }
    } catch (err: any) {
      // Don't show error if aborted (unmount)
      if (err.message !== 'aborted') {
        setState('error');
        showToast(err.message || t('upload.error_upload'), 'error');
      }
    }
  };

  const formatSize = (bytes?: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.background }]}>
      <View style={s.inner}>
        <Text style={[s.title, { color: theme.text }]}>{t('upload.title')}</Text>
        <Text style={[s.subtitle, { color: theme.textSecondary }]}>{t('upload.subtitle')}</Text>

        {/* File Selection */}
        {state === 'idle' && (
          <TouchableOpacity
            style={[s.selectBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
            onPress={handlePickFile}
          >
            <Text style={s.selectIcon}>📄</Text>
            <Text style={[s.selectText, { color: theme.primary }]}>{t('upload.select_file')}</Text>
            <Text style={[s.selectHint, { color: theme.textSecondary }]}>PDF, EPUB, TXT, DOCX (max 50MB)</Text>
          </TouchableOpacity>
        )}

        {/* Selected File */}
        {(state === 'selected' || state === 'uploading') && file && (
          <View style={[s.fileCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <Text style={[s.fileName, { color: theme.text }]}>{file.name}</Text>
            <Text style={[s.fileSize, { color: theme.textSecondary }]}>{formatSize(file.size)}</Text>

            {state === 'uploading' && (
              <View style={s.progressSection}>
                <View style={[s.progressBar, { backgroundColor: theme.border }]}>
                  <View style={[s.progressFill, { width: `${progress}%`, backgroundColor: theme.primary }]} />
                </View>
                <Text style={[s.progressText, { color: theme.textSecondary }]}>{progress}%</Text>
              </View>
            )}

            {state === 'selected' && (
              <View style={s.fileActions}>
                <TouchableOpacity
                  style={[s.uploadBtn, { backgroundColor: theme.primary }]}
                  onPress={handleUpload}
                >
                  <Text style={s.uploadBtnText}>{t('upload.upload_button')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setFile(null); setState('idle'); }}>
                  <Text style={[s.changeText, { color: theme.textSecondary }]}>{t('upload.select_file')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {state === 'uploading' && (
              <ActivityIndicator style={s.spinner} color={theme.primary} />
            )}
          </View>
        )}

        {/* Success */}
        {state === 'success' && result && (
          <View style={s.successSection}>
            <Text style={s.successIcon}>✅</Text>
            <Text style={[s.successText, { color: theme.text }]}>{t('upload.success')}</Text>
            <TouchableOpacity
              style={[s.viewBtn, { backgroundColor: theme.primary }]}
              onPress={() => router.push(`/book/${result.book.id}`)}
            >
              <Text style={s.viewBtnText}>{t('upload.view_book')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Error — retry */}
        {state === 'error' && (
          <TouchableOpacity
            style={[s.selectBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
            onPress={() => { setState('idle'); setFile(null); }}
          >
            <Text style={s.selectIcon}>🔄</Text>
            <Text style={[s.selectText, { color: theme.primary }]}>{t('common.retry')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, textAlign: 'center', marginBottom: 32 },
  selectBtn: {
    borderWidth: 2, borderStyle: 'dashed', borderRadius: 12,
    padding: 32, alignItems: 'center',
  },
  selectIcon: { fontSize: 40, marginBottom: 12 },
  selectText: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  selectHint: { fontSize: 12 },
  fileCard: { borderWidth: 1, borderRadius: 12, padding: 16 },
  fileName: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  fileSize: { fontSize: 13, marginBottom: 12 },
  fileActions: { gap: 12, alignItems: 'center' },
  uploadBtn: { width: '100%', height: 48, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  uploadBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  changeText: { fontSize: 14, marginTop: 4 },
  progressSection: { marginBottom: 8 },
  progressBar: { height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { fontSize: 13, textAlign: 'center' },
  spinner: { marginTop: 8 },
  successSection: { alignItems: 'center' },
  successIcon: { fontSize: 56, marginBottom: 12 },
  successText: { fontSize: 18, fontWeight: '600', marginBottom: 16 },
  viewBtn: { height: 48, borderRadius: 8, paddingHorizontal: 32, justifyContent: 'center', alignItems: 'center' },
  viewBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
