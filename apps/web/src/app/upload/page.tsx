'use client';

import { useState, useRef, DragEvent } from 'react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import styles from './page.module.scss';

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

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);

    // Simulate upload progress (real implementation will use S3)
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + 10;
      });
    }, 200);

    try {
      // TODO: Real upload to S3 via API
      await new Promise((resolve) => setTimeout(resolve, 2000));
      clearInterval(interval);
      setUploadProgress(100);
    } catch {
      clearInterval(interval);
      setError('ატვირთვა ვერ მოხერხდა. სცადე თავიდან.');
    } finally {
      setUploading(false);
    }
  };

  const removeFile = () => {
    setFile(null);
    setError('');
    setUploadProgress(0);
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

          {uploadProgress === 100 && (
            <div className={styles.success}>
              <p>✅ ფაილი წარმატებით აიტვირთა! თარგმნა მალე დაიწყება.</p>
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
