import { useEffect, useState } from 'react';
import { receiveGame } from './store';
import type { Game } from './types';

export type LiveStatus = 'connecting' | 'live' | 'offline' | 'missing';

/** Volg een potje live via Server-Sent Events; valt terug op de lokale kopie als de server weg is. */
export function useLiveGame(id: string | null): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>('connecting');

  useEffect(() => {
    if (!id || typeof EventSource === 'undefined') return;
    setStatus('connecting');
    const es = new EventSource(`/api/games/${id}/events`);
    es.addEventListener('game', ev => {
      try {
        receiveGame(JSON.parse((ev as MessageEvent).data) as Game);
        setStatus('live');
      } catch { /* negeer kapotte berichten */ }
    });
    es.addEventListener('missing', () => setStatus('missing'));
    es.onerror = () => setStatus(navigator.onLine ? 'connecting' : 'offline');
    return () => es.close();
  }, [id]);

  return status;
}
