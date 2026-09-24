/* eslint-disable react-refresh/only-export-components -- provider and its hook intentionally share one module */
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { api, authToken } from '../lib/api';
import type { Customer } from '../types';

export type UserRole = 'SUPER_ADMIN' | 'CUSTOMER' | 'SUPPORT_MEMBER';

export type SupportCustomer = Pick<Customer, 'id' | 'name' | 'accountCode' | 'isActive'>;

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  customerId: string | null;
  customer?: Customer | null;
  supportCustomers?: SupportCustomer[];
};

type LoginResponse = { accessToken: string; user: AuthUser };

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    authToken.clear();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!authToken.get()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await api.get<AuthUser>('/auth/me'));
    } catch {
      logout();
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    void refresh();
    window.addEventListener('billing-switch:unauthorized', logout);
    return () => window.removeEventListener('billing-switch:unauthorized', logout);
  }, [logout, refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.post<LoginResponse>('/auth/login', { email, password });
    authToken.set(result.accessToken);
    setUser(result.user);
    return result.user;
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, isAuthenticated: Boolean(user), login, logout, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
