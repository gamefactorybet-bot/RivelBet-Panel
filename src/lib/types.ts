// Tipos compartidos entre páginas del panel. Se van completando a
// medida que se migra cada pantalla a TypeScript — no hace falta
// tipar de una todo lo que existe en la base.

export interface CasinoSettings {
  id?: number;
  casino_name: string;
  logo_url?: string | null;
  wordmark_url?: string | null;
  bg_login_url?: string | null;
  bg_login_dim?: number | null;
  bg_panel_url?: string | null;
  bg_panel_dim?: number | null;
  bg_juegos_url?: string | null;
  bg_juegos_dim?: number | null;
  soporte_animacion_id?: string | null;
  soporte_animacion_url?: string | null;
  saldo_animacion_id?: string | null;
  saldo_animacion_url?: string | null;
  saldo_animacion_posicion?: 'antes' | 'grande' | 'despues';
  bono_registro?: BonoRegistro | null;
  referidos?: ReferidosConfig | null;
  [clave: string]: unknown;
}

export interface BonoRegistro {
  activo: boolean;
  monto: number;
  banner_url?: string | null;
  titulo: string;
  subtitulo: string;
  edad_minima: number;
  rollover?: number;
}

export interface ReferidosConfig {
  activo: boolean;
  bono_referidor: number;
  bono_referido: number;
  min_carga: number;
  rollover?: number;
}

// Interruptor maestro de la billetera. modo_avanzado = false => todo
// como hoy (un saldo, todo retirable).
export interface BilleteraConfig {
  modo_avanzado: boolean;
  retener_ganancias: boolean;
  rollover_carga?: number;
  apuesta_max_bono?: number;
  candado_primera_carga?: boolean;
}

export interface StaffProfile {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  perfil: string;
  [clave: string]: unknown;
}

export type ApiResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; expirado?: boolean };

export type Cartel =
  | { tipo: 'vip' | 'hot' | 'nuevo' }
  | { tipo: 'personalizado'; animacionUrl: string };

export interface Juego {
  slug: string;
  nombre: string;
  descripcion?: string | null;
  imagen_url?: string | null;
  video_url?: string | null;
  categoria: string;
  proveedor?: string | null;
  proveedorIcono?: string | null;
  proveedorNombre?: string | null;
  min_bet: number;
  max_bet: number;
  launch_url?: string | null;
  pagos?: Record<string, number>;
  pagosDos?: Record<string, number>;
  cartel?: Cartel | null;
  [clave: string]: unknown;
}

export interface ProveedorLobby {
  clave: string;
  nombre: string;
  slug: string;
  iconoUrl: string | null;
}

export interface Animacion {
  id: string;
  nombre: string;
  url: string;
  creado_por?: string | null;
  created_at: string;
  usos: number;
}

export interface CategoriaJuegos {
  titulo: string;
  juegos: Juego[];
}

export type EstadoVerificacion = 'sin_verificar' | 'pendiente' | 'verificado' | 'rechazado';

export interface PlayerInfo {
  id: string;
  player_number?: number;
  username: string;
  display_name?: string | null;
  balance: number;
  ban_retiros?: boolean;
  estado_verificacion?: EstadoVerificacion;
  retiro_bloqueado?: boolean;
  bono_por_descontar?: number;
  cargado_historico?: number;
  vip_nivel_id?: string | null;
  // Billetera modo avanzado (0 en modo simple).
  saldo_bono?: number;
  requisito_apuesta?: number;
  ganancia_bono?: number;
  [clave: string]: unknown;
}

export interface VerificacionInfo {
  id: string;
  estado: 'pendiente' | 'aprobada' | 'rechazada';
  motivo?: string | null;
  doc_tipo?: string;
  created_at: string;
}

export interface CashbackDisponible {
  id: string;
  monto: number;
  periodo_inicio: string;
  periodo_fin: string;
  vence_at?: string | null;
}

export interface GiroPremio { monto: number; peso: number; }

export interface GiroDiarioEstado {
  activo: boolean;
  premios: GiroPremio[];
  giroHoy: { premio: number; at: string } | null;
  proximoAt: string;
  icono_url?: string | null;
  tema?: string | null;
}

export interface AvisoJugador {
  id: string;
  tipo: 'carga' | 'referido' | string;
  payload: {
    carga?: number;
    bono?: number;
    total?: number;
    rol?: 'referidor' | 'referido' | string;
    de?: string;
    numero?: number;
    monto?: number;
  };
  created_at?: string;
}

export interface HitoProgreso {
  nombre: string;
  cada_cargas: number;
  min_por_carga: number;
  tipo: 'porcentaje' | 'fijo';
  ventana_dias: number;
  cargas_contadas: number;
  faltan: number;
  hitos_completados: number;
  proximo_valor: number;
  tope_conversion_mult?: number;
  vence_at?: string | null;
  banner_url?: string | null;
  banner_titulo?: string | null;
  banner_texto?: string | null;
}

export interface ReferidosResumen {
  activo: boolean;
  bono: number;
  codigo: string;
  invitados: number;
  pagados: number;
  ganado: number;
}

export interface VipNivel {
  id: string;
  nombre: string;
  color: string;
  orden: number;
  umbral: number;
  cashbackPct: number;
  giroMult: number;
  bonoCumple: number;
  bonoMensual: number;
  retiroEsperaHoras?: number;
  imagenUrl: string | null;
  animacionUrl: string | null;
}

export interface Movimiento {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  note?: string | null;
  created_at: string;
}

export interface SolicitudPendiente {
  id: string;
  amount: number;
  estado: string;
  created_at: string;
}

export interface PlayerEstado {
  player: PlayerInfo;
  movimientos?: Movimiento[];
  pendiente?: SolicitudPendiente | null;
  pendienteCarga?: SolicitudPendiente | null;
  soporteSinLeer?: number;
  cajeroWhatsapp?: {
    nombre: string;
    numero: string;
    url: string;
    soloWhatsapp: boolean;
  } | null;
  verificacion?: VerificacionInfo | null;
  // Cuánto tiene que cargar (en una sola carga) para desbloquear el
  // retiro. 0 = sin candado.
  bonoRegistro?: number;
  cashback?: CashbackDisponible | null;
  giroDiario?: GiroDiarioEstado | null;
  referidos?: ReferidosResumen | null;
  billetera?: BilleteraConfig | null;
  hitos?: HitoProgreso[];
  vipNiveles?: VipNivel[];
  avisos?: AvisoJugador[] | null;
  retiroEspera?: {
    horas: number;
    ultimoAt?: string | null;
    disponibleAt: string | null;
    segundosRestantes: number;
    nivelNombre: string | null;
  } | null;
  // Email del cajero que abrió esta sesión desde el panel, si la abrió
  // un cajero. null en una sesión normal del jugador.
  impersonadoPor?: string | null;
  [clave: string]: unknown;
}
