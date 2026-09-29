import { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { supabase } from '../lib/supabaseClient.js';
import { urlLogo } from '../lib/themes.js';
import type { CasinoSettings } from '../lib/types.js';
import type { Session } from '@supabase/supabase-js';

interface LoginProps {
  settings: CasinoSettings | null | undefined;
  onLoginSuccess: (session: Session) => void;
}

function Login({ settings, onLoginSuccess }: LoginProps) {
  const nombre = settings?.casino_name || 'RivelBet';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPass, setVerPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);

    const { data, error: errSupabase } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setCargando(false);

    if (errSupabase) {
      setError('Email o contraseña incorrectos.');
      setPassword('');
      return;
    }

    onLoginSuccess(data.session);
  };

  return (
    <div className="login-screen">
      <div className="login-fondo"></div>
      <div className="login-velo"></div>

      <div className="login-contenido">
        <div className="login-marca">
          <img className="login-logo" src={urlLogo(settings)} alt={nombre} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <h1 className="login-titulo">{nombre}</h1>
          <p className="login-bajada">Caja</p>
        </div>

        <form className="login-card" autoComplete="on" onSubmit={enviar}>
          <div className="login-campo">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              required
              autoComplete="username"
              placeholder="cajero@casino.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>

          <div className="login-campo">
            <label htmlFor="password">Contraseña</label>
            <div className="login-pass">
              <input
                type={verPass ? 'text' : 'password'}
                id="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="login-ojo"
                aria-label="Mostrar contraseña"
                onClick={() => setVerPass((v) => !v)}
              >
                {verPass ? 'Ocultar' : 'Ver'}
              </button>
            </div>
          </div>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="login-submit" disabled={cargando}>
            {cargando ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <p className="login-pie">Acceso exclusivo para personal autorizado</p>
      </div>
    </div>
  );
}

const roots = new WeakMap<Element, Root>();

/**
 * Mismo contrato que la versión anterior en JS: main.js sigue llamando
 * renderLogin(container, settings, onLoginSuccess) sin enterarse de que
 * ahora es un componente de React.
 */
export function renderLogin(
  container: Element,
  settings: CasinoSettings | null | undefined,
  onLoginSuccess: (session: Session) => void
) {
  let root = roots.get(container);
  if (!root) {
    root = createRoot(container);
    roots.set(container, root);
  }
  root.render(<Login settings={settings} onLoginSuccess={onLoginSuccess} />);
}
