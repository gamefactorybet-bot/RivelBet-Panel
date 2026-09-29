// Estilos del portal, en un módulo para no mezclarlos con los del panel.
export const ESTILOS_PORTAL = `
<style>
  .pt-app {
    position: relative; isolation: isolate; z-index: 0; min-height: 100vh; padding-bottom: 72px;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  .pt-app ::selection { background: transparent; color: inherit; }
  /* Dejar presionado en celular abre el menú nativo (nombre del archivo,
     guardar imagen, seleccionar texto). En el lobby no aporta nada. */
  .pt-app input, .pt-app textarea {
    -webkit-user-select: text;
    user-select: text;
    -webkit-touch-callout: default;
  }
  .pt-app img, .pt-app video {
    -webkit-user-drag: none;
    -webkit-touch-callout: none;
    pointer-events: none;
  }

  /* Controles de navegación, filtros y utilidades son secundarios: el
     volumen queda reservado a las acciones que mueven saldo o inician juego. */
  .pt-imp-banner button, .pt-chip-vip, .pt-chip-giro, .pt-chip-bono, .pt-logo,
  .pt-juego-fav, .pt-punto, .pt-nav button, .pt-nav-desktop button, .pt-cerrar,
  .pt-icon-btn, .pt-cuenta-tab, .pt-subtab, .pt-rapido, .pt-copy, .pt-fila-accion,
  .pt-prov-chip {
    box-shadow: none;
  }
  .pt-imp-banner button:hover, .pt-chip-vip:hover, .pt-chip-giro:hover, .pt-chip-bono:hover,
  .pt-logo:hover, .pt-juego-fav:hover, .pt-punto:hover, .pt-nav button:hover,
  .pt-nav-desktop button:hover, .pt-cerrar:hover, .pt-icon-btn:hover, .pt-cuenta-tab:hover,
  .pt-subtab:hover, .pt-rapido:hover, .pt-copy:hover, .pt-fila-accion:hover,
  .pt-prov-chip:hover { filter: none; }
  .pt-imp-banner button:active, .pt-chip-vip:active, .pt-chip-giro:active, .pt-chip-bono:active,
  .pt-logo:active, .pt-juego-fav:active, .pt-punto:active, .pt-nav button:active,
  .pt-nav-desktop button:active, .pt-cerrar:active, .pt-icon-btn:active, .pt-cuenta-tab:active,
  .pt-subtab:active, .pt-rapido:active, .pt-copy:active, .pt-fila-accion:active,
  .pt-prov-chip:active { transform: none; box-shadow: none; }

  /* Fondo del portal (donde están los juegos), configurable aparte del
     fondo del login y del panel — mismo criterio que .dashboard::before
     del lado del staff: imagen fija detrás, velo del color del tema
     encima para que el texto siga siendo legible. */
  .pt-app::before, .pt-app::after {
    content: '';
    position: fixed;
    top: 0; left: 0;
    width: 100vw;
    height: 100vh;
    height: 100lvh;
    pointer-events: none;
    background-repeat: no-repeat;
    background-attachment: scroll;
  }
  .pt-app::before {
    background-image: var(--bg-juegos-image, none);
    background-size: cover; background-position: center;
    z-index: -2;
  }
  html[data-portal-bg="solid"] .pt-app::before { background-image: none; }
  .pt-app::after {
    background:
      radial-gradient(ellipse 70% 36% at 50% -8%, color-mix(in srgb, var(--halo) 18%, transparent), transparent 70%),
      linear-gradient(180deg, var(--veil-top) 0%, var(--void) 42%, var(--void) 100%);
    opacity: var(--bg-juegos-veil, 1);
    z-index: -1;
  }
  html[data-portal-bg="solid"] .pt-app::after { opacity: 1; }

  /* Aviso fijo cuando un cajero entró como este jugador desde el panel.
     Sticky y por encima del header: no debe poder perderse de vista. */
  .pt-imp-banner {
    position: sticky; top: 0; z-index: 30; height: 34px;
    display: flex; align-items: center; justify-content: center; gap: 10px;
    background: var(--accent); color: var(--accent-text);
    font-size: 12px; font-weight: 600; padding: 0 12px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .pt-imp-banner button {
    background: rgba(0,0,0,0.2); color: inherit; border: none;
    border-radius: 999px; padding: 3px 10px; font-size: 11px; font-weight: 600;
    flex-shrink: 0;
  }

  /* Barra superior */
  /* El header arranca transparente para que el banner se vea pasar
     por detrás. Al scrollear toma fondo, si no el saldo se pierde
     sobre la imagen. */
  .pt-header {
    position: sticky; top: 0; z-index: 20;
    display: flex; flex-direction: column; gap: 8px;
    padding: 10px 14px;
    background: transparent;
    border-bottom: 1px solid transparent;
    transition: background 0.2s ease, border-color 0.2s ease;
  }
  .pt-header-top { display: flex; align-items: center; gap: 10px; }
  .pt-header.con-fondo,
  .pt-header:has(.pt-header-fila) {
    background: var(--surface-glass);
    backdrop-filter: var(--surface-blur);
    -webkit-backdrop-filter: var(--surface-blur);
    border-bottom-color: var(--border-glass);
  }

  /* Fila propia: nivel VIP + giro diario, cada uno su apartado */
  .pt-header-fila { display: flex; gap: 8px; }
  .pt-chip-vip, .pt-chip-giro {
    display: flex; align-items: center; gap: 7px; height: 34px;
    border-radius: 11px; border: 1px solid var(--border);
    background: var(--surface-alt-glass);
    color: var(--text); font-family: inherit; cursor: pointer;
  }
  .pt-chip-vip {
    flex: 1; min-width: 0; padding: 0 11px 0 8px; overflow: hidden;
    background: #000;
    border-color: color-mix(in srgb, var(--gc, var(--accent)) 55%, var(--border));
  }
  .pt-chip-gema { width: 20px; height: 20px; flex-shrink: 0; }
  .pt-chip-vip .vip-gema-css { width: 14px; height: 14px; }
  .pt-chip-vip .vip-gema-img { width: 20px; height: 20px; }
  .pt-chip-vip .vip-gema-anim { width: 22px; height: 22px; }
  .pt-chip-vip-nom {
    font-size: 12.5px; font-weight: 700; color: var(--gc, var(--accent));
    letter-spacing: 0.02em; white-space: nowrap;
  }
  .pt-chip-vip-prog {
    margin-left: auto; font-size: 10.5px; color: var(--text-dim);
    white-space: nowrap; font-variant-numeric: tabular-nums;
  }
  .pt-chip-giro {
    flex-shrink: 0; padding: 0 11px 0 8px; position: relative;
    background: #000;
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  }
  .pt-chip-giro-anim {
    width: 22px; height: 22px; flex-shrink: 0; overflow: hidden;
  }
  .pt-chip-giro-anim svg, .pt-chip-giro-anim canvas { width: 100%; height: 100%; display: block; }
  .pt-chip-rueda {
    width: 19px; height: 19px; flex-shrink: 0; border-radius: 50%;
    border: 2px solid var(--surface);
    background: conic-gradient(from 0deg,
      var(--accent) 0 60deg, var(--warning) 60deg 120deg, var(--success) 120deg 180deg,
      var(--secondary) 180deg 240deg, var(--accent-glow) 240deg 300deg, var(--accent-deep) 300deg 360deg);
  }
  .pt-chip-giro.activo .pt-chip-rueda { animation: pt-giro-lento 5s linear infinite; }
  .pt-chip-giro.activo::after {
    content: ''; position: absolute; top: -3px; right: -3px;
    width: 9px; height: 9px; border-radius: 50%;
    background: var(--success); border: 2px solid var(--surface);
  }
  .pt-chip-giro.usado { background: #000; border-color: var(--border); }
  .pt-chip-giro.usado .pt-chip-rueda,
  .pt-chip-giro.usado .pt-chip-giro-anim { filter: grayscale(0.75); opacity: 0.5; }
  .pt-chip-giro-lbl {
    font-size: 10px; font-weight: 800; letter-spacing: 0.06em;
    color: var(--accent); white-space: nowrap;
  }
  .pt-chip-giro.usado .pt-chip-giro-lbl { color: var(--text-faint); letter-spacing: 0; font-weight: 600; font-size: 11px; }
  @keyframes pt-giro-lento { to { transform: rotate(360deg); } }

  /* Chip de bono pegajoso activo (modo avanzado de billetera) */
  .pt-chip-bono {
    display: flex; align-items: center; height: 34px; flex-shrink: 0;
    padding: 0 12px; border-radius: 11px; cursor: pointer; font-family: inherit;
    border: 1px solid color-mix(in srgb, var(--warning) 55%, var(--border));
    background: color-mix(in srgb, var(--warning) 14%, var(--surface-alt));
    color: var(--text);
  }
  .pt-chip-bono-lbl {
    font-size: 11px; font-weight: 800; letter-spacing: 0.03em;
    color: var(--warning); white-space: nowrap;
  }
  @media (prefers-reduced-motion: reduce) { .pt-chip-giro.activo .pt-chip-rueda { animation: none; } }
  .pt-logo {
    position: relative;
    display: flex; align-items: center; gap: 8px;
    background: transparent; border: none; padding: 4px 6px;
    border-radius: 8px;
    font-size: 17px; font-weight: 600; color: var(--platinum);
    letter-spacing: 0.01em; cursor: pointer;
    min-width: 0; flex-shrink: 1;
  }
  .pt-logo:hover { background: var(--surface-alt-glass); }
  .pt-logo-icon { max-height: 32px; width: auto; display: block; flex-shrink: 0; }
  .pt-logo-nombre {
    max-height: 26px; max-width: min(168px, 42vw);
    width: auto; height: auto; object-fit: contain;
    display: block; pointer-events: none;
  }

  /* Punto de aviso: hay una carga o retiro en curso */
  .pt-logo.con-aviso::after,
  .pt-nav button.con-aviso::after {
    content: ''; position: absolute;
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--accent);
    top: 2px; right: 0;
  }
  .pt-nav button { position: relative; }
  .pt-nav button.con-aviso::after { top: 6px; right: 50%; margin-right: -16px; }
  .pt-header-der { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .pt-saldo-chip {
    display: flex; align-items: center; gap: 8px;
    background: #000;
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 5px 6px 5px 13px;
    font-size: 14px; font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .pt-recargar {
    background: var(--primary-button-face); color: var(--accent-text);
    border: none; border-radius: var(--btn-radius, 18px);
    padding: 0 var(--btn-pad-x, 14px); font-size: 13px; font-weight: 600;
  }
  .pt-ficha-anim { width: 20px; height: 20px; flex-shrink: 0; }
  .pt-saldo-chip[data-ficha="grande"] {
    padding-left: 3px;
  }
  .pt-saldo-chip[data-ficha="grande"] .pt-ficha-anim {
    width: 30px; height: 30px;
  }
  .pt-avatar {
    width: 32px; height: 32px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid var(--border); color: var(--text-dim);
    background: transparent; font-size: 14px;
  }

  /* Banner */
  .pt-banner {
    margin: 0 0 6px; overflow: hidden;
    background:
      radial-gradient(circle at 88% 12%, color-mix(in srgb, var(--halo) 14%, transparent), transparent 42%),
      radial-gradient(circle at 16% 100%, color-mix(in srgb, var(--accent-deep) 7%, transparent), transparent 48%),
      repeating-linear-gradient(132deg, transparent 0 13px, color-mix(in srgb, var(--secondary) 4%, transparent) 13px 14px),
      linear-gradient(145deg, var(--banner-from) 0%, var(--void) 76%);
    border: 1px solid var(--line);
    padding: 30px 28px 34px;
    position: relative;
  }
  .pt-banner h2 { margin: 0; max-width: 620px; font-family: var(--font-display), Georgia, serif; font-size: clamp(30px, 5vw, 56px); font-weight: 480; line-height: 1.04; letter-spacing: -.035em; }
  .pt-banner h2 em { font-style: normal; color: var(--platinum); font-weight: 430; }
  .pt-banner p { margin: 8px 0 0; font-size: 13px; color: var(--text-dim); }

  .pt-carrusel {
    position: relative;
    margin: 0 0 6px;
    z-index: 1;
  }
  .pt-pista {
    display: flex;
    transition: transform 0.35s ease;
  }
  .pt-slide { flex: 0 0 100%; position: relative; min-width: 100%; }
  .pt-slide[data-link] { cursor: pointer; }

  /* contain por defecto: un PNG transparente recortado pierde
     justamente el efecto que lo hace ver en relieve. 2:1 es el
     formato por defecto (calza mejor con el ancho real de los
     banners que el 16:7 viejo, que dejaba aire a los costados) —
     cada banner puede elegir el formato viejo igual si lo prefiere.
     Y cada banner puede pedir "cover" en vez de "contain" (llena el
     cuadro, pero puede recortar) para el que prefiera cero aire. */
  .pt-slide img {
    width: 100%;
    display: block;
    aspect-ratio: 2/1;
    object-fit: contain;
    object-position: center;
  }
  .pt-slide-formato-16-7 img { aspect-ratio: 16/7; }
  .pt-slide-cover img { object-fit: cover; }
  .pt-slide-video {
    position: absolute; inset: 0; z-index: 0;
    width: 100%; height: 100%;
    object-fit: contain; object-position: center;
    opacity: 0; pointer-events: none;
    transition: opacity .25s ease;
  }
  .pt-slide-cover .pt-slide-video { object-fit: cover; }
  .pt-slide-video.is-on { opacity: 1; }
  .pt-slide-txt {
    position: absolute; left: 0; right: 0; bottom: 0;
    padding: 16px 18px;
    background: linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0));
  }
  .pt-slide-txt h2 { margin: 0; font-size: 19px; font-weight: 600; color: #fff; line-height: 1.25; }
  .pt-slide-txt p { margin: 4px 0 0; font-size: 13px; color: rgba(255,255,255,0.8); }

  .pt-puntos { display: flex; justify-content: center; gap: 6px; margin-top: 2px; }
  .pt-punto {
    width: 6px; height: 6px; border-radius: 999px; padding: 0;
    background: var(--border); border: none;
  }
  .pt-punto.is-active { background: var(--accent); width: 18px; }

  /* Secciones */
  .pt-seccion { margin: 14px 16px; position: relative; isolation: isolate; }
  .pt-seccion:not(.pt-seccion-fija) {
    content-visibility: auto;
    contain-intrinsic-size: auto 480px;
  }
  /* Halo ambiental detrás del catálogo: dibuja profundidad sin teñir
     las portadas ni convertir los bordes en luces de neón. */
  .pt-seccion::before {
    content: ''; position: absolute; z-index: -1; pointer-events: none;
    inset: 26px -12px -28px;
    background:
      radial-gradient(ellipse at 50% 58%, color-mix(in srgb, var(--halo) 10%, transparent), transparent 60%),
      radial-gradient(ellipse at 50% 76%, color-mix(in srgb, var(--accent-deep) 6%, transparent), transparent 68%);
    filter: blur(24px); opacity: .48;
  }
  .pt-seccion-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; }
  .pt-seccion-head h3 { margin: 0; font-size: 16px; font-weight: 600; }
  .pt-seccion-head span { font-size: 12px; color: var(--text-dim); }

  /* En celular siempre 3 portadas enteras. Antes cada carta medía
     108px fijo: en un teléfono de 360px entraban 2 y un recorte del
     tercero, y parecía roto. Ahora las 3 se reparten el ancho. */
  .pt-juegos {
    --pt-cols: 3;
    --pt-gap: 14px;
    /* En celular la carta es más chica: 12px se ve más redondo que en PC.
       ~2/3 mantiene la misma curva visual. */
    --pt-card-r: max(0px, calc(var(--card-radius, 12px) * 0.67));
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 22px var(--pt-gap);
    padding-top: 20px;
    position: relative;
  }
  .pt-juego {
    aspect-ratio: 3/4; border-radius: var(--pt-card-r, 8px);
    border: 1px solid var(--border-glass);
    background: var(--surface-raised);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 6px; padding: 10px; text-align: center; color: var(--text);
    font-size: 12px; font-weight: 500;
    min-width: 0;
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
    outline: none;
  }
  .pt-juego:focus-visible { outline: 2px solid color-mix(in srgb, var(--accent) 70%, transparent); outline-offset: 3px; }
  .pt-juego { cursor: pointer; overflow: visible; position: relative; z-index: 1; box-shadow: 0 16px 30px rgba(0,0,0, var(--card-shadow-alpha, .62)), 0 34px 58px rgba(0,0,0, calc(var(--card-shadow-alpha, .62) * .52)); transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
  @media (hover: hover) {
    .pt-juego:hover { border-color: color-mix(in srgb, var(--accent-glow) 26%, var(--line)); transform: translateY(-5px); box-shadow: 0 23px 37px rgba(0,0,0, calc(var(--card-shadow-alpha, .62) * 1.2)), 0 40px 64px rgba(0,0,0, calc(var(--card-shadow-alpha, .62) * .6)), 0 0 18px color-mix(in srgb, var(--accent-deep) var(--hover-glow-mix, 12%), transparent); }
  }
  .pt-juego-img {
    position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: cover; border-radius: var(--pt-card-r, 8px);
  }
  .pt-juego-video {
    position: absolute; inset: 0; z-index: 0;
    width: 100%; height: 100%;
    object-fit: cover; border-radius: var(--pt-card-r, 8px);
    opacity: 0; pointer-events: none;
    transition: opacity .18s ease;
  }
  .pt-juego-video.is-on { opacity: 1; }
  .pt-juego .icono { width: 30px; height: 30px; color: var(--accent); }
  .pt-juego .icono svg { width: 100%; height: 100%; display: block; }
  .pt-juego small { color: var(--text-dim); font-weight: 400; font-size: 11px; }

  .pt-juego-prov {
    position: absolute; right: 5px; bottom: 5px; z-index: 1;
    width: 22px; height: 22px; object-fit: cover;
    border-radius: 6px; background: #000;
    border: 1px solid rgba(255,255,255,0.22);
    box-shadow: 0 2px 8px rgba(0,0,0,0.55);
    pointer-events: none;
  }
  @media (min-width: 860px) {
    .pt-juego-prov { width: 26px; height: 26px; border-radius: 7px; right: 6px; bottom: 6px; }
  }
  .pt-juego-fav {
    position: absolute; top: 6px; right: 6px; z-index: 1;
    width: 26px; height: 26px; padding: 0; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.38); border: none; color: #fff;
  }
  .pt-juego-fav svg { width: 15px; height: 15px; display: block; }
  .pt-juego-fav.is-activo { color: var(--accent); }

  /* Carteles: VIP / Hot / Nuevo / animación de la biblioteca.
     Grandes y saliendo del borde superior izquierdo, como una ficha
     apoyada encima de la tarjeta — no un chip prolijo pegado adentro.
     La tarjeta tiene overflow:visible (arriba) justo para esto. */
  .pt-cartel {
    position: absolute; z-index: 2;
    top: -14px; left: -12px;
    filter: drop-shadow(0 6px 10px rgba(0,0,0,0.5));
    animation: pt-flotar-cartel 2.6s ease-in-out infinite;
    pointer-events: none;
  }
  @keyframes pt-flotar-cartel {
    0%, 100% { transform: translateY(0) rotate(var(--pt-rot, 0deg)); }
    50%      { transform: translateY(-4px) rotate(var(--pt-rot, 0deg)); }
  }

  .pt-cartel-vip {
    --pt-rot: -8deg;
    top: -15px; left: -13px; width: 50px; height: 50px;
    border-radius: 50%;
    background: radial-gradient(circle at 32% 28%, var(--cartel-vip-from) 0%, var(--platinum) 55%, var(--cartel-vip-to) 100%);
    box-shadow: inset 0 3px 6px rgba(255,255,255,0.55), inset 0 -6px 10px rgba(0,0,0,0.35);
    display: flex; align-items: center; justify-content: center;
  }
  .pt-cartel-vip svg { width: 24px; height: 24px; color: var(--accent-deep); }

  .pt-cartel-hot {
    --pt-rot: 6deg;
    top: -16px; left: -14px; width: 52px; height: 52px;
    border-radius: 46% 54% 54% 46% / 58% 58% 42% 42%;
    background: radial-gradient(circle at 32% 26%, var(--cartel-hot-from) 0%, var(--cartel-hot-mid) 45%, var(--cartel-hot-to) 85%);
    box-shadow: inset 0 3px 8px rgba(255,255,255,0.45), inset 0 -8px 12px rgba(0,0,0,0.35);
    display: flex; align-items: center; justify-content: center;
    animation: pt-flotar-cartel 2.1s ease-in-out infinite;
  }
  .pt-cartel-hot svg { width: 26px; height: 26px; color: #5c1400; }

  .pt-cartel-nuevo {
    --pt-rot: -10deg;
    top: -10px; left: -16px; width: 78px; height: 34px;
    border-radius: 9px;
    background: linear-gradient(160deg, var(--cartel-nuevo-from), var(--cartel-nuevo-to));
    box-shadow: inset 0 3px 6px rgba(255,255,255,0.5), inset 0 -6px 10px rgba(0,0,0,0.3);
    display: flex; align-items: center; justify-content: center;
    font-size: 11.5px; font-weight: 800; letter-spacing: 0.04em; color: #04222c;
  }

  .pt-cartel-anim {
    top: -14px; left: -12px; width: 48px; height: 48px;
  }
  .pt-cartel-anim svg, .pt-cartel-anim canvas {
    display: block; width: 100%; height: 100%;
  }

  @media (prefers-reduced-motion: reduce) {
    .pt-cartel { animation: none; }
  }

  /* Recientes / Favoritos: el ancho de cada carta es 1/3 del renglón,
     así se ven 3 enteras. Lo que sigue se desliza y calza de a 3. */
  .pt-seccion-fija .pt-juegos {
    grid-auto-flow: column;
    grid-template-columns: none;
    grid-auto-columns: calc((100% - (var(--pt-cols) - 1) * var(--pt-gap)) / var(--pt-cols));
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scroll-snap-type: x mandatory;
    padding: 20px 0 8px;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .pt-seccion-fija .pt-juegos::-webkit-scrollbar { display: none; }
  .pt-seccion-fija .pt-juego { scroll-snap-align: start; }

  /* Movimientos */
  .pt-mov { display: flex; align-items: center; gap: 10px; padding: 11px 0; border-bottom: 1px solid var(--border-glass); }
  .pt-mov:last-child { border-bottom: none; }
  .pt-mov-icono {
    width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 15px; border: 1px solid var(--border);
  }
  .pt-mov-icono.carga { color: var(--success); border-color: var(--success); }
  .pt-mov-icono.retiro { color: var(--accent); border-color: var(--accent); }
  .pt-mov-datos { flex: 1; min-width: 0; }
  .pt-mov-tipo { font-size: 14px; font-weight: 500; text-transform: capitalize; }
  .pt-mov-fecha { font-size: 12px; color: var(--text-dim); }
  .pt-mov-monto { font-variant-numeric: tabular-nums; font-weight: 500; text-align: right; font-size: 14px; }
  .pt-mov-monto small { display: block; font-weight: 400; font-size: 11px; color: var(--text-dim); }

  /* Barra inferior */
  .pt-nav {
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 30;
    display: flex;
    background: var(--surface-glass);
    backdrop-filter: var(--surface-blur);
    -webkit-backdrop-filter: var(--surface-blur);
    border-top: 1px solid var(--border-glass);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .pt-nav button {
    flex: 1; background: transparent; border: none; border-radius: 0;
    color: var(--text-dim); font-size: 10px; font-weight: 400;
    padding: 9px 4px; display: flex; flex-direction: column; align-items: center; gap: 3px;
  }
  .pt-nav button .icono { display: block; width: 21px; height: 21px; }
  .pt-nav button .icono svg { width: 100%; height: 100%; display: block; }
  .pt-nav button.is-active { color: var(--accent); }

  /* Menú de escritorio (adentro del header) y barra lateral de cuenta:
     ocultos en celular, los activa el media query de más abajo. */
  .pt-nav-desktop { display: none; }
  .pt-sidebar { display: none; }
  .pt-layout { display: block; }
  .pt-main { min-width: 0; }

  /* Hoja inferior (recargar / retirar) */
  .pt-sheet-fondo {
    position: fixed; inset: 0; z-index: 70;
    background: rgba(0,0,0,0.6);
    display: flex; align-items: flex-end; justify-content: center;
  }
  .pt-sheet {
    width: 100%; max-width: 480px;
    background: var(--surface);
    border-radius: 18px 18px 0 0;
    border-top: 1px solid var(--border);
    max-height: 88vh; overflow-y: auto;
    padding: 18px 16px calc(20px + env(safe-area-inset-bottom));
  }
  .pt-sheet-disp {
    background: var(--surface-alt); border: 1px solid var(--border-glass);
    border-radius: 12px; padding: 12px 14px; margin-bottom: 14px;
  }
  .pt-sheet-disp .pt-dato-label { margin-bottom: 2px; }
  .pt-sheet-disp strong {
    display: block; font-size: 22px; font-weight: 700;
    font-variant-numeric: tabular-nums; letter-spacing: -0.02em;
  }
  .pt-sheet-disp .hint { margin: 6px 0 0; }
  .pt-sheet-head { display: flex; align-items: center; margin-bottom: 14px; }
  .pt-sheet-head h3 { margin: 0; flex: 1; font-size: 17px; font-weight: 600; }
  .pt-cerrar { background: transparent; border: none; color: var(--text-dim); font-size: 22px; padding: 0 6px; border-radius: 999px; }

  /* Cuenta bancaria */
  .pt-cuenta-tabs { display: flex; gap: 6px; overflow-x: auto; margin-bottom: 14px; }
  .pt-cuenta-tab {
    background: var(--surface-alt); border: 1px solid var(--border);
    border-radius: 999px; padding: 7px 14px; font-size: 13px;
    color: var(--text-dim); font-weight: 400; white-space: nowrap;
  }
  .pt-cuenta-tab.is-active { border-color: var(--accent); color: var(--accent); font-weight: 500; }

  .pt-dato {
    display: flex; align-items: center; gap: 10px;
    padding: 11px 12px; margin-bottom: 8px;
    background: var(--surface-alt); border-radius: 10px;
  }
  .pt-dato-txt { flex: 1; min-width: 0; }
  .pt-dato-label { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-dim); }
  .pt-dato-valor { font-size: 15px; font-weight: 500; word-break: break-all; }
  .pt-copy {
    background: transparent; border: 1px solid var(--border);
    color: var(--accent); border-radius: 8px;
    padding: 7px 11px; font-size: 12px; font-weight: 500; flex-shrink: 0;
  }
  .pt-copy.copiado { border-color: var(--success); color: var(--success); }

  .pt-monto-input {
    width: 100%; background: var(--surface-alt);
    border: 1px solid var(--border); border-radius: 10px;
    color: var(--text); padding: 14px; font-size: 20px; font-weight: 500;
    text-align: center; font-variant-numeric: tabular-nums;
  }
  .pt-monto-input:focus { outline: none; border-color: var(--accent); }
  .pt-rapidos { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0 16px; }

  /* Método de cobro (retiro) */
  .pt-seccion-label {
    font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
    color: var(--text-dim); margin: 0 0 8px;
  }
  .pt-subtabs { display: flex; gap: 5px; margin-bottom: 12px; flex-wrap: wrap; }
  .pt-subtab {
    background: var(--surface-alt); border: 1px solid var(--border);
    border-radius: 999px; padding: 6px 12px; font-size: 12px;
    color: var(--text-dim); font-weight: 400;
  }
  .pt-subtab.is-active { border-color: var(--accent); color: var(--accent); font-weight: 500; }
  .pt-campo { display: block; margin-bottom: 12px; }
  .pt-campo span { display: block; font-size: 11.5px; color: var(--text-dim); margin-bottom: 5px; font-weight: 500; }
  .pt-campo input {
    width: 100%; background: var(--surface-alt); border: 1px solid var(--border);
    border-radius: 9px; color: var(--text); padding: 10px 12px; font-size: 14px; font-family: inherit;
  }
  .pt-campo input:focus { outline: none; border-color: var(--accent); }
  .pt-panel-metodo { margin-bottom: 6px; }
  .pt-rapido {
    flex: 1; min-width: 72px;
    background: var(--surface-alt); border: 1px solid var(--border);
    border-radius: 8px; padding: 9px 4px; font-size: 13px;
    color: var(--text-dim); font-weight: 400;
  }
  .pt-rapido:hover { border-color: var(--accent); color: var(--accent); }
  .pt-enviar { width: 100%; padding: 0 var(--btn-pad-x, 14px); font-size: 15px; font-weight: 600; }

  .pt-ofertas { margin: 0 0 14px; }
  .pt-ofertas-pista {
    display: flex; gap: 10px; overflow-x: auto;
    scroll-snap-type: x mandatory; scrollbar-width: none;
    margin: 0 -4px; padding: 2px 4px 8px;
  }
  .pt-ofertas-pista::-webkit-scrollbar { display: none; }
  .pt-oferta {
    flex: 0 0 min(100%, 320px); scroll-snap-align: start;
    position: relative; border-radius: 14px; overflow: hidden;
    aspect-ratio: 16/9; border: 2px solid transparent;
    background: var(--surface-alt); cursor: pointer;
  }
  .pt-oferta.is-on { border-color: var(--accent); }
  .pt-oferta.is-off { opacity: 0.55; cursor: default; }
  .pt-oferta img, .pt-oferta video, .pt-oferta-fondo {
    position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: cover; pointer-events: none;
  }
  .pt-oferta-fondo { background: linear-gradient(135deg, var(--accent-deep), var(--void)); }
  .pt-oferta-txt {
    position: absolute; left: 12px; right: 12px; top: 12px;
    color: #fff; text-shadow: 0 1px 8px rgba(0,0,0,.7);
  }
  .pt-oferta-txt strong { display: block; font-size: 15px; font-weight: 800; }
  .pt-oferta-txt span { font-size: 12px; opacity: .9; }
  .pt-oferta-cta {
    position: absolute; right: 10px; bottom: 10px;
    background: var(--accent); color: var(--accent-text);
    font-size: 12px; font-weight: 800; border-radius: 999px;
    padding: 7px 12px;
  }
  .pt-oferta.is-on .pt-oferta-cta { background: var(--success); color: #08240f; }
  .pt-bono-warn { border-color: var(--error); }

  .pt-bono {
    border: 1px solid var(--success);
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 16px;
  }
  .pt-bono-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 12px;
    background: var(--surface-alt);
  }
  .pt-bono-nombre { font-size: 13px; font-weight: 500; }
  .pt-bono-head strong { color: var(--success); font-size: 15px; font-variant-numeric: tabular-nums; }
  .pt-bono-total {
    display: flex; align-items: center; justify-content: space-between;
    padding: 9px 12px;
    font-size: 12px; color: var(--text-dim);
    border-top: 1px solid var(--border);
  }
  .pt-bono-total strong { font-size: 16px; color: var(--text); font-variant-numeric: tabular-nums; }

  .sp-estado-chip {
    background: var(--surface-alt); border-radius: 10px;
    padding: 9px 12px; margin-bottom: 12px;
  }
  .sp-estado-chip span { font-size: 13px; font-weight: 500; display: block; }
  .sp-estado-chip small { font-size: 11px; color: var(--text-dim); }

  .sp-chat-msgs {
    display: flex; flex-direction: column; gap: 8px;
    max-height: 45vh; overflow-y: auto; padding: 4px 0 12px;
  }
  .sp-chat-m { max-width: 80%; padding: 8px 11px; border-radius: 11px; font-size: 13px; line-height: 1.5; }
  .sp-chat-m.ellos { background: var(--surface-alt); align-self: flex-start; border-bottom-left-radius: 3px; }
  .sp-chat-m.yo { background: var(--accent); color: var(--accent-text); align-self: flex-end; border-bottom-right-radius: 3px; }
  .sp-chat-m.sistema {
    align-self: center; background: transparent; color: var(--text-dim);
    font-size: 11px; text-align: center; max-width: 100%;
  }
  .sp-chat-m small { display: block; font-size: 10px; opacity: 0.7; margin-top: 3px; }

  .pt-sp-in { display: flex; gap: 7px; align-items: center; }
  .sp-clip {
    width: 40px; height: 40px; flex-shrink: 0;
    border: 1px solid var(--border); border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    color: var(--text-dim); cursor: pointer;
  }
  .sp-clip:hover { border-color: var(--accent); color: var(--accent); }
  /* Clip dibujado con CSS: dos trazos, sin depender de un ícono extra */
  .sp-clip span {
    width: 13px; height: 17px;
    border: 1.6px solid currentColor; border-radius: 9px;
    border-bottom-left-radius: 9px; position: relative;
  }
  .sp-clip span::after {
    content: ''; position: absolute; left: 3px; top: 3px;
    width: 5px; height: 9px;
    border: 1.6px solid currentColor; border-radius: 4px;
  }

  .sp-adj-ok {
    display: flex; align-items: center; gap: 9px;
    background: var(--surface-alt); border: 1px solid var(--success);
    border-radius: 10px; padding: 7px 10px; margin-bottom: 8px; font-size: 12px;
  }
  .sp-adj-ok img { width: 34px; height: 34px; object-fit: cover; border-radius: 6px; }
  .sp-adj-ok span { flex: 1; color: var(--text-dim); }
  .sp-adj-ok button {
    background: transparent; border: 1px solid var(--border);
    color: var(--text-dim); font-size: 11px; padding: 4px 9px; border-radius: 6px;
  }

  .sp-chat-m.con-img { padding: 5px; }
  .sp-chat-m.con-img img {
    display: block; max-width: 100%; max-height: 210px;
    border-radius: 8px; margin-bottom: 4px;
  }
  .sp-chat-m.con-img small { padding: 0 6px 3px; }
  .pt-sp-in input {
    flex: 1; background: var(--surface-alt); border: 1px solid var(--border);
    border-radius: 10px; color: var(--text); padding: 11px 12px; font-size: 14px;
  }
  .pt-sp-in input:focus { outline: none; border-color: var(--accent); }
  .pt-rapido.sel { border-color: var(--accent); color: var(--accent); }

  .pt-comp-drop {
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    padding: 20px; border-radius: 10px;
    border: 1px dashed var(--border); background: var(--surface-alt);
    color: var(--text-dim); font-size: 13px; cursor: pointer;
  }
  .pt-comp-drop:hover { border-color: var(--accent); color: var(--accent); }
  .pt-comp-drop .icono { width: 22px; height: 22px; }
  .pt-comp-drop .icono svg { width: 100%; height: 100%; display: block; }
  .pt-comp-drop small { font-size: 11px; opacity: 0.75; }
  .pt-comp-ok {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; border-radius: 10px;
    background: var(--surface-alt); border: 1px solid var(--success);
  }
  .pt-comp-thumb { width: 42px; height: 42px; object-fit: cover; border-radius: 7px; flex-shrink: 0; }
  .pt-barra { height: 5px; background: var(--surface-alt); border-radius: 999px; overflow: hidden; margin-top: 10px; }
  .pt-barra span { display: block; height: 100%; background: var(--accent); transition: width 0.2s; }

  /* Proveedores bajo el banner: chips tipo VIP, icono 1:1 + nombre */
  .pt-prov-bar {
    display: flex; gap: 8px; overflow-x: auto; padding: 2px 2px 12px;
    -webkit-overflow-scrolling: touch; scrollbar-width: none;
  }
  .pt-prov-bar::-webkit-scrollbar { display: none; }
  .pt-prov-chip {
    display: flex; align-items: center; gap: 8px; flex: 0 0 auto;
    height: 40px; padding: 0 12px 0 6px; border-radius: 12px;
    border: 1px solid var(--border); background: #000;
    color: var(--text); font-family: inherit; cursor: pointer;
  }
  .pt-prov-chip:hover { border-color: var(--accent); }
  .pt-prov-chip.is-on {
    border-color: var(--accent);
    background: #000;
  }
  .pt-prov-ico {
    width: 28px; height: 28px; border-radius: 8px; object-fit: cover;
    flex-shrink: 0; background: var(--surface); display: block;
  }
  .pt-prov-ico.letra {
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 800; color: var(--accent);
  }
  .pt-prov-nom {
    font-size: 12.5px; font-weight: 700; white-space: nowrap; max-width: 9.5em;
    overflow: hidden; text-overflow: ellipsis;
  }

  /* Buscador de juegos */
  .pt-buscar-input {
    width: 100%; background: var(--surface-alt-glass);
    border: 1px solid var(--border); border-radius: 10px;
    color: var(--text); padding: 12px 14px; font-size: 15px;
    margin-bottom: 14px;
  }
  .pt-buscar-input:focus { outline: none; border-color: var(--accent); }

  /* Panel lateral de cuenta */
  .pt-drawer-fondo {
    position: fixed; inset: 0; z-index: 50;
    background: rgba(0,0,0,0);
    display: flex; justify-content: flex-end;
    transition: background 0.18s ease;
  }
  .pt-drawer-fondo.abierto { background: rgba(0,0,0,0.55); }
  .pt-drawer {
    width: 100%; max-width: 380px;
    background: var(--surface);
    border-left: 1px solid var(--border);
    padding: 16px 16px calc(24px + env(safe-area-inset-bottom));
    overflow-y: auto;
    transform: translateX(100%);
    transition: transform 0.18s ease;
  }
  .pt-drawer-fondo.abierto .pt-drawer { transform: translateX(0); }

  .pt-drawer-head { display: flex; align-items: center; gap: 11px; margin-bottom: 12px; }
  .pt-drawer-head strong { display: block; font-size: 15px; font-weight: 600; }
  .pt-drawer-head .hint { font-size: 12px; }
  .pt-avatar-lg {
    width: 42px; height: 42px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid var(--accent); color: var(--accent);
    font-size: 17px; font-weight: 500;
  }
  .pt-icon-btn {
    background: transparent; border: none; color: var(--text-dim);
    width: 32px; height: 32px; padding: 6px; border-radius: 8px; flex-shrink: 0;
  }
  .pt-icon-btn:hover { color: var(--text); background: var(--surface-alt); }
  .pt-icon-btn svg { width: 100%; height: 100%; display: block; }

  .pt-drawer-hero {
    background: var(--surface-alt); border: 1px solid var(--border-glass);
    border-radius: 16px; padding: 14px 15px 15px; margin-bottom: 12px;
  }
  .pt-drawer-hero-monto {
    display: block; font-size: 26px; font-weight: 700; margin: 4px 0 8px;
    font-variant-numeric: tabular-nums; letter-spacing: -0.02em;
  }
  .pt-drawer-split {
    display: flex; flex-wrap: wrap; gap: 10px 16px;
    font-size: 12px; color: var(--text-dim); margin-bottom: 12px;
  }
  .pt-drawer-split b { color: var(--text); font-weight: 600; font-variant-numeric: tabular-nums; }
  .pt-drawer-saldo-retenido {
    display: flex; align-items: center; justify-content: space-between;
    margin: 0 0 12px; padding-top: 10px; border-top: 1px dashed var(--border);
    font-size: 12.5px; color: var(--text-dim);
  }
  .pt-drawer-saldo-retenido strong {
    font-size: 13.5px; font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums;
  }
  .pt-drawer-acciones { display: flex; gap: 8px; }
  .pt-drawer-acciones button { flex: 1; padding: 12px; font-size: 14px; height: 44px; min-height: 44px; }
  .pt-drawer-acciones .pt-recargar { width: auto; flex: 1; }
  .pt-drawer-tabs {
    display: flex; gap: 4px; padding: 4px; margin-bottom: 12px;
    background: var(--surface-alt); border: 1px solid var(--border-glass); border-radius: 12px;
  }
  .pt-drawer .pt-drawer-tab {
    flex: 1; height: auto; min-height: 0; background: transparent; border: none;
    color: var(--text-dim); box-shadow: none;
    font-size: 12.5px; font-weight: 600; padding: 8px 4px; border-radius: 9px;
  }
  .pt-drawer .pt-drawer-tab.is-active { background: var(--surface-raised); color: var(--text); }
  .pt-drawer-panel { min-height: 80px; }
  .pt-drawer-titulo {
    font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--text-dim); font-weight: 500; margin: 14px 0 6px;
  }
  .pt-drawer-titulo:first-child { margin-top: 0; }
  .pt-drawer-movs { border-top: 1px solid var(--border-glass); }
  .pt-drawer .pt-pendiente { margin: 0 0 10px; }
  .pt-candado-ok {
    border-color: color-mix(in srgb, var(--success) 40%, transparent);
    border-left-color: var(--success);
    background: color-mix(in srgb, var(--success) 10%, transparent);
  }
  .pt-candado-ok b { color: var(--success); }

  .pt-drawer > .pt-fila-accion { margin-top: 8px; border-bottom: none; }
  .pt-fila-accion {
    display: flex; align-items: center; gap: 11px; width: 100%;
    background: transparent; border: none;
    border-bottom: 1px solid var(--border-glass); border-radius: 0;
    color: var(--text); padding: 13px 2px; font-size: 14px; font-weight: 400;
  }
  .pt-fila-accion:hover { color: var(--accent); }
  .pt-fila-accion .icono { width: 19px; height: 19px; flex-shrink: 0; }
  .pt-fila-accion .icono.chico { width: 15px; height: 15px; color: var(--text-dim); }
  .pt-fila-accion .icono svg { width: 100%; height: 100%; display: block; }

  .pt-pendiente {
    border-left: 3px solid var(--accent);
    background: var(--surface-alt-glass);
    padding: 12px 14px; margin: 14px; font-size: 13px;
  }
  .pt-pendiente strong { display: block; font-size: 16px; margin-bottom: 2px; }
  .pt-vacio { text-align: center; color: var(--text-dim); font-size: 13px; padding: 20px 0; }

  /* =========================================================
     Chat de soporte: globo flotante + ventana, siempre montados
     (justo arriba de la barra de navegación en celular; en
     escritorio no hay barra abajo, ver el media query de más abajo).
     ========================================================= */
  .chat-globo {
    position: fixed; right: 14px; z-index: 35;
    bottom: calc(64px + env(safe-area-inset-bottom));
    width: 54px; height: 54px; border-radius: 50%;
    background: var(--surface); border: 1px solid var(--border-glass);
    box-shadow: 0 10px 26px rgba(0,0,0,0.4);
    display: flex; align-items: center; justify-content: center;
    padding: 0; transition: transform 0.16s ease, opacity 0.16s ease;
  }
  .chat-globo:active { transform: scale(0.94); }
  .chat-globo.oculto { transform: scale(0.001); opacity: 0; pointer-events: none; }
  .wa-globo {
    right: 78px; background: #128C7E; color: #fff; border-color: transparent;
    text-decoration: none;
  }
  .wa-globo.solo { right: 14px; }
  .wa-globo:hover { filter: brightness(1.08); }
  .chat-globo .anillo {
    position: absolute; inset: -6px; border-radius: 50%;
    border: 1.5px solid color-mix(in srgb, var(--accent) 55%, transparent);
    animation: pt-pulso-anillo 2.6s ease-out infinite;
  }
  .chat-globo .anillo.d2 { animation-delay: 1.3s; }
  @keyframes pt-pulso-anillo {
    0%   { transform: scale(0.82); opacity: 0.9; }
    70%  { transform: scale(1.35); opacity: 0; }
    100% { transform: scale(1.35); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .chat-globo .anillo { animation: none; display: none; }
  }
  .chat-badge {
    position: absolute; top: -2px; right: -2px;
    background: var(--error); color: #fff;
    font-size: 10px; font-weight: 700; line-height: 1;
    min-width: 17px; height: 17px; border-radius: 999px;
    display: flex; align-items: center; justify-content: center;
    border: 2px solid var(--bg);
  }
  .icono-soporte-fijo { width: 26px; height: 26px; color: var(--accent); }
  .icono-soporte-fijo svg { width: 100%; height: 100%; display: block; }
  .icono-soporte-fijo.chico { width: 18px; height: 18px; }

  /* Las animaciones de la biblioteca suelen traer bastante aire propio
     alrededor del dibujo (a diferencia del ícono fijo, que llena el
     100% de su caja) — se agranda el marco y se hace zoom adentro para
     que se vea protagonista en el globo, no una miniatura perdida. */
  .icono-soporte-anim {
    width: 46px; height: 46px; border-radius: 50%; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
  }
  .icono-soporte-anim svg { transform: scale(2.2); }
  .icono-soporte-anim.chico { width: 30px; height: 30px; }

  .chat-ventana {
    position: fixed; right: 12px; z-index: 36;
    bottom: calc(64px + env(safe-area-inset-bottom));
    width: min(380px, calc(100vw - 24px));
    height: min(70vh, 560px);
    background: var(--surface); border: 1px solid var(--border-glass);
    border-radius: 18px; box-shadow: 0 24px 60px rgba(0,0,0,0.55);
    display: flex; flex-direction: column; overflow: hidden;
    transform-origin: bottom right;
    transform: scale(0.9) translateY(12px);
    opacity: 0; pointer-events: none;
    transition: transform 0.2s cubic-bezier(.2,.9,.3,1.15), opacity 0.16s ease;
  }
  .chat-ventana.abierta { transform: scale(1) translateY(0); opacity: 1; pointer-events: auto; }
  @media (prefers-reduced-motion: reduce) {
    .chat-ventana { transition: opacity 0.15s ease; transform: none; }
  }

  .chat-head {
    display: flex; align-items: center; gap: 10px; padding: 12px 12px 12px 14px;
    background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 14%, var(--surface)), var(--surface));
    border-bottom: 1px solid var(--border-glass); flex-shrink: 0;
  }
  .chat-head-icono {
    width: 32px; height: 32px; flex-shrink: 0; border-radius: 50%;
    background: var(--surface-alt); display: flex; align-items: center; justify-content: center;
  }
  .chat-head-txt { flex: 1; min-width: 0; }
  .chat-head-txt strong { display: block; font-size: 13.5px; font-weight: 600; }
  .chat-head-txt span { font-size: 11px; color: var(--text-dim); display: flex; align-items: center; gap: 5px; }
  .chat-head-txt .punto-en-linea { width: 6px; height: 6px; border-radius: 50%; background: var(--success); flex-shrink: 0; }
  .chat-min {
    background: transparent; border: none; color: var(--text-dim);
    font-size: 20px; padding: 4px 8px; border-radius: 8px; line-height: 1;
  }
  .chat-min:hover { background: var(--surface-alt); color: var(--text); }

  .chat-cuerpo {
    flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 3px;
    background:
      radial-gradient(circle at 15% 10%, color-mix(in srgb, var(--accent) 5%, transparent), transparent 40%),
      var(--bg);
  }
  .chat-dia {
    align-self: center; font-size: 10.5px; color: var(--text-dim);
    background: var(--surface-alt-glass); border-radius: 999px; padding: 3px 11px; margin: 6px 0 10px;
  }
  .chat-cerrado-aviso { text-align: center; font-size: 12px; color: var(--text-dim); margin: 10px 4px 2px; }

  .motivos-intro { text-align: center; padding: 8px 4px 4px; }
  .motivos-intro p { margin: 0 0 12px; font-size: 12.5px; color: var(--text-dim); }
  .motivos { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin-bottom: 4px; }
  .motivo-chip {
    background: var(--surface-alt); border: 1px solid var(--border);
    border-radius: 999px; padding: 7px 13px; font-size: 12.5px; color: var(--text-dim);
  }
  .motivo-chip.sel { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }

  .msg { max-width: 78%; padding: 8px 11px; border-radius: 12px; font-size: 12.5px; line-height: 1.5; }
  .msg.ellos { background: var(--surface-alt); align-self: flex-start; border-bottom-left-radius: 3px; }
  .msg.yo { background: var(--accent); color: var(--accent-text); align-self: flex-end; border-bottom-right-radius: 3px; }
  .msg.sistema { align-self: center; background: transparent; color: var(--text-dim); font-size: 11px; padding: 2px 8px; max-width: 100%; text-align: center; }
  .msg small { display: block; font-size: 9.5px; opacity: 0.7; margin-top: 3px; }
  .msg.con-img { padding: 5px; }
  .msg.con-img img { display: block; width: 100%; max-width: 220px; border-radius: 8px; margin-bottom: 4px; }
  .msg.con-img small { padding: 0 4px 2px; }

  .chat-adjunto {
    display: flex; align-items: center; gap: 8px; margin: 0 10px 8px;
    background: var(--surface-alt); border-radius: 10px; padding: 6px 8px; font-size: 12px; color: var(--text-dim);
  }
  .chat-adjunto img { width: 32px; height: 32px; object-fit: cover; border-radius: 6px; }
  .chat-adjunto span { flex: 1; }
  .chat-adjunto button {
    background: transparent; border: 1px solid var(--border); color: var(--text-dim);
    border-radius: 7px; padding: 5px 9px; font-size: 11px;
  }
  .chat-subiendo, .chat-error { font-size: 12px; margin: 0 10px 8px; }
  .chat-subiendo { color: var(--text-dim); }
  .chat-error { color: var(--error); }

  .chat-in { display: flex; gap: 7px; align-items: center; padding: 10px; border-top: 1px solid var(--border-glass); flex-shrink: 0; }
  .chat-clip {
    width: 32px; height: 32px; flex-shrink: 0; border-radius: 50%;
    background: var(--surface-alt); border: 1px solid var(--border);
    color: var(--text-dim); display: flex; align-items: center; justify-content: center;
  }
  .chat-clip span { width: 15px; height: 15px; display: block; }
  .chat-clip svg { width: 100%; height: 100%; display: block; }
  .chat-in input {
    flex: 1; min-width: 0; background: var(--surface-alt); border: 1px solid var(--border);
    border-radius: 999px; color: var(--text); padding: 9px 14px; font-size: 13px;
  }
  .chat-in input:focus { outline: none; border-color: var(--accent); }
  .chat-enviar {
    width: 32px; height: 32px; flex-shrink: 0; border-radius: 50%;
    background: var(--accent); color: var(--accent-text); border: none;
    display: flex; align-items: center; justify-content: center; padding: 0;
  }
  .chat-enviar span { width: 15px; height: 15px; display: block; }
  .chat-enviar svg { width: 100%; height: 100%; display: block; }
  .chat-enviar:disabled { opacity: 0.6; }

  /* =========================================================
     Autorregistro / verificación / candado de retiro
     ========================================================= */
  .pt-fineprint { font-size: 11px; color: var(--text-dim); line-height: 1.5; margin: 8px 0 12px; }

  .pt-field-select {
    width: 100%; background: var(--surface-alt); border: 1px solid var(--border);
    border-radius: 9px; color: var(--text); padding: 10px 12px; font-size: 14px;
    font-family: inherit; margin-bottom: 14px;
  }
  .pt-field-select:focus { outline: none; border-color: var(--accent); }

  .ver-motivo {
    background: color-mix(in srgb, var(--error) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--error) 40%, transparent);
    border-left: 3px solid var(--error);
    border-radius: 10px; padding: 11px 13px; margin: 4px 0 14px;
    font-size: 12.5px; line-height: 1.5;
  }
  .ver-motivo strong { display: block; color: var(--error); font-size: 13px; margin-bottom: 3px; }

  .ver-slots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
  .ver-slot {
    border: 1px dashed var(--border); background: var(--surface-alt);
    border-radius: 10px; padding: 14px 6px 10px; text-align: center;
    font-size: 10px; color: var(--text-dim); line-height: 1.35; cursor: pointer;
    display: flex; flex-direction: column; align-items: center; gap: 5px;
  }
  .ver-slot:hover { border-color: var(--accent); }
  .ver-slot-ico {
    width: 22px; height: 17px; border: 1.6px solid var(--accent); border-radius: 3px;
  }
  .ver-slot.is-ok { border-style: solid; border-color: var(--success); color: var(--text); }
  .ver-slot.is-ok .ver-slot-ico { background: var(--success); border-color: var(--success); }
  .ver-slot.subiendo { opacity: 0.7; }
  .ver-slot-estado { font-size: 10px; color: var(--accent); font-variant-numeric: tabular-nums; min-height: 12px; }
  .ver-slot.is-ok .ver-slot-estado::before { content: '✓ listo'; color: var(--success); }

  .ver-pill {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase;
    padding: 4px 10px; border-radius: 999px; font-weight: 600;
  }
  .ver-pill.wait { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); }
  .ver-pill.ok { background: color-mix(in srgb, var(--success) 16%, transparent); color: var(--success); }
  .ver-pill.no { background: color-mix(in srgb, var(--error) 16%, transparent); color: var(--error); }

  /* Franja de gate en el lobby: verificá para jugar */
  .pt-gate {
    display: flex; align-items: center; gap: 12px;
    margin: 12px 14px 2px;
    padding: 11px 13px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--accent) 42%, transparent);
    background: linear-gradient(140deg,
      color-mix(in srgb, var(--accent) 16%, transparent),
      color-mix(in srgb, var(--accent) 4%, transparent));
  }
  .pt-gate-info { flex: 1; min-width: 0; }
  .pt-gate-info strong { display: block; font-size: 13px; font-weight: 600; }
  .pt-gate-info span { font-size: 11px; color: var(--text-dim); }
  .pt-gate button {
    flex-shrink: 0;
    background: var(--primary-button-face); color: var(--accent-text); border: none;
    border-radius: var(--btn-radius, 18px); padding: 0 var(--btn-pad-x, 14px); font-size: 12px; font-weight: 600;
  }

  /* Tarjetas de juego atenuadas + candado cuando no está verificado */
  .pt-no-verif .pt-juego { opacity: 0.6; }
  .pt-no-verif .pt-juego::after {
    content: ''; position: absolute; top: 50%; left: 50%;
    width: 15px; height: 12px; transform: translate(-50%, -25%);
    border: 2px solid #fff; border-radius: 3px;
    background: rgba(0,0,0,0.4);
    z-index: 3;
  }
  .pt-no-verif .pt-juego::before {
    content: ''; position: absolute; top: 50%; left: 50%;
    width: 9px; height: 9px; transform: translate(-50%, -120%);
    border: 2px solid #fff; border-bottom: none; border-radius: 5px 5px 0 0;
    z-index: 3;
  }

  .pt-aviso-hoja {
    width: 100%; max-width: 340px; text-align: center;
    background: #0c0c0e; border: 1px solid #3a2e14;
    border-radius: 16px; padding: 22px 18px 16px;
  }
  .pt-aviso-kicker {
    margin: 0 0 8px; font-size: 11px; font-weight: 800;
    letter-spacing: 0.08em; text-transform: uppercase; color: #d4af37;
  }
  .pt-aviso-de { margin: 0 0 10px; font-size: 13.5px; color: var(--text); line-height: 1.4; }
  .pt-aviso-de b { color: #f6e7c3; }
  .pt-aviso-desglose {
    list-style: none; margin: 0 0 12px; padding: 0;
    border: 1px solid #2a2418; border-radius: 10px; overflow: hidden;
  }
  .pt-aviso-desglose li {
    display: flex; justify-content: space-between; align-items: center;
    padding: 8px 12px; font-size: 13px; color: var(--text-dim);
    border-top: 1px solid #2a2418;
  }
  .pt-aviso-desglose li:first-child { border-top: none; }
  .pt-aviso-desglose b { color: var(--text); font-variant-numeric: tabular-nums; }
  .pt-aviso-lbl {
    margin: 0; font-size: 11px; letter-spacing: 0.06em;
    text-transform: uppercase; color: var(--text-dim);
  }
  .pt-aviso-total {
    display: block; margin: 2px 0 16px;
    font-size: 32px; font-weight: 800; color: #e8c547;
    font-variant-numeric: tabular-nums; letter-spacing: -0.02em;
  }

  /* Modal chico centrado (aviso de verificar al tocar un juego) */
  .pt-modal-fondo {
    position: fixed; inset: 0; z-index: 60;
    background: rgba(0,0,0,0.66);
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
  }
  .pt-modal {
    width: 100%; max-width: 340px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 16px; padding: 20px 18px 16px; text-align: center;
  }
  .pt-modal-lock {
    width: 34px; height: 28px; margin: 4px auto 12px;
    border: 2.4px solid var(--accent); border-radius: 7px; position: relative;
  }
  .pt-modal-lock::before {
    content: ''; position: absolute; top: -13px; left: 50%; transform: translateX(-50%);
    width: 18px; height: 16px; border: 2.4px solid var(--accent);
    border-bottom: none; border-radius: 9px 9px 0 0;
  }
  .pt-modal h4 { margin: 0 0 6px; font-size: 15px; font-weight: 600; }
  .pt-modal p { margin: 0 0 15px; font-size: 12.5px; color: var(--text-dim); line-height: 1.5; }
  .pt-modal-acciones { display: flex; gap: 8px; }
  .pt-modal-acciones button { flex: 1; padding: 10px; font-size: 13px; border-radius: 9px; }
  .pt-modal-acciones .secundario { background: transparent; border: 1px solid var(--border); color: var(--text); }

  /* Card de cashback en el lobby */
  .pt-cashback {
    display: flex; align-items: center; gap: 12px; width: calc(100% - 28px);
    margin: 12px 14px 2px; padding: 12px 14px; text-align: left;
    border-radius: 12px; border: 1px solid var(--success);
    background: linear-gradient(140deg,
      color-mix(in srgb, var(--success) 16%, transparent),
      color-mix(in srgb, var(--success) 4%, transparent));
    color: var(--text);
  }
  .pt-cashback div { flex: 1; min-width: 0; }
  .pt-cashback strong { display: block; font-size: 13px; font-weight: 600; }
  .pt-cashback span { font-size: 11px; color: var(--text-dim); }
  .pt-cashback-monto {
    flex-shrink: 0; font-size: 16px; font-weight: 700; color: var(--success);
    font-variant-numeric: tabular-nums;
  }

  .cb-hero {
    background: var(--surface-alt); border: 1px solid var(--success);
    border-radius: 12px; padding: 14px 16px; margin: 6px 0 16px; text-align: center;
  }
  .cb-hero span { font-size: 12px; color: var(--text-dim); }
  .cb-hero strong {
    display: block; font-size: 28px; font-weight: 600; margin-top: 3px;
    color: var(--success); font-variant-numeric: tabular-nums;
  }

  /* ---- VIP ---- */
  .vip-gema-css {
    width: 22px; height: 22px; flex-shrink: 0; display: inline-block;
    border-radius: 4px; transform: rotate(45deg);
    background: linear-gradient(135deg,
      color-mix(in srgb, var(--gc, #c7ccd1) 60%, #fff),
      var(--gc, #c7ccd1) 55%,
      color-mix(in srgb, var(--gc, #c7ccd1) 70%, #000));
    box-shadow: inset 0 1px 2px rgba(255,255,255,0.5);
  }
  .vip-gema-img { width: 30px; height: 30px; object-fit: contain; flex-shrink: 0; }
  .vip-gema-anim { width: 34px; height: 34px; flex-shrink: 0; }
  .vip-gema-anim svg, .vip-gema-anim canvas { display: block; }

  .pt-vip-hoja {
    width: 100%; max-width: 420px; max-height: 82vh; overflow-y: auto;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 16px; padding: 16px;
  }
  .pt-vip-escalera { display: flex; flex-direction: column; gap: 7px; margin-top: 12px; }
  .pt-vip-fila {
    display: flex; align-items: center; gap: 11px;
    padding: 10px 12px; border-radius: 10px;
    border: 1px solid var(--border-glass);
  }
  .pt-vip-fila.actual { border-color: var(--gc, var(--accent)); background: color-mix(in srgb, var(--gc, var(--accent)) 9%, transparent); }
  .pt-vip-fila-gema { width: 34px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  .pt-vip-fila-txt { flex: 1; min-width: 0; }
  .pt-vip-fila-txt strong { display: block; font-size: 13.5px; font-weight: 600; }
  .pt-vip-fila-txt small { font-size: 10.5px; color: var(--text-dim); }
  .pt-vip-fila-estado { flex-shrink: 0; font-size: 11px; color: var(--text-dim); }
  .pt-vip-fila.actual .pt-vip-fila-estado { color: var(--gc, var(--accent)); font-weight: 600; }

  /* ---- Giro diario: la ruleta ---- */
  .pt-rul {
    position: relative; width: 236px; margin: 12px auto 4px;
    --rul-aro: radial-gradient(circle at 30% 25%, #f3e08e, #d4af37 42%, #5a3e0e 100%);
    --rul-luces: #f3e08e;
    --rul-hub: radial-gradient(circle at 35% 30%, #f8e7a0, #d4af37 58%, #7a5c14);
    --rul-hub-txt: #1a1204;
    --rul-flecha: #d4af37;
    --rul-cara: #0a0a0a;
  }
  .pt-rul[data-tema="san-patricio"] {
    --rul-aro: radial-gradient(circle at 30% 25%, #d4f0a0, #2e8b57 45%, #0d3d22 100%);
    --rul-luces: #f0c14b;
    --rul-hub: radial-gradient(circle at 35% 30%, #e8f5c8, #3d9b5c 60%, #145c32);
    --rul-hub-txt: #0a2414;
    --rul-flecha: #f0c14b;
    --rul-cara: #0a2414;
  }
  .pt-rul[data-tema="noche"] {
    --rul-aro: radial-gradient(circle at 30% 25%, #d0def4, #6a8ab8 45%, #152444 100%);
    --rul-luces: #8eb6e8;
    --rul-hub: radial-gradient(circle at 35% 30%, #e8eef8, #8eb6e8 60%, #2a3f6e);
    --rul-hub-txt: #0c1220;
    --rul-flecha: #8eb6e8;
    --rul-cara: #070b14;
  }
  .pt-rul[data-tema="clasico"] {
    --rul-aro: radial-gradient(circle at 30% 25%, #fff, var(--platinum) 45%, var(--ink-dimmer) 100%);
    --rul-luces: var(--platinum);
    --rul-hub: radial-gradient(circle at 35% 30%, #fff, var(--platinum) 60%, var(--ink-dimmer));
    --rul-hub-txt: #3a2c08;
    --rul-flecha: var(--accent);
    --rul-cara: #1c1408;
  }
  .pt-rul::before { content: ''; display: block; padding-bottom: 100%; }
  .pt-rul-flecha {
    position: absolute; top: -5px; left: 50%; transform: translateX(-50%); z-index: 4;
    width: 0; height: 0; border-left: 12px solid transparent; border-right: 12px solid transparent;
    border-top: 22px solid var(--rul-flecha);
    filter: drop-shadow(0 3px 4px rgba(0,0,0,0.55));
  }
  .pt-rul-aro {
    position: absolute; inset: -10px; border-radius: 50%;
    background: var(--rul-aro);
    box-shadow: 0 14px 40px -10px rgba(0,0,0,0.7), inset 0 0 14px rgba(0,0,0,0.35);
  }
  .pt-rul-luces {
    position: absolute; inset: -8px; border-radius: 50%; z-index: 2; pointer-events: none;
    border: 4px dotted var(--rul-luces); filter: drop-shadow(0 0 4px var(--rul-luces)); opacity: 0.85;
  }
  .pt-rul-cara {
    position: absolute; inset: 0; border-radius: 50%; overflow: hidden;
    border: 5px solid var(--rul-cara); box-shadow: inset 0 0 18px rgba(0,0,0,0.5);
  }
  .pt-rul-svg { width: 100%; height: 100%; }
  .pt-rul-svg svg { display: block; }
  .pt-rul-hub {
    position: absolute; top: 50%; left: 50%; width: 46px; height: 46px; margin: -23px; z-index: 3;
    border-radius: 50%; background: var(--rul-hub);
    box-shadow: 0 4px 12px rgba(0,0,0,0.5), inset 0 2px 4px rgba(255,255,255,0.35);
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 700; color: var(--rul-hub-txt); letter-spacing: 0.06em;
  }
  .pt-rul-premios {
    display: flex; gap: 6px; overflow-x: auto; padding: 12px 0 4px; scrollbar-width: none;
    justify-content: center; flex-wrap: wrap;
  }
  .pt-rul-premios::-webkit-scrollbar { display: none; }
  .pt-rul-premios span {
    flex: none; font-size: 10.5px; font-weight: 600; padding: 3px 9px; border-radius: 999px;
    border: 1px solid var(--border); color: var(--text-dim); white-space: nowrap;
  }
  .pt-rul-premios span.top { border-color: var(--accent); color: var(--accent); }

  .pt-giro-hoja {
    width: 100%; max-width: 360px; max-height: 88vh; overflow-y: auto;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 16px; padding: 16px;
  }
  .pt-giro-hoja[data-tema="casino"] {
    background: #0c0c0e; border-color: #3a2e14;
  }
  .pt-giro-hoja[data-tema="san-patricio"] {
    background: #0a1610; border-color: #2e5c32;
  }
  .pt-giro-hoja[data-tema="noche"] {
    background: #0a1018; border-color: #2a3f6e;
  }
  .pt-giro-res { text-align: center; margin-top: 10px; }
  .pt-giro-res strong { display: block; font-size: 20px; font-weight: 700; margin: 2px 0; }
  .pt-giro-res span { font-size: 12px; color: var(--text-dim); display: block; }
  .pt-giro-res.gano { border: 1px solid var(--success); border-radius: 12px; padding: 14px; background: color-mix(in srgb, var(--success) 10%, transparent); }
  .pt-giro-res.gano small { font-size: 11px; color: var(--success); letter-spacing: 0.06em; text-transform: uppercase; }
  .pt-giro-res.gano strong { color: var(--success); font-size: 28px; font-variant-numeric: tabular-nums; }

  /* ---- Código promocional (drawer de cuenta) ---- */
  .pt-promo { margin: 4px 0 14px; }
  .pt-promo > label {
    display: block; font-size: 11px; font-weight: 600; color: var(--text-dim);
    margin-bottom: 5px;
  }
  .pt-promo-fila { display: flex; gap: 8px; }
  .pt-promo-fila input {
    flex: 1; min-width: 0; text-transform: uppercase; letter-spacing: 0.06em;
    font-family: ui-monospace, monospace;
    background: var(--surface-alt); border: 1px solid var(--border);
    border-radius: 8px; padding: 9px 11px; font-size: 13px; color: var(--text);
  }
  .pt-promo-fila button {
    flex-shrink: 0; background: var(--primary-button-face); color: var(--accent-text);
    border: none; border-radius: var(--btn-radius, 8px); padding: 0 var(--btn-pad-x, 14px); font-size: 13px;
    font-weight: 600; font-family: inherit; cursor: pointer;
  }
  .pt-promo-fila button:disabled { opacity: 0.5; }

  /* ---- Hitos de carga (drawer de cuenta) ---- */
  .pt-hito {
    border: 1px solid var(--border); border-radius: 12px;
    padding: 12px 13px; margin-bottom: 10px; background: var(--surface-alt);
    display: flex; flex-direction: column; gap: 3px;
  }
  .pt-hito > strong { font-size: 13.5px; }
  .pt-hito-barra {
    height: 7px; border-radius: 999px; background: var(--surface);
    border: 1px solid var(--border); overflow: hidden; margin: 6px 0 2px;
  }
  .pt-hito-barra span {
    display: block; height: 100%; border-radius: 999px;
    background: linear-gradient(90deg, var(--accent), var(--success));
    transition: width .4s ease;
  }
  @media (prefers-reduced-motion: reduce) { .pt-hito-barra span { transition: none; } }
  .pt-hito-info {
    display: flex; justify-content: space-between; font-size: 11.5px; color: var(--text-dim);
  }
  .pt-hito-info b { color: var(--accent); font-variant-numeric: tabular-nums; }

  /* ---- Referidos (drawer de cuenta) ---- */
  .pt-ref {
    border: 1px solid var(--border); border-radius: 12px;
    padding: 13px; margin-bottom: 12px; background: var(--surface-alt);
  }
  .pt-ref h4 { margin: 0 0 3px; font-size: 14px; font-weight: 600; }
  .pt-ref p { margin: 0 0 11px; font-size: 11.5px; color: var(--text-dim); }
  .pt-ref-cod {
    display: flex; align-items: center; gap: 8px;
    background: var(--surface); border: 1px dashed var(--accent);
    border-radius: 10px; padding: 9px 11px; margin-bottom: 9px;
  }
  .pt-ref-cod b { flex: 1; font-family: ui-monospace, monospace; font-size: 15px; letter-spacing: 0.08em; color: var(--accent); }
  .pt-ref-cod button { background: transparent; border: 1px solid var(--border); color: var(--accent); border-radius: 7px; padding: 5px 10px; font-size: 11px; }
  .pt-ref-share {
    width: 100%; background: var(--success); color: #08240f; border: none;
    border-radius: 9px; padding: 9px; font-size: 12px; font-weight: 700; margin-bottom: 11px;
  }
  .pt-ref-nums { display: flex; gap: 8px; }
  .pt-ref-nums div { flex: 1; text-align: center; background: var(--surface); border-radius: 8px; padding: 8px 4px; }
  .pt-ref-nums small { display: block; font-size: 9.5px; color: var(--text-dim); letter-spacing: 0.03em; }
  .pt-ref-nums strong { font-size: 15px; font-variant-numeric: tabular-nums; }

  /* Candado de retiro en el drawer de cuenta */
  .pt-candado {
    border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
    border-left: 3px solid var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    border-radius: 10px; padding: 11px 13px; margin-bottom: 12px;
    font-size: 12px; line-height: 1.5;
  }
  .pt-candado b { display: block; color: var(--accent); font-size: 12.5px; margin-bottom: 3px; }

  /* =========================================================
     Escritorio: menú arriba (no abajo) + columna de cuenta fija.
     Se mantiene la misma app, no es una pantalla aparte — solo se
     reacomoda a partir de este ancho.
     ========================================================= */
  @media (min-width: 900px) {
    .pt-app {
      max-width: 1300px; margin: 0 auto;
      padding-bottom: 0; /* ya no hay barra fija abajo que reservar */
    }

    .pt-nav { display: none; }

    /* Sin barra fija abajo que esquivar: el globo va pegado a la
       esquina, como cualquier widget de chat de escritorio. */
    .chat-globo, .chat-ventana { bottom: 24px; }
    .chat-globo { right: 24px; }
    .wa-globo { right: 88px; }
    .wa-globo.solo { right: 24px; }
    .chat-ventana { right: 24px; width: 360px; }

    /* En celular el banner flota detrás del header (efecto relieve).
       En escritorio no hace falta: el header queda siempre sólido y
       el banner entra en el flujo normal, debajo. */
    .pt-logo-nombre { max-height: 32px; max-width: 240px; }
    .pt-header {
      padding: 12px 24px;
      background: var(--surface-glass);
      backdrop-filter: var(--surface-blur);
      -webkit-backdrop-filter: var(--surface-blur);
      border-bottom-color: var(--border-glass);
    }
    .pt-header-fila { max-width: 460px; }
    .pt-chip-vip { flex: 0 1 280px; }
    .pt-nav-desktop {
      display: flex; align-items: center; gap: 4px; margin-left: 20px;
    }
    .pt-nav-desktop button {
      display: flex; align-items: center; gap: 7px;
      background: transparent; border: none; border-radius: 8px;
      color: var(--text-dim); font-size: 13.5px; font-weight: 500;
      padding: 8px 13px; position: relative;
    }
    .pt-nav-desktop button:hover { background: var(--surface-alt-glass); color: var(--text); }
    .pt-nav-desktop button.is-active { background: var(--surface-alt-glass); color: var(--accent); }
    .pt-nav-desktop button .icono { width: 17px; height: 17px; display: block; }
    .pt-nav-desktop button .icono svg { width: 100%; height: 100%; display: block; }
    .pt-nav-desktop button.con-aviso::after {
      content: ''; position: absolute; top: 6px; right: 8px;
      width: 6px; height: 6px; border-radius: 50%; background: var(--accent);
    }

    .pt-layout {
      display: grid; grid-template-columns: 1fr 300px; gap: 24px;
      padding: 20px 24px 32px; align-items: start;
    }
    /* Adentro de .pt-layout, las secciones ya no necesitan su propio
       margen — el padding de .pt-layout hace ese trabajo. Y el banner
       deja de flotar detrás del header (ver comentario arriba). */
    .pt-main > .pt-seccion { margin-left: 0; margin-right: 0; }
    .pt-main .pt-banner,
    .pt-main .pt-carrusel {
      margin: 0 0 20px; padding-top: 0; border-radius: 16px;
    }
    .pt-juegos {
      --pt-cols: 5;
      --pt-gap: 16px;
      --pt-card-r: var(--card-radius, 12px);
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      gap: 26px var(--pt-gap);
    }
    .pt-seccion-fija .pt-juegos {
      grid-auto-columns: calc((100% - (var(--pt-cols) - 1) * var(--pt-gap)) / var(--pt-cols));
      padding: 20px 0 8px;
    }

    .pt-sidebar {
      display: block; position: sticky; top: 84px;
      background: var(--surface-alt-glass); border: 1px solid var(--border-glass);
      border-radius: 16px; padding: 18px;
    }
    .pt-sidebar h4 {
      margin: 0 0 12px; font-size: 11px; font-weight: 700;
      letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-dim);
    }
    .pt-sidebar-fila {
      display: flex; justify-content: space-between; align-items: baseline;
      padding: 9px 0; border-bottom: 1px solid var(--border-glass);
      font-size: 12.5px; color: var(--text-dim);
    }
    .pt-sidebar-fila:last-of-type { border-bottom: none; }
    .pt-sidebar-fila span:last-child { font-variant-numeric: tabular-nums; color: var(--text); }
    .pt-sidebar-saldo strong {
      font-size: 22px; color: var(--accent); font-variant-numeric: tabular-nums;
    }
    .pt-sidebar-btn {
      width: 100%; margin-top: 14px; padding: 11px; border-radius: 10px;
      border: none; background: var(--primary-button-face); color: var(--accent-text);
      font-size: 13.5px; font-weight: 700; cursor: pointer;
    }
  }
</style>
`;
