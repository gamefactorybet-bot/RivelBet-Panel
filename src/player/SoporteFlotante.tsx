import { useEffect, useRef, useState } from 'react';
import { playerFetch } from './api.ts';
import { subirComprobante } from './cloudinary.js';
import { IconoAnimado } from './IconoAnimado.tsx';
import { ICONOS } from './iconos.js';

const MOTIVOS: [string, string][] = [
  ['recarga', 'Recarga'],
  ['retiro', 'Retiro'],
  ['cuenta', 'Mi cuenta'],
  ['otro', 'Otro'],
];

const ESTADOS: Record<string, string> = {
  abierto: 'Esperando respuesta',
  en_curso: 'Te están atendiendo',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
};

interface Mensaje {
  id: string;
  autor_tipo: 'jugador' | 'staff' | 'sistema';
  autor: string;
  texto: string | null;
  adjunto_url: string | null;
  created_at: string;
}

interface Ticket {
  id: string;
  estado: string;
  motivo: string;
  created_at: string;
}

interface Adjunto {
  url: string;
  publicId: string;
}

interface Props {
  animacionUrl?: string | null;
  sinLeer: number;
  onCambio?: () => void;
}

export function SoporteFlotante({ animacionUrl, sinLeer, onCambio }: Props) {
  const [abierta, setAbierta] = useState(false);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [motivo, setMotivo] = useState('recarga');
  const [texto, setTexto] = useState('');
  const [adjunto, setAdjunto] = useState<Adjunto | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const cuerpoRef = useRef<HTMLDivElement>(null);
  const ultimoIdRef = useRef<string | null>(null);

  const refrescar = async (forzar = false) => {
    const res = await playerFetch<{ ticket: Ticket | null; mensajes: Mensaje[] }>('/api/player-social?recurso=soporte');
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const { ticket: t, mensajes: m } = res.data;
    const nuevoUltimo = m.length ? m[m.length - 1].id : null;
    if (!forzar && nuevoUltimo === ultimoIdRef.current) return;
    ultimoIdRef.current = nuevoUltimo;
    setTicket(t);
    setMensajes(m);
  };

  // Solo se consulta mientras la ventana está abierta — cerrada, el
  // aviso de "sin leer" ya lo trae la sesión general del jugador.
  useEffect(() => {
    if (!abierta) return;
    refrescar(true);

    const reloj = setInterval(() => {
      if (!document.hidden) refrescar();
    }, 6000);
    const alVisible = () => { if (!document.hidden) refrescar(); };
    document.addEventListener('visibilitychange', alVisible);

    return () => {
      clearInterval(reloj);
      document.removeEventListener('visibilitychange', alVisible);
    };
  }, [abierta]);

  useEffect(() => {
    if (cuerpoRef.current) cuerpoRef.current.scrollTop = cuerpoRef.current.scrollHeight;
  }, [mensajes, ticket]);

  const cerrar = () => {
    setAbierta(false);
    onCambio?.();
  };

  const onArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;

    setSubiendo(true);
    setError('');
    try {
      setAdjunto(await subirComprobante(archivo));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la imagen');
    }
    setSubiendo(false);
  };

  const enviar = async () => {
    const cuerpo = texto.trim();
    if (!cuerpo && !adjunto) return;

    const adjuntoEnviado = adjunto;
    setEnviando(true);
    setTexto('');
    setAdjunto(null);
    setError('');

    const res = await playerFetch('/api/player-social?recurso=soporte', {
      method: 'POST',
      body: { motivo, texto: cuerpo, adjuntoUrl: adjuntoEnviado?.url },
    });

    setEnviando(false);

    if (!res.ok) {
      setError(res.error);
      setTexto(cuerpo);
      setAdjunto(adjuntoEnviado);
      return;
    }

    await refrescar(true);
  };

  return (
    <>
      <button
        type="button"
        className={`chat-globo${abierta ? ' oculto' : ''}`}
        onClick={() => setAbierta(true)}
        aria-label="Abrir soporte"
      >
        <span className="anillo" aria-hidden="true" />
        <span className="anillo d2" aria-hidden="true" />
        <IconoSoporteFijo url={animacionUrl} />
        {sinLeer > 0 && <span className="chat-badge">{sinLeer > 9 ? '9+' : sinLeer}</span>}
      </button>

      <div className={`chat-ventana${abierta ? ' abierta' : ''}`}>
        <div className="chat-head">
          <span className="chat-head-icono"><IconoSoporteFijo url={animacionUrl} chico /></span>
          <div className="chat-head-txt">
            <strong>Soporte</strong>
            <span>
              {ticket ? (
                <><i className="punto-en-linea" />{ESTADOS[ticket.estado] || ticket.estado}</>
              ) : 'Contanos qué pasó'}
            </span>
          </div>
          <button type="button" className="chat-min" onClick={cerrar} aria-label="Minimizar">‹</button>
        </div>

        <div className="chat-cuerpo" ref={cuerpoRef}>
          {!ticket && (
            <div className="motivos-intro">
              <p>¿Sobre qué es tu consulta?</p>
              <div className="motivos">
                {MOTIVOS.map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    className={`motivo-chip${k === motivo ? ' sel' : ''}`}
                    onClick={() => setMotivo(k)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}

          {agruparPorDia(mensajes).map((item, i) =>
            item.tipo === 'dia'
              ? <div className="chat-dia" key={`d${i}`}>{item.etiqueta}</div>
              : <Burbuja key={item.m.id} m={item.m} />
          )}

          {ticket?.estado === 'cerrado' && (
            <p className="chat-cerrado-aviso">Esta conversación está cerrada. Escribí abajo para abrir una nueva.</p>
          )}
        </div>

        {adjunto && (
          <div className="chat-adjunto">
            <img src={adjunto.url} alt="" draggable={false} />
            <span>Imagen lista para enviar</span>
            <button type="button" onClick={() => setAdjunto(null)}>Quitar</button>
          </div>
        )}
        {subiendo && <p className="chat-subiendo">Subiendo imagen...</p>}
        {error && <p className="chat-error">{error}</p>}

        <div className="chat-in">
          <label className="chat-clip">
            <input type="file" accept="image/*" hidden onChange={onArchivo} />
            <span dangerouslySetInnerHTML={{ __html: ICONOS.adjuntar }} />
          </label>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); enviar(); } }}
            placeholder={ticket ? 'Escribí tu mensaje' : 'Contanos qué pasó'}
            autoComplete="off"
          />
          <button type="button" className="chat-enviar" onClick={enviar} disabled={enviando} aria-label="Enviar">
            <span dangerouslySetInnerHTML={{ __html: ICONOS.enviar }} />
          </button>
        </div>
      </div>
    </>
  );
}

