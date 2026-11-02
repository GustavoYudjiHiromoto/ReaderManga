import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase.js';
import { FirebaseSyncService, SyncStatus } from '../services/firebaseSync.js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  syncStatus: SyncStatus;
  lastSynced: Date | null;
  syncError: string | null;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  syncNow: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('offline');
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    // Listen to Firebase Auth state
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      const st = FirebaseSyncService.getStatus();
      setSyncStatus(st.status);
      setLastSynced(st.lastSynced);
      setSyncError(st.error);
    });

    // Listen to Sync Service status changes
    const unsubscribeSync = FirebaseSyncService.subscribe(() => {
      const st = FirebaseSyncService.getStatus();
      setSyncStatus(st.status);
      setLastSynced(st.lastSynced);
      setSyncError(st.error);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeSync();
    };
  }, []);

  const loginWithGoogle = async () => {
    try {
      await FirebaseSyncService.loginWithGoogle();
    } catch (err) {
      console.error('Login error', err);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await FirebaseSyncService.logout();
    } catch (err) {
      console.error('Logout error', err);
      throw err;
    }
  };

  const syncNow = async () => {
    if (user) {
      await FirebaseSyncService.syncAllData(user.uid);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        syncStatus,
        lastSynced,
        syncError,
        loginWithGoogle,
        logout,
        syncNow
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
