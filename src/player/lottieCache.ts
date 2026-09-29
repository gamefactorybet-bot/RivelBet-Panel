// Estrategia de carga de los carteles animados (Lottie):
//
// - El archivo .json de cada animación se pide UNA sola vez por URL,
//   la primera vez que un juego que la usa entra en pantalla — no al
//   abrir el portal. Si hay 300 juegos pero 10 animaciones distintas,
//   nunca se piden más de 10 archivos, sin importar cuántos juegos
//   los reusen.
// - Cada tarjeta visible crea su propia instancia liviana a partir de
//   ese JSON ya cacheado (loadAnimation no vuelve a pedir ni a
//   parsear nada), y la destruye apenas sale de pantalla. Volver a
//   entrar la vuelve a crear al instante, porque el JSON ya está en
//   memoria.
// - lottie-web en sí (~150kb) también se carga una sola vez, y solo
//   si algún juego realmente tiene un cartel personalizado.
import type { AnimationItem } from 'lottie-web';

let lottiePromise: Promise<typeof import('lottie-web')> | null = null;

function cargarLottie() {
  if (!lottiePromise) lottiePromise = import('lottie-web');
  return lottiePromise;
}

const cacheDatos = new Map<string, Promise<object>>();

function obtenerDatos(url: string): Promise<object> {
  let promesa = cacheDatos.get(url);
  if (!promesa) {
    promesa = fetch(url).then((r) => r.json());
    cacheDatos.set(url, promesa);
  }
  return promesa;
}

const instanciasVivas = new Set<AnimationItem>();
let visibilidadArmada = false;

function armarPausaPorPestana() {
  if (visibilidadArmada || typeof document === 'undefined') return;
  visibilidadArmada = true;

  document.addEventListener('visibilitychange', () => {
    instanciasVivas.forEach((i) => {
      if (document.hidden) i.pause();
      else i.play();
    });
  });
}

/** Crea una instancia de la animación en `container`, a partir del JSON ya cacheado. */
export async function crearInstancia(container: HTMLElement, url: string): Promise<AnimationItem> {
  armarPausaPorPestana();

  const [{ default: lottie }, animationData] = await Promise.all([cargarLottie(), obtenerDatos(url)]);

  const instancia = lottie.loadAnimation({
    container,
    renderer: 'svg',
    loop: true,
    autoplay: !document.hidden,
    animationData,
  });

  instanciasVivas.add(instancia);
  return instancia;
}

export function destruirInstancia(instancia: AnimationItem): void {
  instanciasVivas.delete(instancia);
  instancia.destroy();
}
