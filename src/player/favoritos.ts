// Favoritos y recientes son solo del lado del jugador: no hace falta
// una tabla nueva ni pisar el saldo de nadie por esto. Se guardan en
// localStorage con el id del jugador en la clave, así en un equipo
// compartido no se mezclan los favoritos de una cuenta con otra.

const MAX_RECIENTES = 12;

function clave(jugadorId: string, tipo: 'favoritos' | 'recientes'): string {
  return `pt:${tipo}:${jugadorId}`;
}

function leer(jugadorId: string, tipo: 'favoritos' | 'recientes'): string[] {
  try {
    const crudo = localStorage.getItem(clave(jugadorId, tipo));
    const lista = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    // Modo privado, storage lleno o deshabilitado: la app sigue
    // funcionando, simplemente sin recordar favoritos/recientes.
    return [];
  }
}

function guardar(jugadorId: string, tipo: 'favoritos' | 'recientes', lista: string[]): void {
  try {
    localStorage.setItem(clave(jugadorId, tipo), JSON.stringify(lista));
  } catch {
    // Nada que hacer si el storage no acepta escrituras.
  }
}

export function leerFavoritos(jugadorId: string): string[] {
  return leer(jugadorId, 'favoritos');
}

export function alternarFavorito(jugadorId: string, slug: string): string[] {
  const actuales = leerFavoritos(jugadorId);
  const siguiente = actuales.includes(slug)
    ? actuales.filter((s) => s !== slug)
    : [...actuales, slug];
  guardar(jugadorId, 'favoritos', siguiente);
  return siguiente;
}

export function leerRecientes(jugadorId: string): string[] {
  return leer(jugadorId, 'recientes');
}

export function registrarReciente(jugadorId: string, slug: string): string[] {
  const siguiente = [slug, ...leerRecientes(jugadorId).filter((s) => s !== slug)].slice(0, MAX_RECIENTES);
  guardar(jugadorId, 'recientes', siguiente);
  return siguiente;
}
