'use client';

import { useState, useRef, useEffect, useCallback, DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import styles from './page.module.scss';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/epub+zip',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const ACCEPTED_EXTENSIONS = ['.pdf', '.epub', '.txt', '.docx'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

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

  // Cleanup XHR and timers on unmount
  useEffect(() => {
    return () => {
      if (xhrRef.current) {
        xhrRef.current.abort();
      }
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  const validateFile = (f: File): string | null => {
    const ext = getFileExtension(f.name);
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return `ფაილის ტიპი "${ext}" არ არის მხარდაჭერილი. გამოიყენე: PDF, EPUB, TXT, DOCX`;
    }
    if (f.size > MAX_FILE_SIZE) {
      return `ფაილი ზედმეტად დიდია (${formatFileSize(f.size)}). მაქსიმუმი: 50MB`;
    }
    if (f.size === 0) {
      return 'ფაილი ცარიელია';
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
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
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
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 90);
            setUploadProgress(percent);
          }
        });

        xhr.addEventListener('load', () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(data);
            } else {
              const errorMsg = data.message || 'ატვირთვა ვერ მოხერხდა';
              reject(new Error(Array.isArray(errorMsg) ? errorMsg[0] : errorMsg));
            }
          } catch {
            reject(new Error('სერვერმა არასწორი პასუხი დააბრუნა'));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('ქსელის შეცდომა. შეამოწმე ინტერნეტ კავშირი.'));
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('ატვირთვა გაუქმდა'));
        });

        const token = localStorage.getItem('token');
        xhr.open('POST', `${API_URL}/api/books/upload`);
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }
        xhr.send(formData);
      });

      const result = await uploadPromise;
      xhrRef.current = null;
      setUploadProgress(100);
      setUploadResult(result);

      if (!result.duplicate) {
        redirectTimerRef.current = setTimeout(() => {
          router.push(`/books/${result.book.id}`);
        }, 2000);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ატვირთვა ვერ მოხერხდა. სცადე თავიდან.';
      setError(message);
      setUploadProgress(0);
    } finally {
      setUploading(false);
      xhrRef.current = null;
    }
  }, [file, router]);

  const removeFile = () => {
    setFile(null);
    setError('');
    setUploadProgress(0);
    setUploadResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <>
      <Navbar />
      <main className={styles.main}>
        <div className={styles.container}>
          <h1 className={styles.title}>წიგნის ატვირთვა</h1>
          <p className={styles.subtitle}>
            ატვირთე ინგლისურენოვანი წიგნი და გადათარგმნე ქართულად AI-ით
          </p>

          {/* Drop zone */}
          <div
            className={`${styles.dropZone} ${dragActive ? styles.dragActive : ''} ${file ? styles.hasFile : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => !file && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS.join(',')}
              onChange={handleInputChange}
              className={styles.fileInput}
            />

            {!file ? (
              <div className={styles.dropContent}>
                <div className={styles.dropIcon}>📄</div>
                <p className={styles.dropText}>
                  გადმოათრიე ფაილი აქ ან <span>აირჩიე ფაილი</span>
                </p>
                <p className={styles.dropHint}>
                  PDF, EPUB, TXT, DOCX — მაქსიმუმ 50MB
                </p>
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
                <button className={styles.removeBtn} onClick={(e) => { e.stopPropagation(); removeFile(); }}>
                  ✕
                </button>
              </div>
            )}
          </div>

          {error && <p className={styles.error}>{error}</p>}

          {/* Upload progress */}
          {uploading && (
            <div className={styles.progressSection}>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${uploadProgress}%` }} />
              </div>
              <span>{uploadProgress}%</span>
            </div>
          )}

          {/* Upload button */}
          {file && !uploading && uploadProgress < 100 && (
            <button className={styles.uploadBtn} onClick={handleUpload}>
              ატვირთე და გადათარგმნე — 10₾
            </button>
          )}

          {uploadProgress === 100 && uploadResult && (
            <div className={styles.success}>
              {uploadResult.duplicate ? (
                <>
                  <p>{uploadResult.message}</p>
                  <button
                    className={styles.uploadBtn}
                    onClick={() => router.push(`/books/${uploadResult.book.id}`)}
                  >
                    წიგნის ნახვა
                  </button>
                </>
              ) : (
                <p>წიგნი წარმატებით აიტვირთა! გადამისამართდები წიგნის გვერდზე...</p>
              )}
            </div>
          )}

          {/* Info */}
          <div className={styles.infoBox}>
            <h3>როგორ მუშაობს?</h3>
            <ol>
              <li>ატვირთე ინგლისურენოვანი წიგნი (PDF, EPUB, TXT ან DOCX)</li>
              <li>გადაიხადე თარგმანის საფასური (10₾)</li>
              <li>AI (Claude) გადათარგმნის წიგნს ქართულ ენაზე</li>
              <li>წაიკითხე ნათარგმნი წიგნი ონლაინ რიდერში</li>
            </ol>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
