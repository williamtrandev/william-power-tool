import { useCallback, useEffect, useState } from 'react';

/** A labelled secret key, saved in this browser's localStorage. */
export interface SavedKey {
  id: string;
  label: string;
  key: string;
}

const KEYS = 'william-tool-watane-keys';
const SELECTED = 'william-tool-watane-selected';
const LEGACY = 'william-tool-watane-key';

// crypto.randomUUID needs a secure context; this tool may be served over plain http on an intranet
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function read(): SavedKey[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEYS) || '[]') as SavedKey[];
    // migrate the single "remembered" key from the previous version
    const legacy = localStorage.getItem(LEGACY);
    if (legacy) {
      if (!list.some((k) => k.key === legacy)) list.unshift({ id: newId(), label: 'Key đã lưu', key: legacy });
      localStorage.removeItem(LEGACY);
      localStorage.setItem(KEYS, JSON.stringify(list));
    }
    return Array.isArray(list) ? list.filter((k) => k && typeof k.key === 'string') : [];
  } catch {
    return [];
  }
}

function readSelected(list: SavedKey[]): string | null {
  try {
    const id = localStorage.getItem(SELECTED);
    if (id && list.some((k) => k.id === id)) return id;
  } catch {
    /* storage unavailable */
  }
  return list[0]?.id ?? null;
}

export function useKeyStore() {
  const [keys, setKeys] = useState<SavedKey[]>(read);
  const [selectedId, setSelectedId] = useState<string | null>(() => readSelected(keys));

  useEffect(() => {
    try {
      localStorage.setItem(KEYS, JSON.stringify(keys));
      if (selectedId) localStorage.setItem(SELECTED, selectedId);
      else localStorage.removeItem(SELECTED);
    } catch {
      /* storage unavailable */
    }
  }, [keys, selectedId]);

  const add = useCallback((label: string, key: string) => {
    const k: SavedKey = { id: newId(), label: label.trim(), key };
    setKeys((ks) => [...ks, k]);
    setSelectedId(k.id);
  }, []);

  const update = useCallback((id: string, patch: Partial<Omit<SavedKey, 'id'>>) => {
    setKeys((ks) => ks.map((k) => (k.id === id ? { ...k, ...patch, label: (patch.label ?? k.label).trim() } : k)));
  }, []);

  const remove = useCallback((id: string) => {
    setKeys((ks) => {
      const next = ks.filter((k) => k.id !== id);
      setSelectedId((sel) => (sel === id ? (next[0]?.id ?? null) : sel));
      return next;
    });
  }, []);

  const selected = keys.find((k) => k.id === selectedId) ?? null;
  return { keys, selected, select: setSelectedId, add, update, remove };
}
