'use client';

import { useState, useRef, useEffect, useCallback, DragEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { API_URL, getAccessToken } from '@/lib/api-client';
import styles from './page.module.scss';


// .zip included because macOS often reports EPUB/DOCX as .zip during drag & drop
const ACCEPTED_EXTENSIONS = ['.pdf', '.epub', '.txt', '.docx', '.zip'];
const MAX_FILE_SIZE = 50 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(name: string): string {
  return name.substring(name.lastIndexOf('.')).toLowerCase();
}

interface UploadResponse {
  duplicate: boolean;
  book: { id: string; title?: string };
  translationAvailable?: boolean;
  message: string;
}

export default function UploadPage() {
  const t = useTranslations('upload');
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // Restore uploadResult from sessionStorage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('uploadResult');
      if (saved) {
        const parsed = JSON.parse(saved) as UploadResponse;
        setUploadResult(parsed);
        setUploadProgress(100);
      }
    } catch {
      sessionStorage.removeItem('uploadResult');
    }
  }, []);

  useEffect(() => {
    return () => {
      if (xhrRef.current) xhrRef.current.abort();
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, []);

  const validateFile = (f: File): string | null => {
    const ext = getFileExtension(f.name);
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return t('error_type', { ext });
    }
    if (f.size > MAX_FILE_SIZE) {
      return t('error_size', { size: formatFileSize(f.size) });
    }
    if (f.size === 0) {
      return t('error_empty');
    }
    return null;
  };

  const handleFile = (f: File) => {
    setError('');
    const validationError = validateFile(f);
    if (validationError) {
      setError(validationError);
      setFile(null);
      return;
    }
    setFile(f);
  };

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  };

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    setError('');
    setUploadResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;

      const uploadPromise = new Promise<UploadResponse>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 90));
        });
        xhr.addEventListener('load', () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) resolve(data);
            else {
              const errorMsg = data.message || t('error_upload');
              reject(new Error(Array.isArray(errorMsg) ? errorMsg[0] : errorMsg));
            }
          } catch {
            reject(new Error(t('error_server')));
          }
        });
        xhr.addEventListener('error', () => reject(new Error(t('error_network'))));
        xhr.addEventListener('abort', () => reject(new Error(t('error_aborted'))));

        // XHR is used here for upload progress events. The in-memory access
        // token is sufficient — a stale token will simply 401, and the user
        // can retry after the silent refresh on the next request.
        const token = getAccessToken();
        xhr.open('POST', `${API_URL}/api/books/upload`);
        xhr.withCredentials = true;
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);
      });

      const result = await uploadPromise;
      xhrRef.current = null;
      setUploadProgress(100);
      setUploadResult(result);

      // Save to sessionStorage so result survives navigation (e.g., login redirect)
      try {
        sessionStorage.setItem('uploadResult', JSON.stringify(result));
      } catch {
        // sessionStorage might be full or unavailable
      }

      if (!result.duplicate) {
        redirectTimerRef.current = setTimeout(() => {
          sessionStorage.removeItem('uploadResult');
          router.push(`/books/${result.book.id}`);
        }, 2000);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('error_upload');
      setError(message);
      setUploadProgress(0);
    } finally {
      setUploading(false);
      xhrRef.current = null;
    }
  }, [file, router, t]);

  const removeFile = () => {
    setFile(null);
    setError('');
    setUploadProgress(0);
    setUploadResult(null);
    sessionStorage.removeItem('uploadResult');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.subtitle}>{t('subtitle')}</p>

        <div
          className={`${styles.dropZone} ${dragActive ? styles.dragActive : ''} ${file ? styles.hasFile : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !file && fileInputRef.current?.click()}
          onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !file) { e.preventDefault(); fileInputRef.current?.click(); } }}
          role="button"
          tabIndex={0}
          aria-label={t('drag_text')}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS.join(',')}
            onChange={handleInputChange}
            className={styles.fileInput}
            tabIndex={-1}
            aria-hidden="true"
          />

          {!file ? (
            <div className={styles.dropContent}>
              <div className={styles.dropIcon}>📄</div>
              <p className={styles.dropText}>
                {t('drag_text')} <span>{t('drag_click')}</span>
              </p>
              <p className={styles.dropHint}>{t('drag_hint')}</p>
            </div>
          ) : (
            <div className={styles.filePreview}>
              <div className={styles.fileIcon}>
                {getFileExtension(file.name) === '.pdf' ? '📕' : '📘'}
              </div>
              <div className={styles.fileDetails}>
                <p className={styles.fileName}>{file.name}</p>
                <p className={styles.fileSize}>{formatFileSize(file.size)}</p>
              </div>
              <button
                type="button"
                className={styles.removeBtn}
                onClick={(e) => { e.stopPropagation(); removeFile(); }}
                aria-label={t('remove_file')}
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {error && <p className={styles.error} role="alert">{error}</p>}

        {uploading && (
          <div className={styles.progressSection}>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${uploadProgress}%` }} />
            </div>
            <span>{uploadProgress}%</span>
          </div>
        )}

        {file && !uploading && uploadProgress < 100 && (
          <button className={styles.uploadBtn} onClick={handleUpload}>
            {t('upload_button')}
          </button>
        )}

        {uploadProgress === 100 && uploadResult && (
          <div className={styles.success}>
            {uploadResult.duplicate ? (
              <>
                <p>
                  {uploadResult.message === 'DUPLICATE_TRANSLATED'
                    ? t('duplicate_translated')
                    : t('duplicate_exists')}
                </p>
                <button
                  className={styles.viewBookBtn}
                  onClick={() => {
                    sessionStorage.removeItem('uploadResult');
                    router.push(`/books/${uploadResult.book.id}`);
                  }}
                >
                  {t('view_book')}
                </button>
              </>
            ) : (
              <p>{t('success')}</p>
            )}
          </div>
        )}

        <div className={styles.infoBox}>
          <h3>{t('how_title')}</h3>
          <ol>
            <li>{t('how_step1')}</li>
            <li>{t('how_step2')}</li>
            <li>{t('how_step3')}</li>
            <li>{t('how_step4')}</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
