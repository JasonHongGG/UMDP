import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { AttachResponse, ProcessInfo } from '../types';

export function useProcessAttachment(onAttachInitiate: () => void, onAttachSuccess: () => void, onAttachError: (err: string) => void) {
  const [attached, setAttached] = useState<AttachResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unlisten = listen<ProcessInfo>('process-selected', async (event) => {
      setError(null);
      onAttachInitiate();

      try {
        const result = await invoke<AttachResponse>('attach_to_process', {
          pid: event.payload.pid,
          name: event.payload.name,
        });

        setAttached(result);
        onAttachSuccess();
      } catch (invokeError) {
        setAttached(null);
        const errorMsg = String(invokeError);
        setError(errorMsg);
        onAttachError(errorMsg);
      }
    });

    return () => {
      unlisten.then((dispose) => dispose());
    };
  }, [onAttachInitiate, onAttachSuccess, onAttachError]);

  return { attached, error };
}
