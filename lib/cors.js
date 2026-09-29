// Cabeceras para que el portal (otro dominio) pueda llamar a esta API.
//
// Solo se permiten los orígenes declarados en ORIGENES_PERMITIDOS: si
// dejáramos '*', cualquier sitio podría hacer pedidos con el token del
// jugador desde el navegador de la víctima.
const ORIGENES = (process.env.ORIGENES_PERMITIDOS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export function aplicarCors(req, res) {
  const origen = req.headers.origin;

  // Sin configuración, todo sigue igual que antes (mismo dominio).
  if (!ORIGENES.length) return false;

  if (origen && ORIGENES.includes(origen)) {
    res.setHeader('Access-Control-Allow-Origin', origen);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  // El navegador pregunta antes de mandar el pedido real
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }

  return false;
}
