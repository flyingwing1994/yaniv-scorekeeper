import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'new' }
  | { name: 'game'; id: string; key?: string }
  | { name: 'players' }
  | { name: 'presets' }
  | { name: 'history' }
  | { name: 'settings' };

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query);
  switch (parts[0]) {
    case 'new': return { name: 'new' };
    case 'g': return parts[1] ? { name: 'game', id: parts[1].toUpperCase(), key: params.get('k') ?? undefined } : { name: 'home' };
    case 'players': return { name: 'players' };
    case 'presets': return { name: 'presets' };
    case 'history': return { name: 'history' };
    case 'settings': return { name: 'settings' };
    default: return { name: 'home' };
  }
}

export function navigate(to: string, replace = false) {
  const hash = to.startsWith('#') ? to : `#${to}`;
  if (replace) history.replaceState(null, '', hash);
  else location.hash = hash;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function gameUrl(id: string, key?: string) {
  return `${location.origin}/#/g/${id}${key ? `?k=${key}` : ''}`;
}
