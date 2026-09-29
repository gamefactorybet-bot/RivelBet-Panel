import { playerFetch } from './api.ts';
import type { ApiResult, CategoriaJuegos, Juego, ProveedorLobby } from '../lib/types.js';

export type Catalogo = { categorias: CategoriaJuegos[]; proveedores?: ProveedorLobby[]; top?: Juego[] };

let pendiente: Promise<ApiResult<Catalogo>> | null = null;

/** Arranca el catálogo apenas hay token, sin esperar a pintar el home. */
export function prefetchCatalogo() {
  if (!pendiente) pendiente = playerFetch<Catalogo>('/api/player-juego');
  return pendiente;
}

export function invalidarCatalogo() {
  pendiente = null;
}
