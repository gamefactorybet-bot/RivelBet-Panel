import { useEffect, useRef, type ReactNode } from 'react';
import { crearInstancia, destruirInstancia } from './lottieCache.ts';
import type { AnimationItem } from 'lottie-web';

const REDUCIR_MOVIMIENTO = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

interface Props {
  url?: string | null;
  className?: string;
  /** Qué mostrar cuando no hay animación elegida (o el usuario prefiere menos movimiento). */
  fallback?: ReactNode;
}

/** Ícono animado a partir de una animación de la biblioteca (misma
 * estrategia de caché que los carteles de las tarjetas de juego). Sin
 * `url`, o con "reducir movimiento" activado, se muestra `fallback`. */
export function IconoAnimado({ url, className, fallback = null }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!url || REDUCIR_MOVIMIENTO || !ref.current) return;

    let instancia: AnimationItem | null = null;
    let cancelado = false;

    crearInstancia(ref.current, url).then((i) => {
      if (cancelado) destruirInstancia(i);
      else instancia = i;
    });

    return () => {
      cancelado = true;
      if (instancia) destruirInstancia(instancia);
    };
  }, [url]);

  if (!url || REDUCIR_MOVIMIENTO) return <>{fallback}</>;
  return <div className={className} ref={ref} />;
}