function Burbuja({ m }: { m: Mensaje }) {
  if (m.autor_tipo === 'sistema') {
    return <div className="msg sistema">{m.texto}</div>;
  }

  const mio = m.autor_tipo === 'jugador';
  return (
    <div className={`msg ${mio ? 'yo' : 'ellos'}${m.adjunto_url ? ' con-img' : ''}`}>
      {m.adjunto_url && (
        <a href={m.adjunto_url} target="_blank" rel="noopener noreferrer">
          <img src={m.adjunto_url} alt="" draggable={false} />
        </a>
      )}
      {m.texto}
      <small>{mio ? '' : `${m.autor} · `}{hora(m.created_at)}</small>
    </div>
  );
}

type ItemLista = { tipo: 'dia'; etiqueta: string } | { tipo: 'msg'; m: Mensaje };

// Un separador de día cada vez que cambia la fecha del mensaje —
// mismo criterio visual que cualquier chat conocido.
function agruparPorDia(mensajes: Mensaje[]): ItemLista[] {
  const items: ItemLista[] = [];
  let diaAnterior = '';

  mensajes.forEach((m) => {
    const dia = etiquetaDia(m.created_at);
    if (dia !== diaAnterior) {
      items.push({ tipo: 'dia', etiqueta: dia });
      diaAnterior = dia;
    }
    items.push({ tipo: 'msg', m });
  });

  return items;
}

function etiquetaDia(iso: string): string {
  const fecha = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);

  const mismoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (mismoDia(fecha, hoy)) return 'Hoy';
  if (mismoDia(fecha, ayer)) return 'Ayer';
  return fecha.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit' });
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
}

/** Ícono del globo/cabecera: la animación de la biblioteca si hay una
 * elegida en Personalización, o el ícono fijo de toda la vida. */
function IconoSoporteFijo({ url, chico }: { url?: string | null; chico?: boolean }) {
  return (
    <IconoAnimado
      url={url}
      className={`icono-soporte-anim${chico ? ' chico' : ''}`}
      fallback={
        <span
          className={`icono-soporte-fijo${chico ? ' chico' : ''}`}
          dangerouslySetInnerHTML={{ __html: ICONOS.soporte }}
        />
      }
    />
  );
}
