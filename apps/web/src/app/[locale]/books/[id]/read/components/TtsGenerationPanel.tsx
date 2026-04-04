'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import VoiceSelector from './VoiceSelector';
import TtsProgressBar from './TtsProgressBar';
import styles from '../reader.module.scss';

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

interface Props {
  bookId: string;
  apiUrl: string;
  token: string;
  onAudioReady: (audioBookId: string) => void;
}

interface Estimate {
  totalChapters: number;
  totalCharacters: number;
  estimatedCostUsd: number;
  estimatedAudioMinutes: number;
  estimatedAudioHours: number;
  provider: string;
}

interface SynthesizeResult {
  audioBookId: string;
  totalChapters: number;
  queued: number;
  status: string;
}

export default function TtsGenerationPanel({ bookId, apiUrl, token, onAudioReady }: Props) {
  const t = useTranslations('reader');

  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1.0);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [audioBookId, setAudioBookId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Fetch estimate when voice is selected
  useEffect(() => {
    if (!selectedVoiceId) return;

    async function fetchEstimate() {
      setEstimateLoading(true);
      try {
        const res = await fetch(
          `${apiUrl}/api/tts/estimate?bookId=${bookId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.ok) {
          setEstimate(await res.json());
        }
      } catch {
        // ignore
      } finally {
        setEstimateLoading(false);
      }
    }
    fetchEstimate();
  }, [selectedVoiceId, bookId, apiUrl, token]);

  const handleGenerate = async () => {
    setShowConfirm(false);
    setGenerating(true);
    setError('');

    try {
      const res = await fetch(`${apiUrl}/api/tts/synthesize-book`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bookId,
          voiceId: selectedVoiceId,
          speed,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || t('tts_failed'));
        setGenerating(false);
        return;
      }

      const result: SynthesizeResult = await res.json();
      setAudioBookId(result.audioBookId);
    } catch {
      setError(t('tts_failed'));
      setGenerating(false);
    }
  };

  const handleComplete = useCallback(() => {
    if (audioBookId) {
      onAudioReady(audioBookId);
    }
    setGenerating(false);
  }, [audioBookId, onAudioReady]);

  // If already generating, show progress
  if (generating && audioBookId) {
    return (
      <TtsProgressBar
        audioBookId={audioBookId}
        apiUrl={apiUrl}
        token={token}
        totalChapters={estimate?.totalChapters || 0}
        onComplete={handleComplete}
      />
    );
  }

  return (
    <div className={styles.ttsPanel}>
      <h3 className={styles.ttsPanelTitle}>{t('tts_generate')}</h3>

      <VoiceSelector
        apiUrl={apiUrl}
        token={token}
        selectedVoiceId={selectedVoiceId}
        onSelect={setSelectedVoiceId}
      />

      <div className={styles.ttsSpeedSelect}>
        <label>{t('tts_speed')}</label>
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className={styles.ttsSelect}
        >
          {SPEED_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}x</option>
          ))}
        </select>
      </div>

      {estimate && !estimateLoading && (
        <div className={styles.ttsEstimate}>
          <div className={styles.ttsEstimateRow}>
            <span>{t('tts_chapters_count', { count: estimate.totalChapters })}</span>
            <span>{t('tts_audio_hours', { hours: estimate.estimatedAudioHours })}</span>
          </div>
          <div className={styles.ttsEstimateRow}>
            <span>{estimate.totalCharacters.toLocaleString()} {t('tts_chars')}</span>
            <span>~${estimate.estimatedCostUsd}</span>
          </div>
        </div>
      )}

      {error && <p className={styles.ttsError}>{error}</p>}

      {!showConfirm ? (
        <button
          className={styles.ttsGenerateBtn}
          onClick={() => setShowConfirm(true)}
          disabled={!selectedVoiceId || estimateLoading}
        >
          {t('tts_generate')}
        </button>
      ) : (
        <div className={styles.ttsConfirm}>
          <p className={styles.ttsConfirmTitle}>{t('tts_confirm_title')}</p>
          {estimate && (
            <p className={styles.ttsConfirmText}>
              {t('tts_confirm_text', { hours: estimate.estimatedAudioHours })}
            </p>
          )}
          <div className={styles.ttsConfirmActions}>
            <button className={styles.ttsConfirmYes} onClick={handleGenerate}>
              {t('tts_generate')}
            </button>
            <button className={styles.ttsConfirmNo} onClick={() => setShowConfirm(false)}>
              {t('tts_cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
