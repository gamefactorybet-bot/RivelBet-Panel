import { formatMoney } from '../lib/currency.ts';
import type { AvisoJugador } from '../lib/types.js';

export function AvisoAcreditacion({
  aviso, onCerrar,
}: { aviso: AvisoJugador; onCerrar: () => void }) {
  const p = aviso.payload || {};

  if (aviso.tipo === 'referido') {
    const quien = p.de ? `${p.de}${p.numero ? ` (#${p.numero})` : ''}` : 'un invitado';
    const esReferidor = p.rol !== 'referido';
    return (
      <div className="pt-modal-fondo" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
        <div className="pt-aviso-hoja">
          <p className="pt-aviso-kicker">{esReferidor ? 'Bono de recomendación' : 'Bono de bienvenida'}</p>
          <p className="pt-aviso-de">
            {esReferidor
              ? <>Acreditado por la primera carga de <b>{quien}</b></>
              : <>De parte de <b>{quien}</b></>}
          </p>
          <strong className="pt-aviso-total">+ {formatMoney(p.monto)}</strong>
          <button className="pt-enviar" onClick={onCerrar}>Listo</button>
        </div>
      </div>
    );
  }

  const carga = Number(p.carga || 0);
  const bono = Number(p.bono || 0);
  const total = Number(p.total || carga + bono);

  return (
    <div className="pt-modal-fondo" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="pt-aviso-hoja">
        <p className="pt-aviso-kicker">Carga acreditada</p>
        {bono > 0 ? (
          <ul className="pt-aviso-desglose">
            <li><span>Carga</span><b>{formatMoney(carga)}</b></li>
            <li><span>Bono</span><b>+ {formatMoney(bono)}</b></li>
          </ul>
        ) : null}
        <p className="pt-aviso-lbl">Total acreditado</p>
        <strong className="pt-aviso-total">{formatMoney(total)}</strong>
        <button className="pt-enviar" onClick={onCerrar}>Listo</button>
      </div>
    </div>
  );
}
