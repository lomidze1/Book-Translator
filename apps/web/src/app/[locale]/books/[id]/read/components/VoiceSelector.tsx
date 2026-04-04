'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import styles from '../reader.module.scss';

interface Voice {
  id: string;
  name: string;
  language: string;
  gender: 'male' | 'female' | 'neutral';
  provider: string;
  previewUrl?: string;
}

interface Props {
  apiUrl: string;
  token: string;
  selectedVoiceId: string | null;
  onSelect: (voiceId: string) => void;
  language?: string;
}

export default function VoiceSelector({ apiUrl, token, selectedVoiceId, onSelect, language = 'ka' }: Props) {
  const t = useTranslations('reader');
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');
  const [previewPlaying, setPreviewPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch voices once on mount (stable deps only to avoid infinite loops)
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const selectedRef = useRef(selectedVoiceId);
  selectedRef.current = selectedVoiceId;

  useEffect(() => {
    let cancelled = false;

    async function fetchVoices() {
      try {
        const res = await fetch(`${apiUrl}/api/tts/voices/all?language=${language}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setVoices(data);
          if (!selectedRef.current && data.length > 0) {
            onSelectRef.current(data[0].id);
          }
        }
      } catch {
        try {
          const res = await fetch(`${apiUrl}/api/tts/voices?language=${language}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok && !cancelled) {
            const data = await res.json();
            setVoices(data);
            if (!selectedRef.current && data.length > 0) {
              onSelectRef.current(data[0].id);
            }
          }
        } catch {
          // ignore
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchVoices();

    return () => { cancelled = true; };
  }, [apiUrl, token, language]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const filteredVoices = voices.filter((v) =>
    genderFilter === 'all' || v.gender === genderFilter,
  );

  const playPreview = (voice: Voice) => {
    if (previewPlaying === voice.id) {
      audioRef.current?.pause();
      setPreviewPlaying(null);
      return;
    }

    if (voice.previewUrl) {
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      audioRef.current.src = voice.previewUrl;
      audioRef.current.play();
      audioRef.current.onended = () => setPreviewPlaying(null);
      setPreviewPlaying(voice.id);
    }
  };

  if (loading) {
    return <div className={styles.voiceSelector}><span className={styles.voiceLoading}>...</span></div>;
  }

  return (
    <div className={styles.voiceSelector}>
      <label className={styles.voiceLabel}>{t('tts_select_voice')}</label>

      <div className={styles.voiceGenderFilter}>
        <button
          className={`${styles.genderBtn} ${genderFilter === 'all' ? styles.active : ''}`}
          onClick={() => setGenderFilter('all')}
        >
          {t('tts_all') ?? 'All'}
        </button>
        <button
          className={`${styles.genderBtn} ${genderFilter === 'female' ? styles.active : ''}`}
          onClick={() => setGenderFilter('female')}
        >
          {t('tts_female')}
        </button>
        <button
          className={`${styles.genderBtn} ${genderFilter === 'male' ? styles.active : ''}`}
          onClick={() => setGenderFilter('male')}
        >
          {t('tts_male')}
        </button>
      </div>

      <div className={styles.voiceList}>
        {filteredVoices.map((voice) => (
          <div
            key={voice.id}
            className={`${styles.voiceItem} ${selectedVoiceId === voice.id ? styles.voiceSelected : ''}`}
            onClick={() => onSelect(voice.id)}
          >
            <div className={styles.voiceInfo}>
              <span className={styles.voiceName}>{voice.name}</span>
              <span className={styles.voiceMeta}>
                {voice.provider} | {voice.gender}
              </span>
            </div>
            {voice.previewUrl && (
              <button
                className={styles.voicePreviewBtn}
                onClick={(e) => { e.stopPropagation(); playPreview(voice); }}
              >
                {previewPlaying === voice.id ? '||' : t('tts_voice_preview')}
              </button>
            )}
          </div>
        ))}
        {filteredVoices.length === 0 && (
          <p className={styles.noVoices}>{t('tts_no_voices')}</p>
        )}
      </div>
    </div>
  );
}
