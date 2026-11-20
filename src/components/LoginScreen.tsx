import React, { useState } from 'react';
import { ChevronDown, Shield } from 'lucide-react';
import { GIS_USERS } from '../auth/rbac';
import { useAuth } from '../auth/AuthContext';
import { EagleCrest } from './EagleCrest';

export const LoginScreen: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showDemo, setShowDemo] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = login(username, password);
    if (!ok) setError('Invalid credentials. Access denied.');
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden text-white">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 18% 8%, rgba(11,117,108,0.3), transparent 55%), radial-gradient(ellipse 70% 50% at 92% 78%, rgba(42,74,115,0.38), transparent 52%), linear-gradient(165deg, #041018 0%, #071929 42%, #0c2438 100%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.55) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.55) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />

      <div className="relative w-full max-w-md rounded-xl overflow-hidden shadow-[0_28px_70px_rgba(0,0,0,0.48)] border border-white/10 bg-white text-[#0b1c30]">
        <div className="px-5 py-5 flex items-center gap-3 bg-[#071929] text-white border-b border-white/10">
          <EagleCrest className="w-12 h-12 shrink-0 rounded-md bg-white/95 p-0.5 shadow-sm" />
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7fddd2]">
              Government of Andhra Pradesh
            </div>
            <div className="font-display text-[17px] font-semibold leading-tight mt-0.5">
              EAGLE Force Spatial Intelligence
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-3.5" data-testid="login-form">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-secondary">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-secondary-container/70 text-secondary">
              <Shield className="w-3.5 h-3.5" />
            </span>
            <span>Secure RBAC sign-in</span>
          </div>
          <label className="block text-xs font-semibold text-on-surface">
            Username
            <input
              data-testid="login-username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError(null);
              }}
              required
              autoFocus
              className="mt-1.5 ws-field !font-medium"
              autoComplete="username"
            />
          </label>
          <label className="block text-xs font-semibold text-on-surface">
            Password
            <input
              data-testid="login-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              required
              className="mt-1.5 ws-field !font-medium"
              autoComplete="current-password"
            />
          </label>
          <label className="flex items-center gap-2 text-[11px] font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
            />
            Show password
          </label>
          {error && (
            <div
              data-testid="login-error"
              role="alert"
              className="text-xs font-semibold text-error bg-error-container/80 border border-error/20 rounded-md px-2.5 py-2"
            >
              {error}
            </div>
          )}
          <button
            data-testid="login-submit"
            type="submit"
            className="w-full h-10 rounded-md bg-primary text-on-primary text-xs font-bold tracking-wide hover:bg-primary-container cursor-pointer shadow-sm"
          >
            Sign in
          </button>

          {import.meta.env.DEV && (
          <div className="border-t border-outline-variant/40 pt-3">
            <button
              type="button"
              className="w-full flex items-center justify-between text-[11px] font-bold text-on-surface hover:text-primary cursor-pointer"
              onClick={() => setShowDemo((v) => !v)}
              aria-expanded={showDemo}
            >
              <span>Demo accounts</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-on-surface-variant transition-transform ${
                  showDemo ? 'rotate-180' : ''
                }`}
              />
            </button>
            {showDemo ? (
              <div className="mt-2 text-[10.5px] text-on-surface-variant space-y-1 rounded-md bg-surface-container-low/80 border border-outline-variant/40 p-2.5">
                {GIS_USERS.map((u) => (
                  <div key={u.username} className="font-mono leading-relaxed">
                    {u.username} / {u.password} — {u.role}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          )}
        </form>
      </div>
    </div>
  );
};
