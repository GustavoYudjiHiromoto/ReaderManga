import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-3 right-3 sm:right-auto sm:left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2.5 text-xs font-medium text-white shadow-xl border border-amber-400/30">
      <WifiOff className="h-4 w-4 shrink-0" />
      <span className="truncate">Modo Offline — Usando cache local.</span>
    </div>
  );
};
