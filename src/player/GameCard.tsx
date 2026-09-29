import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { Juego } from '../lib/types.js';
import { urlPortada } from '../lib/imgUrl.js';
import { ICONOS } from './iconos.js';
import { CartelBadge } from './CartelBadge.tsx';

interface GameCardProps {
  juego: Juego;
  favorito: boolean;
  onAbrir: (juego: Juego) => void;
  onAlternarFavorito: (slug: string) => void;
  prioridad?: boolean;
}

const MENOS_MOVIMIENTO = typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let videoActivo: HTMLVideoElement | null = null;

export function GameCard({ juego, favorito, onAbrir, onAlternarFavorito, prioridad = false }: GameCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const enVivoRef = useRef(false);
  // En el teléfono el primer toque es el adelanto (como el hover).
  // 'pendiente' = se acaba de arrancar; el click de ese toque no abre.
  const adelantoRef = useRef<'no' | 'pendiente' | 'visto'>('no');
  const [pedido, setPedido] = useState(false);
  const [enVivo, setEnVivo] = useState(false);
  const [pintado, setPintado] = useState(false);
  const tieneVideo = Boolean(juego.video_url) && !MENOS_MOVIMIENTO;

  const parar = () => {
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.currentTime = 0;
      if (videoActivo === v) videoActivo = null;
    }
    enVivoRef.current = false;
    setEnVivo(false);
    setPintado(false);
  };

  const entrar = (e: PointerEvent<HTMLDivElement>) => {
    if (!tieneVideo) return;
    if (e.pointerType === 'touch' && adelantoRef.current === 'no') adelantoRef.current = 'pendiente';
    setPedido(true);
    enVivoRef.current = true;
    setEnVivo(true);
  };

  const salir = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    adelantoRef.current = 'no';
    parar();
  };

  const terminarClip = () => {
    const v = videoRef.current;
    if (v) {
      v.pause();
      if (videoActivo === v) videoActivo = null;
    }
    enVivoRef.current = false;
    setEnVivo(false);
    setPintado(false);
    if (adelantoRef.current === 'pendiente') adelantoRef.current = 'visto';
  };

  const abrir = () => {
    if (adelantoRef.current === 'pendiente' && enVivoRef.current) {
      adelantoRef.current = 'visto';
      return;
    }
    onAbrir(juego);
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!pedido || !enVivo || !v) return;
    if (videoActivo && videoActivo !== v) {
      videoActivo.pause();
      videoActivo.currentTime = 0;
      videoActivo.dispatchEvent(new Event('portada-silencio'));
    }
    videoActivo = v;
    v.muted = true;
    v.loop = false;
    v.currentTime = 0;
    const play = v.play();
    if (play) play.catch(() => terminarClip());
    const silencio = () => { adelantoRef.current = 'no'; parar(); };
    v.addEventListener('portada-silencio', silencio);
    return () => v.removeEventListener('portada-silencio', silencio);
  }, [pedido, enVivo]);

  return (
    <div
      className="pt-juego"
      role="button"
      tabIndex={0}
      onPointerEnter={entrar}
      onPointerLeave={salir}
      onClick={abrir}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onAbrir(juego);
        }
      }}
    >
      {juego.imagen_url ? (
        <img
          src={urlPortada(juego.imagen_url)}
          alt=""
          className="pt-juego-img"
          draggable={false}
          loading={prioridad ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={prioridad ? 'high' : undefined}
        />
      ) : (
        <span className="icono" dangerouslySetInnerHTML={{ __html: ICONOS.slot }} />
      )}

      {pedido && juego.video_url && (
        <video
          ref={videoRef}
          className={`pt-juego-video ${pintado ? 'is-on' : ''}`}
          src={juego.video_url}
          muted
          playsInline
          preload="auto"
          draggable={false}
          onPlaying={() => setPintado(true)}
          onEnded={terminarClip}
        />
      )}

      <CartelBadge cartel={juego.cartel} />

      {juego.proveedorIcono ? (
        <img
          className="pt-juego-prov"
          src={juego.proveedorIcono}
          alt=""
          title={juego.proveedorNombre || undefined}
          draggable={false}
        />
      ) : null}

      <button
        type="button"
        className={`pt-juego-fav ${favorito ? 'is-activo' : ''}`}
        aria-label={favorito ? 'Quitar de favoritos' : 'Agregar a favoritos'}
        onClick={(e) => {
          e.stopPropagation();
          onAlternarFavorito(juego.slug);
        }}
        dangerouslySetInnerHTML={{ __html: favorito ? ICONOS.estrellaLlena : ICONOS.estrella }}
      />

      {juego.nombre}
      <small>Jugar</small>
    </div>
  );
}
