import { useEffect, useRef, useState } from 'react';
import { crearInstancia, destruirInstancia } from './lottieCache.ts';
import type { Cartel } from '../lib/types.js';
import type { AnimationItem } from 'lottie-web';

const ICONO_VIP =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.8z"/></svg>';
const ICONO_HOT =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1 3-2 4-2 7a3 3 0 1 0 6 0c1 1 1.5 2.3 1.5 3.5A5.5 5.5 0 1 1 6 12.5C6 8 10 7 12 2z"/></svg>';

/** Cartel animado a partir de una animación de la biblioteca. Solo se
 * instancia mientras la tarjeta está visible. */
function CartelLottie({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observador = new IntersectionObserver(
      ([entrada]) => setVisible(entrada.isIntersecting),
      { rootMargin: '100px' }
    );
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !ref.current) return;

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
  }, [visible, url]);

  return <div className="pt-cartel pt-cartel-anim" ref={ref} />;
}

export function CartelBadge({ cartel }: { cartel: Cartel | null | undefined }) {
  if (!cartel) return null;

  if (cartel.tipo === 'vip') {
    return (
      <div className="pt-cartel pt-cartel-vip">
        <span dangerouslySetInnerHTML={{ __html: ICONO_VIP }} />
        VIP
      </div>
    );
  }

  if (cartel.tipo === 'hot') {
    return (
      <div className="pt-cartel pt-cartel-hot" dangerouslySetInnerHTML={{ __html: ICONO_HOT }} />
    );
  }

  if (cartel.tipo === 'nuevo') {
    return <div className="pt-cartel pt-cartel-nuevo">NUEVO</div>;
  }

  if (cartel.tipo === 'personalizado') {
    return <CartelLottie url={cartel.animacionUrl} />;
  }

  return null;
}
