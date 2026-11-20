import { useEffect, useState } from 'react';
import {
  AppVersionSnapshot,
  applyAppUpdateAndReload,
  checkForAppUpdate,
  getAppVersionSnapshot,
  subscribeAppVersion
} from '../services/appVersion.js';

let initialized = false;

export function useAppVersion(): AppVersionSnapshot & {
  checkNow: () => Promise<AppVersionSnapshot>;
  applyUpdate: () => Promise<void>;
} {
  const [state, setState] = useState<AppVersionSnapshot>(() => getAppVersionSnapshot());

  useEffect(() => {
    const unsubscribe = subscribeAppVersion(() => {
      setState(getAppVersionSnapshot());
    });

    if (!initialized) {
      initialized = true;
      const timer = window.setTimeout(() => {
        checkForAppUpdate(false);
      }, 1200);

      const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
          checkForAppUpdate(false);
        }
      };
      document.addEventListener('visibilitychange', handleVisibility);

      // Clean listener only stays active for app lifetime since hook is singleton-initialized
      void timer;
    }

    return unsubscribe;
  }, []);

  return {
    ...state,
    checkNow: () => checkForAppUpdate(true),
    applyUpdate: () => applyAppUpdateAndReload()
  };
}
