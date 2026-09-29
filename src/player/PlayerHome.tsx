import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { formatMoney } from '../lib/currency.ts';
import { playerFetch } from './api.ts';
import { prefetchCatalogo } from './catalogo.ts';
import { urlLogoChico, urlWordmark } from '../lib/imgUrl.js';
import { ESTILOS_PORTAL } from './ui.css.js';

import { SoporteFlotante } from './SoporteFlotante.tsx';
import { IconoAnimado } from './IconoAnimado.tsx';

import { iniciarHeartbeat } from './heartbeat.js';
import { VipDetalle, GemaNivel, type VipData } from './vip.tsx';
import { GiroModal } from './giroDiario.tsx';
import { AvisoAcreditacion } from './avisoAcreditacion.tsx';
import { ICONOS } from './iconos.js';
import { urlLogo } from '../lib/themes.js';
import { montarBanners } from './banners.js';

import { GameCard } from './GameCard.tsx';
import { leerFavoritos, alternarFavorito, leerRecientes, registrarReciente } from './favoritos.ts';
import type { AvisoJugador, CasinoSettings, CategoriaJuegos, Juego, Movimiento, PlayerEstado, ProveedorLobby } from '../lib/types.js';

type Seccion = 'casino' | 'buscar';

// Alto fijo de .pt-imp-banner: si cambia el CSS, cambiar acá también.
const ALTURA_BANNER_IMPERSONACION = 34;

