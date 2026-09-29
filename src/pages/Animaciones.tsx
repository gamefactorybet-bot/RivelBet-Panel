import { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { apiFetch } from '../lib/api.ts';
import { subirAnimacion } from '../lib/subir-imagen.js';
import { puede } from '../lib/perfiles.js';
import type { Animacion, StaffProfile } from '../lib/types.js';
import type { AnimationItem } from 'lottie-web';

const ESTILOS = `
<style>
  .an-form { display: flex; gap: 20px; flex-wrap: wrap; align-items: flex-start; margin-top: 4px; }
  .an-form-campos { flex: 1; min-width: 220px; }
  .an-drop {
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    padding: 20px; border-radius: var(--radius);
    border: 1px dashed var(--border); background: var(--surface-alt-glass);
    color: var(--text-dim); font-size: 13px; cursor: pointer; margin-top: 10px;
  }
  .an-drop:hover { border-color: var(--accent); color: var(--accent); }
  .an-preview-caja {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    background: var(--surface-alt-glass); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 14px; width: 110px; flex-shrink: 0;
  }
  .an-preview-caja span { font-size: 11px; color: var(--text-dim); }
  .an-preview-caja .an-preview { width: 46px; height: 46px; }

  .an-lista { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
  .an-fila {
    display: flex; align-items: center; gap: 12px;
    padding: 10px; border-radius: var(--radius);
    background: var(--surface-alt-glass); border: 1px solid var(--border);
  }
  .an-fila-preview { width: 34px; height: 34px; flex-shrink: 0; }
  .an-fila-info { flex: 1; min-width: 0; }
  .an-fila-info strong { display: block; font-size: 14px; font-weight: 500; }
  .an-fila-info span { font-size: 12px; color: var(--text-dim); }
</style>
`;

/** Reproductor sin caché ni lazy-load: acá solo hay uno o dos a la vez
 * (el formulario y la lista), no cientos como en el lobby del jugador. */
function VistaPreviaLottie({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let instancia: AnimationItem | null = null;
    let cancelado = false;

    import('lottie-web').then(({ default: lottie }) => {
      if (cancelado) return;
      instancia = lottie.loadAnimation({ container: el, renderer: 'svg', loop: true, autoplay: true, path: url });
    });

    return () => {
      cancelado = true;
      instancia?.destroy();
    };
  }, [url]);

  return <div className="an-preview" ref={ref} />;
}

function Animaciones({ profile }: { profile: StaffProfile }) {
  const puedeEditar = puede(profile, 'ajustes');

  const [animaciones, setAnimaciones] = useState<Animacion[] | null>(null);
  const [errorLista, setErrorLista] = useState<string | null>(null);

  const [nombre, setNombre] = useState('');
  const [urlSubida, setUrlSubida] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cargar = async () => {
    const res = await apiFetch<{ animaciones: Animacion[] }>('/api/config?recurso=animaciones');
    if (res.ok) setAnimaciones(res.data.animaciones);
    else setErrorLista(res.error);
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onArchivo = async (archivo: File) => {
    setSubiendo(true);
    setProgreso(0);
    setMensaje(null);

    try {
      const { url } = await subirAnimacion(archivo, { onProgreso: setProgreso });
      setUrlSubida(url);
      if (!nombre.trim()) setNombre(archivo.name.replace(/\.json$/i, ''));
    } catch (err) {
      setMensaje(err instanceof Error ? err.message : 'No se pudo subir el archivo.');
    } finally {
      setSubiendo(false);
    }
  };

  const guardar = async () => {
    if (!nombre.trim() || !urlSubida) return;

    setGuardando(true);
    setMensaje(null);

    const res = await apiFetch<{ animacion: Animacion }>('/api/config?recurso=animaciones', {
      method: 'POST',
      body: { nombre: nombre.trim(), url: urlSubida },
    });

    setGuardando(false);

    if (!res.ok) {
      setMensaje(res.error);
      return;
    }

    setNombre('');
    setUrlSubida(null);
    setProgreso(null);
    cargar();
  };

  const eliminar = async (a: Animacion) => {
    const aviso = a.usos > 0
      ? `"${a.nombre}" se está usando en ${a.usos} juego${a.usos === 1 ? '' : 's'}. Si la borrás, esos juegos se quedan sin cartel. ¿Igual la borramos?`
      : `¿Borrar "${a.nombre}"?`;

    if (!window.confirm(aviso)) return;

    await apiFetch(`/api/config?recurso=animaciones&id=${a.id}`, { method: 'DELETE' });
    cargar();
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ESTILOS.replace(/<\/?style>/g, '') }} />

      <section className="card">
        <h2>Animaciones</h2>
        <p className="hint">
          Subí una vez cada animación (.json de Lottie) y elegila desde cualquier juego en
          "Juegos", sin volver a subir el archivo.
        </p>

        {puedeEditar && (
          <>
            <div className="an-form">
              <div className="an-form-campos">
                <label className="field">
                  Nombre
                  <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej: Confeti Bienvenida"
                  />
                </label>

                <label className="an-drop">
                  <input
                    type="file"
                    accept="application/json,.json"
                    hidden
                    onChange={(e) => {
                      const archivo = e.target.files?.[0];
                      if (archivo) onArchivo(archivo);
                      e.target.value = '';
                    }}
                  />
                  <strong style={{ fontWeight: 500 }}>{urlSubida ? 'Cambiar archivo' : 'Subir archivo .json'}</strong>
                  <small>Exportado de Lottie, hasta 3 MB</small>
                </label>

                {subiendo && progreso !== null && (
                  <div className="bn-barra"><span style={{ width: `${progreso}%` }} /></div>
                )}
              </div>

              {urlSubida && (
                <div className="an-preview-caja">
                  <span>Así se ve</span>
                  <VistaPreviaLottie url={urlSubida} />
                </div>
              )}
            </div>

            <div className="acciones">
              <button onClick={guardar} disabled={!nombre.trim() || !urlSubida || guardando}>
                {guardando ? 'Guardando...' : 'Guardar en la biblioteca'}
              </button>
            </div>
          </>
        )}

        {mensaje && <p className="hint error">{mensaje}</p>}

        <h3>Ya guardadas</h3>

        {errorLista && <p className="hint error">{errorLista}</p>}
        {!errorLista && !animaciones && <p className="hint">Cargando...</p>}
        {!errorLista && animaciones && !animaciones.length && (
          <p className="hint">Todavía no subiste ninguna.</p>
        )}

        {!errorLista && animaciones && animaciones.length > 0 && (
          <div className="an-lista">
            {animaciones.map((a) => (
              <div className="an-fila" key={a.id}>
                <div className="an-fila-preview"><VistaPreviaLottie url={a.url} /></div>
                <div className="an-fila-info">
                  <strong>{a.nombre}</strong>
                  <span>
                    {a.usos} juego{a.usos === 1 ? '' : 's'} · {a.creado_por || 'proveedor'}
                  </span>
                </div>
                {puedeEditar && (
                  <button className="secundario" onClick={() => eliminar(a)}>Eliminar</button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

const roots = new WeakMap<Element, Root>();

export function renderAnimaciones(container: Element, { profile }: { profile: StaffProfile }) {
  let root = roots.get(container);
  if (!root) {
    root = createRoot(container);
    roots.set(container, root);
  }
  root.render(<Animaciones profile={profile} />);
}
