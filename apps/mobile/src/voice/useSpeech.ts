import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionErrorCode,
} from 'expo-speech-recognition';
import { useSettings } from '@/store/settings';

export type SpeechPhase = 'idle' | 'starting' | 'listening' | 'error';

type Attempt = { lang: string; onDevice: boolean };

/** Errors that mean "this mode/locale can't run here" — worth retrying differently. */
const RETRYABLE: ExpoSpeechRecognitionErrorCode[] = ['language-not-supported', 'service-not-allowed', 'client', 'unknown'];

const MESSAGES: Partial<Record<ExpoSpeechRecognitionErrorCode, string>> = {
  'no-speech': 'I didn’t catch that. Tap the mic and try again.',
  'speech-timeout': 'I didn’t hear anything. Tap the mic and try again.',
  'not-allowed': 'Microphone permission is off. Enable it in Android Settings → Apps → Universal Remote → Permissions.',
  network: 'Voice recognition needs an internet connection on this phone.',
  'audio-capture': 'The microphone is busy or unavailable.',
  busy: 'Voice recognition is busy. Try again in a moment.',
  'service-not-allowed': 'Voice recognition isn’t available. Make sure the Google app is installed and enabled.',
  'language-not-supported': 'This language isn’t supported by the phone’s voice recognition.',
};

/** On-device only if the phone says the language pack is actually installed (Android 13+). */
async function onDeviceReady(lang: string): Promise<boolean> {
  try {
    if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) return false;
    const { installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales({});
    const base = lang.toLowerCase();
    return installedLocales.some((l) => l.toLowerCase().replace('_', '-') === base);
  } catch {
    return false;
  }
}

/**
 * Push-to-talk using Android's SpeechRecognizer (via expo-speech-recognition).
 * No audio is recorded or stored by the app.
 */
export function useSpeech(onFinal: (text: string) => void) {
  const [phase, setPhase] = useState<SpeechPhase>('idle');
  const [partial, setPartial] = useState('');
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<Attempt | null>(null);
  const tried = useRef<Attempt[]>([]);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const clearWatchdog = () => {
    if (watchdog.current) clearTimeout(watchdog.current);
    watchdog.current = null;
  };

  const fail = useCallback((msg: string) => {
    clearWatchdog();
    setError(msg);
    setPhase('error');
  }, []);

  const launch = useCallback((a: Attempt) => {
    attempt.current = a;
    tried.current.push(a);
    setPhase('starting');
    clearWatchdog();
    watchdog.current = setTimeout(() => {
      console.warn('[voice] recogniser did not start', a);
      ExpoSpeechRecognitionModule.abort();
      fail('Voice recognition didn’t start. Check that the Google app is installed and updated.');
    }, 5000);
    ExpoSpeechRecognitionModule.start({
      lang: a.lang,
      interimResults: true,
      requiresOnDeviceRecognition: a.onDevice,
      contextualStrings: ['YouTube', 'Netflix', 'HDMI', 'Sauti Sol', 'Showmax'],
    });
  }, [fail]);

  useEffect(() => clearWatchdog, []);

  useSpeechRecognitionEvent('start', () => {
    clearWatchdog();
    setPhase('listening');
  });
  useSpeechRecognitionEvent('end', () => {
    clearWatchdog();
    setPhase((p) => (p === 'error' || p === 'starting' ? p : 'idle'));
  });
  useSpeechRecognitionEvent('result', (e) => {
    const text = e.results[0]?.transcript ?? '';
    setPartial(text);
    if (e.isFinal && text.trim()) onFinalRef.current(text.trim());
  });
  useSpeechRecognitionEvent('error', (e) => {
    clearWatchdog();
    if (e.error === 'aborted') return setPhase('idle');
    console.warn('[voice] error', e.error, e.message, attempt.current);
    const a = attempt.current;
    if (a && RETRYABLE.includes(e.error)) {
      // 1) on-device failed → try Google's online recogniser; 2) locale unsupported → try en-US.
      const next: Attempt | null = a.onDevice
        ? { lang: a.lang, onDevice: false }
        : a.lang !== 'en-US'
          ? { lang: 'en-US', onDevice: false }
          : null;
      if (next && !tried.current.some((t) => t.lang === next.lang && t.onDevice === next.onDevice)) {
        return launch(next);
      }
    }
    fail(MESSAGES[e.error] ?? `Voice error: ${e.message || e.error}`);
  });

  const start = useCallback(async () => {
    setError(null);
    setPartial('');
    tried.current = [];
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      return fail('This phone has no voice recognition service. Install or enable the Google app, then try again.');
    }
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) return fail(MESSAGES['not-allowed']!);
    const s = useSettings.getState();
    launch({ lang: s.voiceLanguage, onDevice: s.onDeviceSpeech && (await onDeviceReady(s.voiceLanguage)) });
  }, [fail, launch]);

  const stop = useCallback(() => ExpoSpeechRecognitionModule.stop(), []);
  const cancel = useCallback(() => {
    clearWatchdog();
    ExpoSpeechRecognitionModule.abort();
    setPartial('');
    setPhase('idle');
  }, []);

  return { phase, partial, error, start, stop, cancel };
}
