import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { WorkspaceId } from '../types/gis';
import {
  GisUser,
  Permission,
  RoleId,
  authenticate,
  canAccessWorkspace,
  defaultWorkspace,
  hasPermission,
} from './rbac';

const SESSION_KEY = 'eagle_gis_session';

interface SessionUser {
  username: string;
  role: RoleId;
  displayName: string;
  unit: string;
}

interface AuthContextValue {
  user: SessionUser | null;
  login: (username: string, password: string) => boolean;
  logout: () => void;
  canOpen: (workspace: WorkspaceId) => boolean;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readSession(): SessionUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionUser;
    if (!parsed?.username || !parsed?.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

function toSession(user: GisUser): SessionUser {
  return {
    username: user.username,
    role: user.role,
    displayName: user.displayName,
    unit: user.unit,
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SessionUser | null>(() => readSession());

  const login = useCallback((username: string, password: string) => {
    const match = authenticate(username, password);
    if (!match) return false;
    const session = toSession(match);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setUser(session);
    return true;
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      login,
      logout,
      canOpen: (workspace) => (user ? canAccessWorkspace(user.role, workspace) : false),
      can: (permission) => (user ? hasPermission(user.role, permission) : false),
    }),
    [user, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function useDefaultWorkspace(): WorkspaceId {
  const { user } = useAuth();
  return user ? defaultWorkspace(user.role) : 'gis-dashboard';
}
