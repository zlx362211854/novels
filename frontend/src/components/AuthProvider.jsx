import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '@/services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [user, setUser] = useState(null);

  const refresh = async () => {
    setStatus((current) => (current === 'authenticated' ? current : 'loading'));
    try {
      const res = await authApi.me();
      setUser({ username: res.data.username });
      setStatus('authenticated');
      return true;
    } catch {
      setUser(null);
      setStatus('unauthenticated');
      return false;
    }
  };

  const login = async (username, password) => {
    await authApi.login(username, password);
    await refresh();
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setStatus('unauthenticated');
    }
  };

  useEffect(() => {
    refresh();
    const handleUnauthorized = () => {
      setUser(null);
      setStatus('unauthenticated');
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const value = useMemo(() => ({
    status,
    user,
    isAuthenticated: status === 'authenticated',
    login,
    logout,
    refresh,
  }), [status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
