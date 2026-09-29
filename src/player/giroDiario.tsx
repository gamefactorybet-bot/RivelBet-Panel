import { useEffect, useMemo, useState } from 'react';
import { formatMoney } from '../lib/currency.ts';
import { ruletaSvg, indicePorPremio, rotacionGanadora } from '../lib/ruleta.js';
import { playerFetch } from './api.ts';
import type { GiroDiarioEstado } from '../lib/types.js';

const REDUCIR = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;

function Countdown({ hasta }: { hasta: string }) {
  const [txt, setTxt] = useState('');
  useEffect(() => {
    const tick = () => {
      const ms = new Date(hasta).getTime() - Date.now();
      if (ms <= 0) { setTxt('¡ya!'); return; }
      const s = Math.floor(ms / 1000);
      const hh = String(Math.floor(s / 3600)).padStart(2, '0');
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      setTxt(`${hh}:${mm}:${ss}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [hasta]);
  return <b>{txt}</b>;
}

function Ruleta({ premios, rot, girando, tema }: { premios: GiroDiarioEstado['premios']; rot: number; girando: boolean; tema?: string }) {
  const { svg } = useMemo(() => ruletaSvg(premios, tema), [premios, tema]);
  return (
    <div className="pt-rul" data-tema={tema || 'casino'}>
      <div className="pt-rul-flecha" />
      <div className="pt-rul-aro" />
      <div className="pt-rul-luces" />
      <div className="pt-rul-cara">
        <div
          className="pt-rul-svg"
          style={{
            transform: `rotate(${rot}deg)`,
            transition: girando && !REDUCIR ? 'transform 4.6s cubic-bezier(.12,.75,.15,1)' : 'none',
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
      <div className="pt-rul-hub">GIRÁ</div>
    </div>
  );
}

export function GiroModal({
  estado, onCerrar, onCambio,
}: { estado: GiroDiarioEstado; onCerrar: () => void; onCambio: () => void }) {
  const yaGiro = estado.giroHoy;
  const [fase, setFase] = useState<'listo' | 'girando' | 'resultado' | 'error'>(yaGiro ? 'resultado' : 'listo');
  const [premio, setPremio] = useState(yaGiro ? Number(yaGiro.premio) : 0);
  const [msg, setMsg] = useState('');
  const [rot, setRot] = useState(0);

  const tema = estado.tema || 'casino';
  const { segs, n } = useMemo(() => ruletaSvg(estado.premios, tema), [estado.premios, tema]);

  const cerrar = () => { onCerrar(); if (fase === 'resultado' && !yaGiro) onCambio(); };

  const girar = async () => {
    if (fase !== 'listo') return;
    setFase('girando');

    const res = await playerFetch<{ premio: number }>('/api/player-juego?recurso=giro', { method: 'POST' });
    if (!res.ok) { setFase('error'); setMsg(res.error); return; }

    const p = Number(res.data.premio) || 0;
    const idx = indicePorPremio(segs, p);
    setRot((r) => Math.ceil(r / 360) * 360 + rotacionGanadora(n, idx, 6));

    setTimeout(() => { setPremio(p); setFase('resultado'); }, REDUCIR ? 200 : 4700);
  };

  return (
    <div className="pt-modal-fondo" onClick={(e) => { if (e.target === e.currentTarget && fase !== 'girando') cerrar(); }}>
      <div className="pt-giro-hoja" data-tema={tema}>
        <div className="pt-sheet-head">
          <h3>Giro diario</h3>
          {fase !== 'girando' && <button className="pt-cerrar" onClick={cerrar}>×</button>}
        </div>

        {!yaGiro && <p className="hint" style={{ textAlign: 'center', marginTop: 0 }}>Una vez por día.</p>}

        <Ruleta premios={estado.premios} rot={rot} girando={fase === 'girando'} tema={tema} />

        <div className="pt-rul-premios">
          {estado.premios.filter((p) => p.monto > 0).map((p, i, arr) => (
            <span key={i} className={i === arr.length - 1 ? 'top' : ''}>{formatMoney(p.monto)}</span>
          ))}
        </div>

        {fase === 'listo' && <button className="pt-enviar" onClick={girar}>GIRAR</button>}
        {fase === 'girando' && <p className="hint" style={{ textAlign: 'center' }}>Girando...</p>}

        {fase === 'resultado' && (
          <div className={`pt-giro-res ${premio > 0 ? 'gano' : ''}`}>
            {premio > 0 ? (
              <>
                <small>{yaGiro ? 'Tu giro de hoy' : '¡Ganaste!'}</small>
                <strong>+ {formatMoney(premio)}</strong>
              </>
            ) : (
              <strong>{yaGiro ? 'Hoy no tocó' : 'Hoy no tocó'}</strong>
            )}
            <span>Tu próximo giro en <Countdown hasta={estado.proximoAt} /></span>
            <button className="pt-enviar" style={{ marginTop: 12 }} onClick={cerrar}>Listo</button>
          </div>
        )}

        {fase === 'error' && (
          <>
            <p className="hint error" style={{ textAlign: 'center' }}>{msg}</p>
            <button className="pt-enviar secundario" onClick={onCerrar}>Cerrar</button>
          </>
        )}
      </div>
    </div>
  );
}
