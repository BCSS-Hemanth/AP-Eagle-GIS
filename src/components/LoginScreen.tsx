import React, { useState } from 'react';
import { Shield } from 'lucide-react';
import { GIS_USERS } from '../auth/rbac';
import { useAuth } from '../auth/AuthContext';
import { EagleCrest } from './EagleCrest';

export const LoginScreen: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = login(username, password);
    if (!ok) setError('Invalid credentials. Access denied.');
  };

  return (
    <div className="min-h-screen bg-[#001428] text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white text-[#0b1c30] rounded-lg shadow-2xl overflow-hidden">
        <div className="bg-[#001428] text-white px-5 py-4 flex items-center gap-3">
          <EagleCrest />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#86f2e4]">
              Government of Andhra Pradesh
            </div>
            <div className="text-sm font-bold">EAGLE Force Spatial Intelligence</div>
          </div>
        </div>
        <form onSubmit={onSubmit} className="p-5 space-y-3" data-testid="login-form">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#006a61]">
            <Shield className="w-4 h-4" />
            <span>Secure RBAC sign-in</span>
          </div>
          <label className="block text-xs font-semibold">
            Username
            <input
              data-testid="login-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full h-9 px-2.5 rounded border border-slate-300 bg-slate-50"
              autoComplete="username"
            />
          </label>
          <label className="block text-xs font-semibold">
            Password
            <input
              data-testid="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full h-9 px-2.5 rounded border border-slate-300 bg-slate-50"
              autoComplete="current-password"
            />
          </label>
          {error && (
            <div data-testid="login-error" className="text-xs font-semibold text-[#ba1a1a]">
              {error}
            </div>
          )}
          <button
            data-testid="login-submit"
            type="submit"
            className="w-full h-9 rounded bg-[#001428] text-white text-xs font-bold hover:bg-[#0f2942] cursor-pointer"
          >
            Sign in
          </button>
          <div className="text-[10.5px] text-slate-600 border-t border-slate-200 pt-3 space-y-1">
            <div className="font-bold text-slate-800">Demo accounts</div>
            {GIS_USERS.map((u) => (
              <div key={u.username} className="font-mono">
                {u.username} / {u.password} — {u.role}
              </div>
            ))}
          </div>
        </form>
      </div>
    </div>
  );
};
