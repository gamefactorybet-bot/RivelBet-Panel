// Moneda fija de este deploy, se define una sola vez vía VITE_CURRENCY_CODE
// (env var de Vercel), nunca cambia desde la app en producción.

interface Moneda {
  symbol: string;
  name: string;
  decimals: number;
}

const CURRENCIES: Record<string, Moneda> = {
  ARS: { symbol: '$', name: 'Peso argentino', decimals: 2 },
  PYG: { symbol: '₲', name: 'Guaraní', decimals: 0 },
  UYU: { symbol: '$U', name: 'Peso uruguayo', decimals: 2 },
  USD: { symbol: 'US$', name: 'Dólar', decimals: 2 },
};

const code = import.meta.env.VITE_CURRENCY_CODE || 'PYG';
export const currency: Moneda = CURRENCIES[code] || CURRENCIES.PYG;

export function formatMoney(amount: unknown): string {
  const n = Number(amount) || 0;
  return (
    currency.symbol +
    n.toLocaleString('es-AR', {
      minimumFractionDigits: currency.decimals,
      maximumFractionDigits: currency.decimals,
    })
  );
}
