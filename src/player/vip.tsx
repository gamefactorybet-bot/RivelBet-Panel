import { formatMoney } from '../lib/currency.ts';
import { IconoAnimado } from './IconoAnimado.tsx';
import type { VipNivel } from '../lib/types.js';

/* La piedra del nivel: animación Lottie > imagen > gema dibujada. */
export function GemaNivel({ nivel, className }: { nivel: VipNivel; className?: string }) {
  const gemaCss = (
    <span
      className={`vip-gema-css ${className || ''}`}
      style={{ ['--gc' as string]: nivel.color }}
    />
  );

  if (nivel.animacionUrl) {
    return <IconoAnimado url={nivel.animacionUrl} className={`vip-gema-anim ${className || ''}`} fallback={gemaCss} />;
  }
  if (nivel.imagenUrl) {
    return <img src={nivel.imagenUrl} alt="" draggable={false} className={`vip-gema-img ${className || ''}`} />;
  }
  return gemaCss;
}

export interface VipData {
  niveles: VipNivel[];
  cargado: number;
  nivelId: string | null;
}

function resolver({ niveles, cargado, nivelId }: VipData) {
  const ordenados = [...niveles].sort((a, b) => a.orden - b.orden);
  const actual = ordenados.find((n) => n.id === nivelId) || ordenados[0] || null;
  if (!actual) return null;
  const siguiente = ordenados.find((n) => n.orden > actual.orden) || null;
  const falta = siguiente ? Math.max(0, siguiente.umbral - cargado) : 0;
  const span = siguiente ? siguiente.umbral - actual.umbral : 1;
  const pct = siguiente ? Math.min(100, Math.max(0, ((cargado - actual.umbral) / span) * 100)) : 100;
  return { ordenados, actual, siguiente, falta, pct };
}

export function VipCard({ vip, onAbrir }: { vip: VipData; onAbrir: () => void }) {
  const r = resolver(vip);
  if (!r) return null;

  return (
    <button className="pt-vip-card" onClick={onAbrir} style={{ ['--gc' as string]: r.actual.color }}>
      <div className="pt-vip-gema"><GemaNivel nivel={r.actual} /></div>
      <div className="pt-vip-txt">
        <strong>{r.actual.nombre}</strong>
        {r.siguiente
          ? <span>Te faltan {formatMoney(r.falta)} para {r.siguiente.nombre}</span>
          : <span>Nivel máximo</span>}
        <div className="pt-vip-barra"><span style={{ width: `${r.pct}%` }} /></div>
      </div>
    </button>
  );
}

export function VipDetalle({ vip, onCerrar }: { vip: VipData; onCerrar: () => void }) {
  const r = resolver(vip);
  if (!r) return null;

  return (
    <div className="pt-modal-fondo" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="pt-vip-hoja">
        <div className="pt-sheet-head">
          <h3>Tu nivel VIP</h3>
          <button className="pt-cerrar" onClick={onCerrar}>×</button>
        </div>

        <p className="hint" style={{ marginTop: 0 }}>
          Cargaste {formatMoney(vip.cargado)} en total. El nivel se calcula solo y nunca baja.
        </p>

        <div className="pt-vip-escalera">
          {r.ordenados.map((n) => {
            const tiene = n.orden < r.actual.orden;
            const esActual = n.id === r.actual.id;
            const faltaN = Math.max(0, n.umbral - vip.cargado);
            return (
              <div key={n.id} className={`pt-vip-fila ${esActual ? 'actual' : ''}`} style={{ ['--gc' as string]: n.color }}>
                <div className="pt-vip-fila-gema"><GemaNivel nivel={n} /></div>
                <div className="pt-vip-fila-txt">
                  <strong>{n.nombre}</strong>
                  <small>
                    {n.umbral > 0 ? `Desde ${formatMoney(n.umbral)}` : 'Nivel base'}
                    {' · '}Cashback {n.cashbackPct}%
                    {n.giroMult > 1 ? ` · Giro ×${n.giroMult}` : ''}
                    {n.bonoCumple > 0 ? ` · Cumple ${formatMoney(n.bonoCumple)}` : ''}
                    {n.bonoMensual > 0 ? ` · Mensual ${formatMoney(n.bonoMensual)}` : ''}
                    {Number(n.retiroEsperaHoras) > 0
                      ? ` · Retiro cada ${n.retiroEsperaHoras} h`
                      : n.retiroEsperaHoras === 0
                        ? ' · Retiro sin espera'
                        : ''}
                  </small>
                </div>
                <span className="pt-vip-fila-estado">
                  {esActual ? 'Actual' : tiene ? '✓' : faltaN > 0 ? `faltan ${formatMoney(faltaN)}` : '🔒'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
