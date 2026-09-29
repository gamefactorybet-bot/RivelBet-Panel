# Despliegue en tres proyectos

Un mismo repo, tres proyectos de Vercel. El jugador nunca llega al
panel: no es que esté escondido, es que **no existe** en su deploy.

| Proyecto | Dominio sugerido | Qué sirve | Tiene `/api` |
|---|---|---|---|
| Panel | `caja.win777.com` | Panel del staff + toda la API | Sí |
| Portal | `win777.com` | Portal del jugador, en la raíz | No |
| Juegos | `juegos.rubiplay.com` | Motores y manifiesto | Sí (más adelante) |

## Por qué el portal no lleva `/api`

Vercel toma las funciones de la carpeta `/api` del repo entero. Si el
portal se desplegara con ella, tendría los endpoints del staff
publicados en su dominio aunque el HTML no estuviera. Ocultar no es lo
mismo que no tener.

Por eso el portal se despliega **solo como sitio estático** y sus
llamadas van a la API del panel por URL absoluta (`VITE_API_BASE`).

## Paso a paso

### 1. Proyecto Panel

- Importá el repo en Vercel.
- **Build Command**: `npm run build:panel`
- Variables de entorno: todas las del `.env`, más:

```
VITE_APP_MODE=panel
ORIGENES_PERMITIDOS=https://win777.com
PORTAL_URL=https://win777.com
```

`ORIGENES_PERMITIDOS` es la lista (separada por comas) de dominios que
pueden llamar a la API desde un navegador. Sin esto, el portal en otro
dominio recibe error de CORS. **No pongas `*`**: cualquier sitio podría
hacer pedidos con el token del jugador desde el navegador de la víctima.

`PORTAL_URL` es la URL pública del portal (sin `/api`, es el proyecto
de abajo). La usa el botón "Entrar como jugador" de Jugadores > Ver
perfil para armar el enlace de acceso.

### 2. Proyecto Portal

- Importá el **mismo repo** en un proyecto nuevo.
- **Build Command**: `npm run build:portal`
- **Framework Preset**: Other (para que no busque funciones)
- Variables de entorno:

```
VITE_APP_MODE=portal
VITE_API_BASE=https://caja.win777.com
VITE_SUPABASE_URL=...          (misma que el panel)
VITE_SUPABASE_ANON_KEY=...     (misma que el panel)
VITE_CURRENCY_CODE=PYG
VITE_APP_NAME=Win777
```

El portal **no lleva** la service role key, ni el secreto de los tokens,
ni las claves de Cloudinary o Telegram. Nada de eso corre ahí.

Para que Vercel no publique las funciones en este proyecto, agregá un
`.vercelignore` con la línea `api` en la rama o carpeta que uses para el
portal. Alternativa más limpia: crear una rama `portal` sin la carpeta
`api` y apuntar ese proyecto a esa rama.

### 3. Proyecto Juegos

Cuando se separe el motor. Por ahora los juegos viven en el panel y el
manifiesto se publica en `caja.win777.com/api/manifest`.

## Los archivos de este directorio

`vercel.panel.json` y `vercel.portal.json` son plantillas. Copiá el que
corresponda a la raíz como `vercel.json` en la rama de cada proyecto, o
configurá lo mismo desde el panel de Vercel.

El del panel incluye `X-Robots-Tag: noindex`: no tiene sentido que
Google indexe la pantalla de login de tu caja.

## Verificación después de desplegar

1. Abrir `win777.com` → tiene que aparecer el login del jugador.
2. Abrir `win777.com/index.html` → **no** tiene que aparecer el panel.
3. Abrir `win777.com/api/listar-staff` → tiene que dar 404.
4. Entrar como jugador y hacer una recarga: si falla con error de CORS,
   revisar `ORIGENES_PERMITIDOS` en el proyecto del panel.
5. Abrir `caja.win777.com` → login del staff.
