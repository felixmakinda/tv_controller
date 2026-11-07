import { useCallback, useState } from 'react';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useSettings } from '@/store/settings';

export type SpeechPhase = 'idle' | 'listening' | 'error';

/**
 * Push-to-talk using Android's SpeechRecognizer (via expo-speech-recognition).
 * No audio is recorded or stored by the app.
 */
export function useSpeech(onFinal: (text: string) => void) {
  const [phase, setPhase] = useState<SpeechPhase>('idle');
  const [partial, setPartial] = useState('');
  const [error, setError] = useState<string | null>(null);

  useSpeechRecognitionEvent('start', () => setPhase('listening'));
  useSpeechRecognitionEvent('end', () => setPhase((p) => (p === 'error' ? p : 'idle')));
  useSpeechRecognitionEvent('result', (e) => {
    const text = e.results[0]?.transcript ?? '';
    setPartial(text);
    if (e.isFinal && text.trim()) onFinal(text.trim());
  });
  useSpeechRecognitionEvent('error', (e) => {
    if (e.error === 'aborted') return setPhase('idle');
    setError(e.error === 'no-speech' || e.error === 'speech-timeout' ? 'I didn’t catch that.' : e.message || e.error);
    setPhase('error');
  });

  const start = useCallback(async () => {
    setError(null);
    setPartial('');
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setError('Microphone permission is needed for voice commands.');
      setPhase('error');
      return;
    }
    const s = useSettings.getState();
    ExpoSpeechRecognitionModule.start({
      lang: s.voiceLanguage,
      interimResults: true,
      requiresOnDeviceRecognition: s.onDeviceSpeech,
      contextualStrings: ['YouTube', 'Netflix', 'HDMI', 'Sauti Sol', 'Showmax'],
    });
  }, []);

  const stop = useCallback(() => ExpoSpeechRecognitionModule.stop(), []);
  const cancel = useCallback(() => {
    ExpoSpeechRecognitionModule.abort();
    setPartial('');
    setPhase('idle');
  }, []);

  return { phase, partial, error, start, stop, cancel };
}