/** Cuenta regresiva compacta para el chip del giro ("8h 42m" / "42m"). */
function GiroCuenta({ hasta }: { hasta: string }) {
  const [txt, setTxt] = useState('');
  useEffect(() => {
    const tick = () => {
      const ms = new Date(hasta).getTime() - Date.now();
      if (ms <= 0) { setTxt('ya'); return; }
      const m = Math.floor(ms / 60000);
      setTxt(m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [hasta]);
  return <>{txt}</>;
}

interface PlayerHomeProps {
  settings: CasinoSettings | null | undefined;
  datosIniciales: PlayerEstado;
  onSalir: () => void;
}

function PlayerHome({ settings, datosIniciales, onSalir }: PlayerHomeProps) {
  const [estado, setEstado] = useState<PlayerEstado>(datosIniciales);
  const [seccion, setSeccion] = useState<Seccion>('casino');
  const [filtro, setFiltro] = useState('');
  const [proveedorSel, setProveedorSel] = useState<string | null>(null);
  const [categorias, setCategorias] = useState<CategoriaJuegos[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorLobby[]>([]);
  const [top, setTop] = useState<Juego[]>([]);
  const [juegoAbierto, setJuegoAbierto] = useState<Juego | null>(null);
  const [avisoVerificar, setAvisoVerificar] = useState(false);
  const [vipAbierto, setVipAbierto] = useState(false);
  const [giroAbierto, setGiroAbierto] = useState(false);
  const [avisosCola, setAvisosCola] = useState<AvisoJugador[]>(() => datosIniciales.avisos || []);

  const jugadorId = estado.player.id;
  const [favoritos, setFavoritos] = useState<string[]>(() => leerFavoritos(jugadorId));
  const [recientes, setRecientes] = useState<string[]>(() => leerRecientes(jugadorId));

  const headerRef = useRef<HTMLElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);

  const nombre = settings?.casino_name || 'RivelBet';
  const hayPendiente = Boolean(estado.pendiente || estado.pendienteCarga);
  const todos = useMemo(() => categorias.flatMap((c) => c.juegos), [categorias]);

  const estadoVer = estado.player.estado_verificacion || 'sin_verificar';
  const verificado = estadoVer === 'verificado';
  const bonoRegistro = Number(estado.bonoRegistro || 0);
  const abrirVerif = () => {
    setAvisoVerificar(false);
    import('./verificacion.js').then(({ abrirVerificacion }) => abrirVerificacion(estado, refrescar));
  };

  const abrirRecargaPortal = () => {
    import('./recargar.js').then(({ abrirRecarga }) => abrirRecarga(null, refrescar, estado.cajeroWhatsapp, { pendienteCarga: estado.pendienteCarga }));
  };

  const vipData: VipData | null = (estado.vipNiveles?.length)
    ? { niveles: estado.vipNiveles, cargado: Number(estado.player.cargado_historico || 0), nivelId: estado.player.vip_nivel_id || null }
    : null;

  const vipInfo = useMemo(() => {
    if (!vipData) return null;
    const ord = [...vipData.niveles].sort((a, b) => a.orden - b.orden);
    const actual = ord.find((n) => n.id === vipData.nivelId) || ord[0];
    if (!actual) return null;
    const sig = ord.find((n) => n.orden > actual.orden);
    return { actual, falta: sig ? Math.max(0, sig.umbral - vipData.cargado) : 0, siguiente: sig || null };
  }, [vipData]);

  const giro = estado.giroDiario;
  const giroDisponible = verificado && Boolean(giro?.activo) && !giro?.giroHoy;
  const giroChip = verificado && giro?.activo
    ? { disponible: giroDisponible, proximoAt: giro.proximoAt, onTocar: () => setGiroAbierto(true) }
    : null;

  // Bono pegajoso activo (modo avanzado de billetera): cuánto falta apostar.
  const faltaBono = Number(estado.player.requisito_apuesta || 0);
  const bonoChip = faltaBono > 0 ? { falta: faltaBono } : null;

  const refrescar = async () => {
    const res = await playerFetch<PlayerEstado>('/api/player-sesion');
    if (res.ok) {
      setEstado(res.data);
      if (Array.isArray(res.data.avisos) && res.data.avisos.length) {
        setAvisosCola((prev) => {
          const ids = new Set(prev.map((a) => a.id));
          return [...prev, ...res.data.avisos!.filter((a) => !ids.has(a.id))];
        });
      }
      return;
    }
    // Sesión cortada mientras el jugador estaba adentro (ban, reseteo de
    // contraseña, token vencido): recargamos para que el arranque lo
    // mande al login con el motivo.
    if (res.expirado) window.location.reload();
  };

  useEffect(() => {
    prefetchCatalogo().then((res) => {
      if (res.ok) {
        setCategorias(res.data.categorias || []);
        setProveedores(res.data.proveedores || []);
        setTop(res.data.top || []);
      }
    });
  }, []);

  // Auto-refresh en vivo: mientras no haya un juego abierto, un
  // heartbeat liviano detecta cualquier cambio (saldo, verificación,
  // cashback, config…) y dispara el refetch solo cuando pasó algo.
  useEffect(() => {
    if (juegoAbierto) return;
    return iniciarHeartbeat({ playerId: jugadorId, onCambio: refrescar });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [juegoAbierto, jugadorId]);

  // Un solo listener para toda la vida de la pantalla, igual que antes:
  // togglear la clase a mano evita un re-render de React por cada pixel
  // scrolleado.
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const alScrollear = () => {
      header.classList.toggle('con-fondo', seccion !== 'casino' || window.scrollY > 24);
    };
    alScrollear();
    window.addEventListener('scroll', alScrollear, { passive: true });
    return () => window.removeEventListener('scroll', alScrollear);
  }, [seccion]);

  // renderSlot es todavía código imperativo (habla directo con el
  // proveedor y con /api/player-juego): le damos un div propio que
  // React nunca vuelve a tocar, en vez de migrarlo a mitad de camino.
  useEffect(() => {
    if (!juegoAbierto || !slotRef.current) return;
    const el = slotRef.current;
    const juego = juegoAbierto;
    import('./slot.js').then(({ renderSlot }) => {
      if (slotRef.current !== el) return;
      renderSlot(el, {
        juego,
        saldoInicial: Number(estado.player.balance),
        pagos: { tres: juego.pagos, dos: juego.pagosDos },
        onVolver: () => {
          setJuegoAbierto(null);
          refrescar();
        },
        onSaldo: (saldo: number) => {
          setEstado((e) => ({ ...e, player: { ...e.player, balance: saldo } }));
        },
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [juegoAbierto]);

  const abrirCuenta = () => {
    import('./panel-cuenta.js').then(({ abrirPanelCuenta }) => {
      abrirPanelCuenta({
        estado,
        onSalir,
        onCambio: refrescar,
        onRecargar: abrirRecargaPortal,
      });
    });
  };

  const alternarFav = (slug: string) => setFavoritos(alternarFavorito(jugadorId, slug));

  // Abrir un juego reemplaza toda la pantalla: la barra de saldo y la
  // navegación estorban mientras se juega.
  const abrirJuego = (juego: Juego) => {
    // Sin verificar no se puede jugar (el gate real también está en la
    // API): mostramos el aviso que lleva a verificar.
    if (!verificado) {
      setAvisoVerificar(true);
      return;
    }
    setRecientes(registrarReciente(jugadorId, juego.slug));
    setJuegoAbierto(juego);
  };

  if (juegoAbierto) {
    return <div ref={slotRef} />;
  }

  // Los mismos botones sirven para la barra de abajo (celular) y para
  // el menú del header (escritorio, ver .pt-nav-desktop en el CSS) —
  // un solo lugar donde tocar qué hace cada uno.
  const itemsNav: ItemNav[] = [
    { key: 'casino', etiqueta: 'Casino', icono: ICONOS.casino, activo: seccion === 'casino', onClick: () => setSeccion('casino') },
    { key: 'recargar', etiqueta: 'Recargar', icono: ICONOS.recargar, onClick: abrirRecargaPortal },
    { key: 'buscar', etiqueta: 'Buscar', icono: ICONOS.buscar, activo: seccion === 'buscar', onClick: () => setSeccion('buscar') },
    { key: 'cuenta', etiqueta: 'Cuenta', icono: ICONOS.cuenta, aviso: hayPendiente, onClick: abrirCuenta },
  ];

  const juegosFavoritos = favoritos
    .map((slug) => todos.find((j) => j.slug === slug))
    .filter((j): j is Juego => Boolean(j));

  const juegosRecientes = recientes
    .map((slug) => todos.find((j) => j.slug === slug))
    .filter((j): j is Juego => Boolean(j));

  return (
    <div className={`pt-app ${verificado ? '' : 'pt-no-verif'}`} onContextMenu={(e) => e.preventDefault()}>
      <style dangerouslySetInnerHTML={{ __html: ESTILOS_PORTAL.replace(/<\/?style>/g, '') }} />

      {estado.impersonadoPor && (
        <div className="pt-imp-banner">
          Viendo como el jugador — sesión abierta por {estado.impersonadoPor}
          <button onClick={onSalir}>Salir</button>
        </div>
      )}

      <header
        className="pt-header"
        ref={headerRef}
        style={estado.impersonadoPor ? { top: ALTURA_BANNER_IMPERSONACION } : undefined}
      >
        <div className="pt-header-top">
          <button className={`pt-logo ${hayPendiente ? 'con-aviso' : ''}`} onClick={abrirCuenta}>
            <img className="pt-logo-icon" src={urlLogoChico(urlLogo(settings))} alt="" draggable={false} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            {settings?.wordmark_url ? (
              <img className="pt-logo-nombre" src={urlWordmark(settings.wordmark_url)} alt={nombre} draggable={false} />
            ) : (
              <span>{nombre}</span>
            )}
          </button>

          {/* Mismos botones que la barra de abajo — en escritorio la
              barra de abajo se oculta y este menú la reemplaza. */}
          <BarraNav items={itemsNav} className="pt-nav-desktop" />

          <div className="pt-header-der">
            <div className="pt-saldo-chip" data-ficha={settings?.saldo_animacion_url ? (settings.saldo_animacion_posicion || 'antes') : undefined}>
              {settings?.saldo_animacion_url && settings.saldo_animacion_posicion !== 'despues' && (
                <IconoAnimado url={settings.saldo_animacion_url} className="pt-ficha-anim" />
              )}
              {formatMoney(estado.player.balance)}
              {settings?.saldo_animacion_url && settings.saldo_animacion_posicion === 'despues' && (
                <IconoAnimado url={settings.saldo_animacion_url} className="pt-ficha-anim" />
              )}
              <button className="pt-recargar" onClick={abrirRecargaPortal}>
                Recargar
              </button>
            </div>
          </div>
        </div>

        {(vipInfo || giroChip || bonoChip) && (
          <div className="pt-header-fila">
            {bonoChip && (
              <button className="pt-chip-bono" onClick={abrirCuenta}>
                <span className="pt-chip-bono-lbl">Bono · falta {formatMoney(bonoChip.falta)}</span>
              </button>
            )}
            {vipInfo && (
              <button
                className="pt-chip-vip"
                style={{ ['--gc' as string]: vipInfo.actual.color }}
                onClick={() => setVipAbierto(true)}
              >
                <GemaNivel nivel={vipInfo.actual} className="pt-chip-gema" />
                <span className="pt-chip-vip-nom">{vipInfo.actual.nombre}</span>
                <span className="pt-chip-vip-prog">
                  {vipInfo.siguiente ? `faltan ${formatMoney(vipInfo.falta)}` : 'nivel máximo'}
                </span>
              </button>
            )}
            {giroChip && (
              <button
                className={`pt-chip-giro ${giroChip.disponible ? 'activo' : 'usado'}`}
                onClick={giroChip.onTocar}
              >
                <IconoAnimado
                  url={giro?.icono_url}
                  className="pt-chip-giro-anim"
                  fallback={<span className="pt-chip-rueda" />}
                />
                <span className="pt-chip-giro-lbl">
                  {giroChip.disponible ? 'GIRÁ' : <GiroCuenta hasta={giroChip.proximoAt} />}
                </span>
              </button>
            )}
          </div>
        )}
      </header>

      <div className="pt-layout">
        <main className="pt-main">
          {seccion === 'casino' && (
            <VistaCasino
              nombre={nombre}
              categorias={categorias}
              top={top}
              proveedores={proveedores}
              proveedorSel={proveedorSel}
              onProveedor={setProveedorSel}
              favoritos={favoritos}
              juegosFavoritos={juegosFavoritos}
              juegosRecientes={juegosRecientes}
              onAbrir={abrirJuego}
              onAlternarFavorito={alternarFav}
              gate={!verificado ? { estadoVer, bono: bonoRegistro, onVerificar: abrirVerif } : null}
              cashback={estado.cashback ? { monto: Number(estado.cashback.monto), onCobrar: () => import('./cashback.js').then(({ abrirCashback }) => abrirCashback(estado, refrescar)) } : null}
            />
          )}
          {seccion === 'buscar' && (
            <VistaBuscar
              todos={todos}
              filtro={filtro}
              proveedores={proveedores}
              proveedorSel={proveedorSel}
              onProveedor={setProveedorSel}
              favoritos={favoritos}
              onFiltro={setFiltro}
              onAbrir={abrirJuego}
              onAlternarFavorito={alternarFav}
            />
          )}
        </main>

        {/* Solo visible en escritorio (ver .pt-sidebar en el CSS): en
            celular esta misma información ya está en "Cuenta". */}
        <PanelCuentaLateral
          estado={estado}
          onRecargar={abrirRecargaPortal}
        />
      </div>

      <BarraNav items={itemsNav} className="pt-nav" />

      {(!estado.cajeroWhatsapp || !estado.cajeroWhatsapp.soloWhatsapp) && (
        <SoporteFlotante
          animacionUrl={settings?.soporte_animacion_url}
          sinLeer={estado.soporteSinLeer || 0}
          onCambio={refrescar}
        />
      )}
      {estado.cajeroWhatsapp && (
        <a
          className={`chat-globo wa-globo${estado.cajeroWhatsapp.soloWhatsapp ? ' solo' : ''}`}
          href={estado.cajeroWhatsapp.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`WhatsApp de ${estado.cajeroWhatsapp.nombre}`}
        >
          <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
            <path d="M12.04 2.5A9.5 9.5 0 0 0 3.4 16.3L2.5 21.5l5.3-.9A9.5 9.5 0 1 0 12.04 2.5zm5.5 13.4c-.23.65-1.14 1.2-1.86 1.36-.5.11-1.14.2-3.32-.7-2.8-1.17-4.6-4.04-4.74-4.23-.14-.2-1.14-1.52-1.14-2.9 0-1.37.72-2.04.98-2.32.23-.25.62-.36.98-.36h.7c.23 0 .53-.08.82.63.3.73 1.02 2.5 1.1 2.68.1.18.14.4 0 .63-.13.23-.2.37-.4.57-.2.2-.41.44-.59.6-.18.14-.37.3-.16.6.2.28.9 1.48 1.93 2.4 1.33 1.18 2.45 1.55 2.8 1.72.34.16.54.14.74-.08.23-.25.98-1.14 1.24-1.53.26-.4.52-.32.86-.18.35.13 2.2 1.04 2.57 1.23.38.18.63.28.72.43.1.16.1.92-.13 1.57z" />
          </svg>
        </a>
      )}

      {vipAbierto && vipData && <VipDetalle vip={vipData} onCerrar={() => setVipAbierto(false)} />}

      {giroAbierto && estado.giroDiario && (
        <GiroModal estado={estado.giroDiario} onCerrar={() => setGiroAbierto(false)} onCambio={refrescar} />
      )}

      {!juegoAbierto && avisosCola[0] && (
        <AvisoAcreditacion
          aviso={avisosCola[0]}
          onCerrar={() => {
            const actual = avisosCola[0];
            setAvisosCola((c) => c.slice(1));
            if (actual?.id) {
              playerFetch('/api/player-sesion?recurso=avisos-leidos', {
                method: 'POST',
                body: { ids: [actual.id] },
              });
            }
          }}
        />
      )}

      {avisoVerificar && (
        <div className="pt-modal-fondo" onClick={(e) => { if (e.target === e.currentTarget) setAvisoVerificar(false); }}>
          <div className="pt-modal">
            <div className="pt-modal-lock" />
            <h4>Verificá tu identidad para jugar</h4>
            <p>
              {bonoRegistro > 0
                ? `Ya tenés ${formatMoney(bonoRegistro)} de bono en tu saldo. Subí 3 fotos y, cuando las aprobemos, podés abrir todos los juegos.`
                : 'Subí 3 fotos y, cuando las aprobemos, podés abrir todos los juegos.'}
            </p>
            <div className="pt-modal-acciones">
              <button className="secundario" onClick={() => setAvisoVerificar(false)}>Ahora no</button>
              <button onClick={abrirVerif}>Verificar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface GateInfo {
  estadoVer: string;
  bono: number;
  onVerificar: () => void;
}

function GateVerificar({ gate }: { gate: GateInfo }) {
  const rechazado = gate.estadoVer === 'rechazado';
  const pendiente = gate.estadoVer === 'pendiente';

  const titulo = rechazado
    ? 'Tu verificación fue rechazada'
    : pendiente
      ? 'Verificación en revisión'
      : gate.bono > 0
        ? `Verificá para usar tus ${formatMoney(gate.bono)}`
        : 'Verificá tu identidad para jugar';

  const sub = rechazado
    ? 'Reenviá tus fotos para poder jugar'
    : pendiente
      ? 'Te avisamos cuando esté lista'
      : 'Subí 3 fotos y empezá a jugar';

  return (
    <div className="pt-gate">
      <div className="pt-gate-info">
        <strong>{titulo}</strong>
        <span>{sub}</span>
      </div>
      <button onClick={gate.onVerificar}>{pendiente ? 'Ver estado' : 'Verificar'}</button>
    </div>
  );
}

interface ItemNav {
  key: string;
  etiqueta: string;
  icono: string;
  activo?: boolean;
  aviso?: boolean;
  onClick: () => void;
}

function BarraNav({ items, className }: { items: ItemNav[]; className: string }) {
  return (
    <nav className={className}>
      {items.map((item) => (
        <button
          key={item.key}
          className={[item.activo && 'is-active', item.aviso && 'con-aviso'].filter(Boolean).join(' ')}
          onClick={item.onClick}
        >
          <span className="icono" dangerouslySetInnerHTML={{ __html: item.icono }} /> {item.etiqueta}
        </button>
      ))}
    </nav>
  );
}

function PanelCuentaLateral({ estado, onRecargar }: { estado: PlayerEstado; onRecargar: () => void }) {
  const ultimoMovimiento: Movimiento | undefined = estado.movimientos?.[0];

  return (
    <aside className="pt-sidebar">
      <h4>Tu cuenta</h4>
      <div className="pt-sidebar-fila pt-sidebar-saldo">
        <span>Saldo</span>
        <strong>{formatMoney(estado.player.balance)}</strong>
      </div>
      {ultimoMovimiento && (
        <div className="pt-sidebar-fila">
          <span>Último {ultimoMovimiento.type === 'carga' ? 'carga' : 'retiro'}</span>
          <span>{formatMoney(ultimoMovimiento.amount)}</span>
        </div>
      )}
      {estado.pendienteCarga && (
        <div className="pt-sidebar-fila">
          <span>Carga pendiente</span>
          <span>{formatMoney(estado.pendienteCarga.amount)}</span>
        </div>
      )}
      {estado.pendiente && (
        <div className="pt-sidebar-fila">
          <span>En proceso de retiro</span>
          <span>{formatMoney(estado.pendiente.amount)}</span>
        </div>
      )}
      <button className="pt-sidebar-btn" onClick={onRecargar}>Recargar</button>
    </aside>
  );
}

/* --------------------------------------------------------- */

interface FilaJuegosProps {
  titulo: string;
  juegos: Juego[];
  fija?: boolean;
  favoritos: string[];
  onAbrir: (juego: Juego) => void;
  onAlternarFavorito: (slug: string) => void;
  eagerCount?: number;
}

function FilaJuegos({ titulo, juegos, fija, favoritos, onAbrir, onAlternarFavorito, eagerCount = 0 }: FilaJuegosProps) {
  if (!juegos.length) return null;
  return (
    <div className={`pt-seccion ${fija ? 'pt-seccion-fija' : ''}`}>
      <div className="pt-seccion-head">
        <h3>{titulo}</h3>
        <span>{juegos.length} juegos</span>
      </div>
      <div className="pt-juegos">
        {juegos.map((j, i) => (
          <GameCard
            key={j.slug}
            juego={j}
            favorito={favoritos.includes(j.slug)}
            onAbrir={onAbrir}
            onAlternarFavorito={onAlternarFavorito}
            prioridad={i < eagerCount}
          />
        ))}
      </div>
    </div>
  );
}

function claveProveedor(j: Juego) {
  return j.proveedor || 'propio';
}

function coincideJuego(j: Juego, q: string, proveedorSel: string | null, marcas: ProveedorLobby[]) {
  if (proveedorSel && claveProveedor(j) !== proveedorSel) return false;
  const t = q.trim().toLowerCase();
  if (!t) return true;
  if (j.nombre.toLowerCase().includes(t)) return true;
  if (claveProveedor(j).toLowerCase().includes(t)) return true;
  const marca = marcas.find((m) => m.clave === claveProveedor(j));
  return Boolean(marca && marca.nombre.toLowerCase().includes(t));
}

function BarraProveedores({
  proveedores, seleccionado, onElegir,
}: {
  proveedores: ProveedorLobby[];
  seleccionado: string | null;
  onElegir: (clave: string | null) => void;
}) {
  if (!proveedores.length) return null;
  return (
    <div className="pt-prov-bar" role="listbox" aria-label="Proveedores">
      {proveedores.map((p) => {
        const on = seleccionado === p.clave;
        const letra = (p.nombre || p.clave).charAt(0).toUpperCase();
        return (
          <button
            key={p.clave}
            type="button"
            className={`pt-prov-chip${on ? ' is-on' : ''}`}
            aria-pressed={on}
            onClick={() => onElegir(on ? null : p.clave)}
          >
            {p.iconoUrl
              ? <img className="pt-prov-ico" src={p.iconoUrl} alt="" draggable={false} />
              : <span className="pt-prov-ico letra">{letra}</span>}
            <span className="pt-prov-nom">{p.nombre}</span>
          </button>
        );
      })}
    </div>
  );
}

interface VistaCasinoProps {
  nombre: string;
  categorias: CategoriaJuegos[];
  top: Juego[];
  proveedores: ProveedorLobby[];
  proveedorSel: string | null;
  onProveedor: (clave: string | null) => void;
  favoritos: string[];
  juegosFavoritos: Juego[];
  juegosRecientes: Juego[];
  onAbrir: (juego: Juego) => void;
  onAlternarFavorito: (slug: string) => void;
  gate: GateInfo | null;
  cashback: { monto: number; onCobrar: () => void } | null;
}

function VistaCasino({
  nombre, categorias, top, proveedores, proveedorSel, onProveedor,
  favoritos, juegosFavoritos, juegosRecientes, onAbrir, onAlternarFavorito, gate, cashback,
}: VistaCasinoProps) {
  const bannersRef = useRef<HTMLDivElement>(null);
  const rec = juegosRecientes.filter((j) => coincideJuego(j, '', proveedorSel, proveedores));
  const fav = juegosFavoritos.filter((j) => coincideJuego(j, '', proveedorSel, proveedores));
  const topFiltrado = top.filter((j) => coincideJuego(j, '', proveedorSel, proveedores));

  useEffect(() => {
    // Los banners se cargan después de pintar la grilla: si la red está
    // lenta, el jugador ya ve los juegos en vez de una pantalla vacía.
    if (bannersRef.current) montarBanners(bannersRef.current, nombre);
  }, [nombre]);

  return (
    <>
      <div ref={bannersRef} />
      <BarraProveedores proveedores={proveedores} seleccionado={proveedorSel} onElegir={onProveedor} />

      {gate && <GateVerificar gate={gate} />}

      {cashback && (
        <button className="pt-cashback" onClick={cashback.onCobrar}>
          <div>
            <strong>Tenés {formatMoney(cashback.monto)} de cashback</strong>
            <span>Tocá para cobrarlo en fichas o pedir retiro</span>
          </div>
          <span className="pt-cashback-monto">{formatMoney(cashback.monto)}</span>
        </button>
      )}


      <FilaJuegos
        titulo="Recientes"
        juegos={rec}
        fija
        favoritos={favoritos}
        onAbrir={onAbrir}
        onAlternarFavorito={onAlternarFavorito}
        eagerCount={6}
      />
      <FilaJuegos
        titulo="Favoritos"
        juegos={fav}
        fija
        favoritos={favoritos}
        onAbrir={onAbrir}
        onAlternarFavorito={onAlternarFavorito}
      />
      <FilaJuegos
        titulo="Top 10"
        juegos={topFiltrado}
        fija
        favoritos={favoritos}
        onAbrir={onAbrir}
        onAlternarFavorito={onAlternarFavorito}
      />

      {categorias.length ? (
        categorias.map((cat, i) => (
          <FilaJuegos
            key={cat.titulo}
            titulo={cat.titulo}
            juegos={cat.juegos.filter((j) => coincideJuego(j, '', proveedorSel, proveedores))}
            favoritos={favoritos}
            onAbrir={onAbrir}
            onAlternarFavorito={onAlternarFavorito}
            eagerCount={i === 0 && !rec.length ? 9 : 0}
          />
        ))
      ) : (
        <p className="pt-vacio">Todavía no hay juegos disponibles.</p>
      )}
    </>
  );
}

interface VistaBuscarProps {
  todos: Juego[];
  filtro: string;
  proveedores: ProveedorLobby[];
  proveedorSel: string | null;
  onProveedor: (clave: string | null) => void;
  favoritos: string[];
  onFiltro: (valor: string) => void;
  onAbrir: (juego: Juego) => void;
  onAlternarFavorito: (slug: string) => void;
}

function VistaBuscar({
  todos, filtro, proveedores, proveedorSel, onProveedor, favoritos, onFiltro, onAbrir, onAlternarFavorito,
}: VistaBuscarProps) {
  const encontrados = todos.filter((j) => coincideJuego(j, filtro, proveedorSel, proveedores));

  return (
    <div className="pt-seccion">
      <input
        className="pt-buscar-input"
        placeholder="Buscar juego o proveedor"
        value={filtro}
        autoComplete="off"
        autoFocus
        onChange={(e) => onFiltro(e.target.value)}
      />
      <BarraProveedores proveedores={proveedores} seleccionado={proveedorSel} onElegir={onProveedor} />
      <div className="pt-juegos">
        {encontrados.length ? (
          encontrados.map((j) => (
            <GameCard
              key={j.slug}
              juego={j}
              favorito={favoritos.includes(j.slug)}
              onAbrir={onAbrir}
              onAlternarFavorito={onAlternarFavorito}
            />
          ))
        ) : (
          <p className="pt-vacio">No encontramos ese juego ni ese proveedor.</p>
        )}
      </div>
    </div>
  );
}

const roots = new WeakMap<Element, Root>();

/**
 * Mismo contrato que la versión anterior en JS: player/main.js sigue
 * llamando renderPlayerHome(container, { settings, datos, onSalir })
 * sin enterarse de que ahora es un árbol de React.
 */
export function renderPlayerHome(
  container: Element,
  { settings, datos, onSalir }: { settings: CasinoSettings | null | undefined; datos: PlayerEstado; onSalir: () => void }
) {
  let root = roots.get(container);
  if (!root) {
    root = createRoot(container);
    roots.set(container, root);
  }
  root.render(<PlayerHome settings={settings} datosIniciales={datos} onSalir={onSalir} />);
}
