// Catálogo de perfiles y permisos.
// Este archivo lo usan tanto el navegador (para mostrar/ocultar secciones)
// como las funciones de /api (para bloquear de verdad). La UI oculta,
// la API prohíbe: sin esa segunda capa, esconder un botón no protege nada.

export const PERMISOS = {
  ver_panel: 'Entrar al panel',
  cargar: 'Cargar fichas',
  retirar: 'Retirar fichas',
  crear_jugador: 'Crear jugadores',
  password_jugador: 'Cambiar contraseña de jugadores',
  ban_operativo: 'Aplicar ban de recargas y retiros',
  ban_permanente: 'Aplicar ban permanente',
  atender: 'Atender solicitudes y verificaciones del portal',
  soporte: 'Atender reclamos del chat',
  ver_historial: 'Ver el historial de eventos',
  ver_staff: 'Ver la lista de staff',
  gestionar_staff: 'Crear y editar staff',
  ajustes: 'Cambiar apariencia y ajustes',
  impersonar_jugador: 'Entrar al portal como un jugador',
  fabricar_fichas: 'Fabricar fichas en la bóveda',
  asignar_fichas: 'Asignar y devolver fichas a cajeros',
  ver_casa: 'Ver operación de la casa (solicitudes, cuentas, VIP…)',
};

export const PERFILES = {
  dios: {
    nombre: 'Dios admin',
    descripcion: 'Control total, incluido staff y ajustes',
    permisos: Object.keys(PERMISOS),
  },
  gerente: {
    nombre: 'Gerente',
    descripcion: 'Todo lo operativo y ve al staff, sin tocar ajustes',
    permisos: [
      'ver_panel', 'cargar', 'retirar', 'crear_jugador',
      'password_jugador', 'ban_operativo', 'ban_permanente',
      'atender', 'soporte', 'ver_historial', 'ver_staff', 'asignar_fichas',
      'ver_casa',
    ],
  },
  caja: {
    nombre: 'Cajero de caja',
    descripcion: 'Solicitudes, soporte y jugadores de la casa',
    permisos: [
      'ver_panel', 'cargar', 'retirar', 'crear_jugador',
      'password_jugador', 'ban_operativo', 'atender', 'soporte',
      'ver_historial',
    ],
  },
  cajero: {
    nombre: 'Cajero de mostrador',
    descripcion: 'Solo cargas y retiros manuales',
    permisos: [
      'ver_panel', 'cargar', 'retirar', 'crear_jugador',
      'password_jugador', 'ban_operativo',
    ],
  },
  externo: {
    nombre: 'Cajero externo',
    descripcion: 'Cartera propia: revendedor (compra fichas) o comisionista (% de la casa)',
    permisos: [
      'ver_panel', 'cargar', 'retirar', 'crear_jugador',
      'password_jugador', 'ban_operativo', 'ver_historial',
    ],
  },
  retiros: {
    nombre: 'Solo retiros',
    descripcion: 'Únicamente paga retiros, no carga',
    permisos: ['ver_panel', 'retirar', 'atender', 'ver_casa'],
  },
  consulta: {
    nombre: 'Consulta',
    descripcion: 'Solo mira, no mueve saldo',
    permisos: ['ver_panel', 'atender', 'ver_casa'],
  },
};

/**
 * Resuelve si alguien puede hacer algo.
 * Orden: excepción puntual en `permisos` > lo que dice el perfil.
 * Así podés sacarle la carga a un cajero puntual sin inventar un perfil nuevo.
 */
export function puede(staff, permiso) {
  if (!staff || staff.active === false) return false;

  const excepciones = staff.permisos || {};
  if (Object.prototype.hasOwnProperty.call(excepciones, permiso)) {
    return excepciones[permiso] === true;
  }

  const perfil = PERFILES[staff.perfil] || PERFILES.cajero;
  return perfil.permisos.includes(permiso);
}

/** Lista de permisos efectivos, ya resueltos, para mostrar en la UI. */
export function permisosEfectivos(staff) {
  return Object.keys(PERMISOS).filter((p) => puede(staff, p));
}

export const PERFIL_KEYS = Object.keys(PERFILES);

/** Cajero externo: mini-distribuidor, solo su cartera. */
export function esExterno(staff) {
  return staff?.perfil === 'externo';
}

/** Compra fichas con margen y paga los retiros de su cartera. */
export function esRevendedor(staff) {
  return esExterno(staff) && (staff?.externo_modo || 'revendedor') !== 'comisionista';
}

/** Trae jugadores; la casa cobra, paga y le liquida un %. */
export function esComisionista(staff) {
  return esExterno(staff) && staff?.externo_modo === 'comisionista';
}
