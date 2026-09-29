# Panel de Caja — Win777

Panel de caja para casino. El cajero busca al jugador y le carga o retira fichas
en el momento, sin comprobantes ni cola de aprobación.

Repo plantilla: cada país se despliega desde una copia independiente
(GitHub → "Use this template"), con su propio Supabase y su propia moneda.

## Instalación

### 1. Base de datos

En el SQL Editor de Supabase, ejecutá los archivos de `sql/` **en orden**.
Todos son repetibles: se pueden volver a correr sin romper nada.

> Después de crear o reemplazar una función, corré
> `notify pgrst, 'reload schema';`. PostgREST cachea el esquema y hasta
> que no lo refresques, las llamadas `.rpc()` desde `/api` siguen usando
> la versión vieja (o fallan diciendo que la función no existe).


1. `schema.sql` — staff, jugadores, movimientos y la función atómica
2. `02_settings.sql` — apariencia (tema + plantilla)
3. `03_password_resets.sql` — auditoría de contraseñas
4. `04_bans.sql` — historial de restricciones
5. `05_backgrounds.sql` — imágenes de fondo
6. `06_transparencia.sql` — opacidad y desenfoque
7. `07_perfiles_staff.sql` — perfiles y permisos del staff
8. `08_portal_jugador.sql` — solicitudes de retiro del portal
9. `09_cuentas_bancarias.sql` — cuentas para cobrar y solicitudes de carga
10. `10_comprobantes.sql` — comprobantes en Cloudinary y avisos de Telegram
11. `11_banners.sql` — banners del portal del jugador
12. `12_bonos.sql` — bonos por carga (reemplaza `aprobar_deposito`)
13. `13_historial.sql` — vista de eventos para el historial
14. `14_rotacion.sql` — rotación de cuentas bancarias
15. `15_soporte.sql` — chat de reclamos
16. `16_slots.sql` — catálogo de juegos y rondas de slot
17. `17_rendimiento.sql` — RLS optimizado e índices
18. `18_operacion.sql` — zona horaria, anulaciones, idempotencia, cierre de caja
19. `19_catalogo.sql` — configuración de juegos en la base y sincronización
20. `20_sesiones.sql` — corte de sesión al banear
21. `21_proveedores.sql` — proveedores externos de juegos, apostar/premiar en dos fases
22. `20_sincronizar_atomico.sql` — corrige una condición de carrera en `sincronizar_juego`
23. `27_retiro_metodo_cobro.sql` — método de cobro y resguardo de saldo en los retiros

### 2. Primer admin

Los cajeros se crean desde el panel, pero el primer admin hay que crearlo a mano:

1. Supabase → Authentication → Users → Add user (email + contraseña, marcá "Auto Confirm")
2. Copiá el UUID que quedó y corré en el SQL Editor:

```sql
insert into staff_profiles (id, email, display_name, role, perfil)
select id, email, 'Admin', 'admin', 'dios'
from auth.users
where email = 'tu-email@ejemplo.com';
```

Desde ahí ya podés entrar y crear el resto del staff desde la pantalla de Cajeros.

### 3. Local

```bash
npm install
npm run dev
```

El `.env` ya viene con los datos de Supabase cargados.

### 4. Vercel

> Para producción se despliegan **tres proyectos** desde este mismo
> repo, así el jugador nunca llega al panel. El paso a paso está en
> [`deploy/README.md`](deploy/README.md). Lo de abajo sirve para un
> deploy único de prueba.

Cargá estas variables en Settings → Environment Variables:

| Variable | Valor |
|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto |
| `VITE_SUPABASE_ANON_KEY` | anon / publishable key |
| `VITE_CURRENCY_CODE` | `PYG`, `ARS`, `UYU` o `USD` |
| `VITE_APP_NAME` | nombre del casino |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key (solo servidor) |
| `PLAYER_JWT_SECRET` | firma de las sesiones de jugadores (solo servidor) |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | subida de comprobantes (solo servidor) |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | fallback si un canal no tiene bot propio (solo servidor) |
| `TELEGRAM_CARGAS_BOT_TOKEN` / `TELEGRAM_CARGAS_CHAT_ID` | recargas y su resolución |
| `TELEGRAM_RETIROS_BOT_TOKEN` / `TELEGRAM_RETIROS_CHAT_ID` | retiros (y cashback) y su resolución |
| `TELEGRAM_SOPORTE_BOT_TOKEN` / `TELEGRAM_SOPORTE_CHAT_ID` | reclamo abierto / cerrado |
| `TELEGRAM_ALTAS_BOT_TOKEN` / `TELEGRAM_ALTAS_CHAT_ID` | registro y verificación pendiente |
| `TELEGRAM_ALERTAS_BOT_TOKEN` / `TELEGRAM_ALERTAS_CHAT_ID` | posible abuso de bono |

La service role key va **únicamente acá**, nunca en el repo.

## Secciones

| Sección | Quién | Qué hace |
|---|---|---|
| Inicio | Todos | Saldo total, jugadores activos, movimientos del día |
| Cargas | Todos | Buscar jugador y cargarle fichas |
| Retiros | Todos | Buscar jugador y retirarle fichas |
| Jugadores | Todos | Buscador, perfil, historial y restricciones |
| Crear usuario | Todos | Alta de jugador con contraseña y saldo inicial |
| Contraseñas | Todos | Resetear la contraseña de un jugador |
| Solicitudes | `cargar` / `retirar` | Aprobar o rechazar cargas y retiros del portal |
| Juegos | `ver_panel` (editar: `ajustes`) | Catálogo de slots, límites de apuesta y retorno real |
| Soporte | `soporte` | Bandeja de reclamos y chat con los jugadores |
| Cierre de caja | `ver_historial` | Resumen por cajero y margen de juegos del período |
| Historial | `ver_historial` | Todos los eventos del sistema, filtrables y exportables |
| Cuentas | `ver_panel` (editar: `ajustes`) | Cuentas bancarias que ve el jugador al recargar |
| Banners | `ajustes` | Imágenes que rotan arriba en el portal del jugador |
| Bonos | `ajustes` | Reglas de bono por monto de carga |
| Equipo | permiso `ver_staff` | Alta y edición de staff, perfiles y permisos |
| Ajustes | permiso `ajustes` | Tema, plantilla, fondos, transparencia y nombre |

Las secciones del menú aparecen según los permisos de cada persona.

## Restricciones (bans)

Tres bans independientes por jugador:

- **Ban de recargas** — no se le puede cargar. Lo aplica cualquier cajero.
- **Ban de retiros** — no se le puede retirar. Lo aplica cualquier cajero.
- **Ban permanente** — ningún movimiento. Solo admin.

Se validan dentro de `wallet_movimiento()` en Postgres, no solo en la interfaz:
aunque alguien llame la API directo salteándose la pantalla, el ban igual frena
la operación.

Cada cambio queda registrado en `ban_history` con quién, cuándo y por qué.

## Cómo se guarda el saldo

Ninguna escritura de saldo pasa por el navegador. El flujo es:

```
navegador -> /api/movimiento (valida el token del cajero)
          -> wallet_movimiento() en Postgres
             |- bloquea la fila del jugador (FOR UPDATE)
             |- valida bans y saldo suficiente
             |- actualiza el saldo
             `- inserta el movimiento en balance_transactions
```

Todo en una sola transacción: si dos cajeros tocan al mismo jugador al mismo
tiempo, el segundo espera al primero y lee el saldo ya actualizado. Nunca se
pisan.

`balance_transactions` no se borra ni se edita nunca — es el libro que permite
auditar cualquier diferencia después.


## Perfiles y permisos

Cinco perfiles predefinidos (definidos en `src/lib/perfiles.js`):

| Perfil | Para quién |
|---|---|
| Dios admin | Control total, incluido staff y ajustes |
| Gerente | Todo lo operativo y ve al staff, sin tocar ajustes |
| Cajero | Carga, retira, crea jugadores y aplica bans operativos |
| Solo retiros | Únicamente paga retiros |
| Consulta | Solo mira, no mueve saldo |

Además de elegir un perfil, se puede activar o desactivar cualquier permiso
suelto por persona. Esas excepciones se guardan en `staff_profiles.permisos`
y pisan lo que dice el perfil, así no hace falta inventar un perfil nuevo
para un caso puntual.

**El menú oculta lo que la persona no puede hacer, pero eso no es la
seguridad.** Cada endpoint de `/api` valida el permiso por su cuenta con
`requirePermiso()`, y la función `wallet_movimiento()` en Postgres valida
los bans. Ocultar un botón no protege nada por sí solo.

Dos candados para no quedarse afuera del panel: nadie puede desactivar su
propia cuenta, cambiarse su propio perfil, ni quitarse el permiso de
gestionar staff.


## Portal del jugador

Vive en el mismo repo, en `/jugador` (archivo `jugador.html`). Usa el mismo
tema, el mismo logo y la imagen de fondo del panel, leídos de
`casino_settings`.

### Por qué no usa Supabase Auth

Supabase Auth exige un email y los jugadores entran con nombre de usuario.
Se podría inventar un email falso (`usuario@players.local`), pero eso deja
la contraseña viviendo en dos lugares — `auth.users` y
`players.password_hash` — y cada reseteo desde el panel tendría que tocar
los dos o se desincronizan.

En su lugar, `/api/player-login` verifica el bcrypt que ya está en `players`
y devuelve un JWT propio firmado con `PLAYER_JWT_SECRET` (HMAC-SHA256, sin
dependencias nuevas), válido 12 horas. Una sola fuente de verdad para la
contraseña, y resetearla desde el panel sigue funcionando igual.

### Retiros

El jugador **no mueve su propio saldo**. Deja una solicitud, y un cajero la
aprueba desde la sección Solicitudes del panel. Recién ahí se ejecuta
`aprobar_retiro()`, que bloquea la fila, verifica que siga pendiente y llama
a `wallet_movimiento()` — la misma puerta por la que pasan los movimientos
hechos a mano.

Tres protecciones:

- Un índice único permite **una sola solicitud pendiente por jugador**, así
  nadie pide 100 tres veces con saldo de 100.
- El saldo se valida al pedir *y* al aprobar, porque entre una cosa y la
  otra el jugador pudo haber jugado.
- Si dos cajeros aprueban el mismo pedido a la vez, el segundo encuentra el
  estado ya cambiado y falla sin pagar de nuevo.

El login devuelve el mismo mensaje exista o no el usuario, para que nadie
pueda averiguar qué nombres están registrados.


## Flujo de carga (recarga del jugador)

1. Un admin carga las cuentas bancarias en **Cuentas** (banco, titular,
   número, alias y, opcionalmente, el documento).
2. El jugador toca **Recargar** en el portal, elige la cuenta y copia los
   datos con un toque.
3. Transfiere desde su banco, fuera del sistema.
4. Vuelve al portal y avisa cuánto transfirió.
5. El cajero ve el pedido en **Solicitudes → Cargas**, confirma contra el
   extracto bancario y acredita.

Al acreditar, el cajero puede **corregir el monto**: si el jugador declaró
50.000 pero transfirió 45.000, se acredita lo que realmente entró. El
`prompt` viene precargado con lo declarado.

Igual que con los retiros: una sola carga pendiente por jugador (índice
único), y `aprobar_deposito()` bloquea la fila antes de acreditar, así dos
cajeros aprobando a la vez no acreditan dos veces.

El documento del titular (CI, DNI, RUC, CUIT) solo se le muestra al jugador
si el panel lo marcó explícitamente — algunos bancos lo piden para
transferir y otros no, y no tiene sentido exponerlo de más.


## Comprobantes y Telegram

### Cloudinary

La subida va del navegador **directo a Cloudinary**. `/api/cloudinary-firma`
decide el modo según lo que haya en el `.env`:

- **Firmado** (si están `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET`):
  el servidor emite una firma de un solo uso. Solo un jugador logueado
  consigue permiso y la carpeta la decide el servidor.
- **Preset sin firmar** (si solo hay `VITE_CLOUDINARY_CLOUD` y
  `VITE_CLOUDINARY_PRESET`): funciona igual, pero el nombre del preset
  queda visible en el navegador, así que cualquiera que lo vea puede subir
  archivos a la cuenta. Sirve para beta; conviene migrar al modo firmado
  antes de producción.

En los dos casos el archivo se guarda en `comprobantes/<usuario>`.

El archivo no pasa por las funciones serverless: así se esquiva el límite
de tamaño de request de Vercel y la subida es más rápida desde un celular.
Acepta imágenes y PDF de hasta 8 MB, con barra de progreso.

### Telegram

Cuatro canales, cada uno con bot y grupo propios:

| Canal | Avisos |
|---|---|
| Cargas | solicitud de recarga (comprobante como foto) y ACREDITADO / RECHAZADO |
| Retiros | solicitud de retiro (jugador o cashback) y PAGADO / RECHAZADO |
| Soporte | reclamo abierto y reclamo cerrado (sin el contenido del chat) |
| Altas | jugador nuevo y verificación pendiente / reenvío |
| Alertas | posible abuso de bono (cargó con promo y casi no jugó) |

La resolución de una carga o retiro se manda **respondiendo al mensaje
original** — por eso guardamos `telegram_message_id` — y **siempre al
mismo canal** que el pedido. Si la recarga va a un grupo y la resolución
a otro, se rompe el hilo.

Si un canal no tiene `TELEGRAM_<CANAL>_BOT_TOKEN` / `_CHAT_ID`, cae a
`TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`. Así un deploy que todavía no
migró sigue avisando en el grupo único.

Todo el envío está en try/catch y ocurre **después** de guardar en la base.
Si el bot está caído, la solicitud queda registrada igual: un aviso perdido
es molesto, perder una carga sería mucho peor.

Para sacar el chat id de un grupo: agregá el bot, mandá cualquier mensaje
y abrí `https://api.telegram.org/bot<TU_TOKEN>/getUpdates`. El número de
un grupo es negativo y arranca con `-100`. Podés reutilizar el mismo bot
en varios grupos (cambiando solo el CHAT_ID) o un bot distinto por canal.

Si no cargás ninguna de estas variables, el resto sigue funcionando: no se
manda el aviso, pero cargas y retiros andan igual.

Cada nivel VIP tiene **espera entre retiros** (horas). El más bajo arranca
en 24 h y se baja en los niveles altos. El primer retiro de la cuenta no
espera; el reloj arranca cuando un cajero **aprueba** uno. 0 = sin espera.

Si en ese ciclo el jugador cargó con bono y casi no jugó, el retiro se
marca y sale un aviso al canal de **Alertas**. No se bloquea: el cajero
decide. Corré `sql/60_retiro_vip_abuso.sql` y `notify pgrst, 'reload schema';`.


## Banners del portal

Se administran desde la sección **Banners** del panel (permiso `ajustes`).
La imagen se sube a Cloudinary con barra de progreso, o se pega una URL
externa si ya está alojada en otro lado.

Cada banner acepta título, subtítulo, un enlace al tocarlo, un orden y
fechas de vigencia opcionales — útiles para dejar programada una promo que
arranca el viernes y termina el domingo sin que nadie tenga que activarla.

En el portal rotan cada 6 segundos, con puntos de posición y deslizables
con el dedo. Con uno solo no rotan. Si no hay ninguno cargado, aparece el
banner de texto por defecto: la pantalla nunca queda con un hueco.

Los banners se piden **después** de pintar la grilla de juegos, así una red
lenta no deja al jugador mirando una pantalla en blanco.

Medida recomendada: 1200x525 px (16:7). El carrusel usa `object-fit:
contain`, no `cover`: la imagen se ve entera y nunca se recorta. Eso es
para que un PNG con fondo transparente funcione como corresponde — al no
recortarse y no tener caja detrás, la pieza queda flotando sobre el fondo
del portal y da sensación de relieve.

El banner se mete por detrás del encabezado, que arranca transparente y
toma fondo recién cuando el jugador scrollea. Así el banner se ve completo
al abrir, y el saldo no queda ilegible sobre la imagen al bajar.

### Los cinco archivos llamados "banners"

| Archivo | Qué hace |
|---|---|
| `sql/11_banners.sql` | La tabla |
| `api/banners.js` | Alta, edición y borrado (staff) |
| `api/player-banners.js` | Lectura para el portal, solo los vigentes |
| `src/pages/banners.js` | Pantalla del panel |
| `src/player/banners.js` | Carrusel del portal |


## Bonos por carga

Se configuran en la sección **Bonos** (permiso `ajustes`). Cada regla define:

- **Tipo**: porcentaje del monto o monto fijo.
- **Tramo**: desde y hasta qué monto aplica (el "hasta" puede quedar vacío).
- **Tope**: para reglas de porcentaje, el máximo que puede dar el bono.
- **Alcance**: todas las cargas, o solo la primera del jugador.
- **Vigencia y orden**: fechas opcionales, y si un monto encaja en varias
  reglas gana la de orden más bajo.

El formulario incluye un simulador que muestra cuánto daría el bono con
montos de ejemplo, para no tener que hacer la cuenta a mano.

### Cómo se aplica

El jugador ve el bono mientras escribe el monto en la hoja de recarga
(`/api/player-bono`), pero eso es solo informativo. **El bono real lo
calcula `calcular_bono()` en Postgres al aprobar**, sobre el monto que
realmente entró al banco. Si el jugador declaró 100.000 y transfirió
80.000, el cajero corrige el monto y el bono baja solo.

El cajero no puede modificar el bono: si la regla dice 20%, es 20%.

El bono se acredita como **un movimiento aparte** en `balance_transactions`,
con la nota "Bono: <nombre>". Así el extracto bancario cuadra contra la
carga sola, y queda identificado por separado cuánto se regaló en
promociones.


## Historial de eventos

Reúne en una sola pantalla los movimientos de saldo, los rechazos de
solicitudes, los bans, las altas de jugadores, los reseteos de contraseña y
los cambios de staff.

Se apoya en la vista `vista_eventos`, que une seis consultas sobre las
tablas que ya existen. Es una vista, no una tabla: no duplica datos ni
agrega escrituras a las operaciones de caja.

**El doble conteo está contemplado.** Una carga aprobada desde el portal
deja rastro en `balance_transactions` y en `deposit_requests`. La vista toma
el movimiento de `balance_transactions` — que es la verdad del dinero — y de
las solicitudes solo los **rechazos**, que no generan movimiento y de otro
modo quedarían invisibles.

Permiso `ver_historial`: lo tienen Dios admin y Gerente. Un cajero no ve lo
que hicieron sus compañeros.

La exportación a CSV respeta los filtros que estén aplicados en pantalla y
baja hasta 5000 filas. Lleva BOM para que Excel abra bien los acentos y el
símbolo del guaraní.


## Rotación de cuentas

Se configura en la sección **Cuentas**. Tres modos:

| Modo | Cómo elige |
|---|---|
| Por monto | La cuenta que menos recibió en el período. Desempata la menos usada. |
| Por turnos | Round-robin: la siguiente en el campo `orden`, una después de la otra. |
| Sin rotación | El jugador ve todas y elige (comportamiento original). |

En los dos modos con rotación **el jugador ve una sola cuenta**. Es lo que
hace que el reparto funcione: si ve varias y elige, siempre va a usar la
misma y el balance se rompe.

**Los totales suman al aprobar, no al pedir.** Si sumaran al pedir, alguien
que abre la pantalla y no transfiere igual desbalancearía el reparto.

**La cuenta queda fijada a la solicitud** (`deposit_requests.account_id`) en
el momento en que el jugador la ve. Si transfiere media hora después y la
rotación ya avanzó, el cajero igual sabe a qué banco mirar.

**Techo por cuenta** (`tope_periodo`, opcional): al llegar a ese monto la
cuenta sale de la rotación hasta el próximo reinicio.

**Reinicio de contadores**: diario, mensual o nunca. Conviene diario — sin
reinicio, una cuenta nueva se lleva todas las cargas hasta emparejar con
las viejas. El histórico no se pierde: los totales se calculan sobre
`deposit_requests`, que nunca se borra.

Si todas las cuentas llegaron a su techo, el portal avisa que no hay
cuentas disponibles en vez de mostrar una vacía.


## Chat de soporte

Pensado para reclamos, no para charla. Por eso cada conversación tiene
**estado**, y no es un hilo infinito:

| Estado | Qué significa |
|---|---|
| Abierto | El jugador escribió, nadie contestó todavía |
| En curso | Un cajero ya respondió |
| Resuelto | Atendido. Si el jugador vuelve a escribir, se reabre solo |
| Cerrado | Archivado, no admite más mensajes hasta reabrirlo |

La barra superior de la conversación muestra el estado, quién lo está
atendiendo, cuándo se abrió y cuándo se resolvió, con los botones para
marcarlo resuelto o cerrarlo.

**Un reclamo abierto por jugador** (índice único). Si tuviera varios, la
bandeja se llenaría de hilos sueltos sobre el mismo tema.

**El reclamo se engancha a la solicitud** cuando es sobre plata: el cajero
ve el monto, el estado y el comprobante arriba de la conversación, sin ir a
buscarlos a otra pantalla.

Los cambios de estado quedan como mensajes de sistema dentro de la
conversación, así se lee la historia completa.

Al canal de Telegram de soporte solo llegan dos avisos: **reclamo abierto**
y **reclamo cerrado**, con el jugador y el motivo. El contenido de la
conversación no se manda — puede tener datos del jugador, y la charla se
lee en el panel.

### Por qué consulta cada 6 segundos y no usa Realtime

Supabase Realtime necesita que el cliente se identifique con una sesión de
Supabase Auth para aplicar RLS. Los jugadores entran con un JWT propio, no
con Supabase Auth, así que del lado del portal no se puede suscribir sin
abrir la tabla. Con el volumen de un casino, una consulta cada 6 segundos
mientras la pantalla está abierta cuesta poco y funciona igual en los dos
lados. Si más adelante conviene, se puede migrar solo el panel del staff.


## El slot

Clásico de 3 rodillos, una línea de pago (la fila del medio), con
comodín que reemplaza a cualquier símbolo.

### El azar vive en el servidor

`api/_slot-engine.js` resuelve el giro con `crypto.randomInt`, y recién
después `slot_jugada()` mueve el saldo en una sola transacción. El
navegador manda cuánto apuesta y recibe la grilla ya resuelta: solo la
anima.

Esto no es un detalle de estilo. Si el resultado se calculara en el
cliente, cualquiera con las herramientas de desarrollo se regalaría
premios. Por la misma razón los límites de apuesta se validan en la API
y no en la pantalla.

`Math.random()` no se usa: es predecible si alguien conoce el estado del
generador, y en un juego de plata eso es un agujero.

### La tabla de pagos está calibrada

Con los pesos de los rodillos y la tabla actual, el retorno teórico
(RTP) es **91.8%** y hay premio en **1 de cada 4.6 giros**. Verificado
con una simulación de 3.000.000 de giros: 91.95%.

La tabla está elegida a propósito de **baja volatilidad**: el premio
mayor es 330x en vez de un 720x, y esa plata se repartió en los premios
medios. La razón no es matemática sino de caja: con pocos jugadores, un
premio enorme puede dejarte sin efectivo el día que salga, y no poder
pagar en el momento cuesta más que todo lo que se gana con premios
grandes.

Subir el retorno **no** hace el juego más estable — al contrario. Para
devolver más plata hay que agrandar los premios, y eso concentra todavía
más el resultado en pocos golpes. Las dos palancas son independientes:
el retorno define cuánto queda a la larga, la volatilidad define cuánto
se mueve el día a día.

**Si tocás un peso o un pago, el retorno cambia.** Recalculalo antes de
publicar: una tabla mal calibrada regala plata o funde al jugador en
veinte giros, y las dos cosas son igual de malas para el negocio.

### Las rondas no van al libro de caja

`game_rounds` guarda cada giro con saldo antes y después.
`balance_transactions` queda solo para cargas y retiros: miles de giros
por día lo volverían ilegible y el arqueo de caja perdería sentido.

La pantalla **Juegos** del panel muestra el retorno real de cada título
contra el teórico. Con menos de 500 giros la cifra no significa nada y
la pantalla lo aclara.


## Rendimiento

Cuatro cosas que importan a medida que crece el volumen, sobre todo
teniendo en cuenta que van a ser tres despliegues (panel, portal y
juegos) sobre la misma base.

### RLS: la función `es_staff()`

Las políticas hacían `exists (select 1 from staff_profiles ...)`, y eso
se evalúa **una vez por fila devuelta**: listar 1.000 rondas disparaba
1.000 subconsultas idénticas.

Ahora la verificación vive en `es_staff()`, marcada `stable`. Postgres
sabe que dentro de una misma consulta el resultado no cambia, así que la
evalúa una sola vez. En tablas grandes la diferencia es de un orden de
magnitud.

### Conteos: `planned` en vez de `exact`

`count: 'exact'` obliga a recorrer la tabla entera para mostrar
"20 de 143". Con miles de filas no se nota; con millones, contar tarda
más que traer los datos. `planned` usa las estadísticas de la tabla:
exacto en tablas chicas, muy cercano en grandes, e instantáneo siempre.

### El historial arranca acotado

La vista `vista_eventos` une siete tablas. Sin filtro de fecha tiene que
armar el conjunto completo antes de paginar, así que la pantalla arranca
con el último mes puesto. Con rango, Postgres usa los índices y descarta
la mayoría sin leerla.

### El chat no consulta en segundo plano

Los dos chats refrescan cada 6 segundos. Un cajero con el panel abierto
todo el día generaba 14.000 consultas diarias mirando otra pestaña.
Ahora se frena con `document.hidden` y refresca al volver.

### Lo que queda pendiente

El `detalle` de cada ronda guarda nombres de campo largos en JSON y es
el 40% del peso de la fila. Pasarlo a códigos cortos baja la ronda de
400 a ~250 bytes: menos espacio y, sobre todo, más filas entrando en la
memoria caché de Postgres. Conviene hacerlo **antes** de acumular
millones de rondas.


## Operación

### Zona horaria

`date_trunc('day', now())` corre en UTC. En Paraguay eso hace que el
"día" del sistema arranque a las 20:00 hora local, y el arqueo del lunes
mezcle la noche del domingo.

Todos los cortes usan ahora `inicio_periodo()`, que respeta
`casino_settings.zona_horaria` (por defecto `America/Asuncion`). Al
desplegar otro país hay que cambiar esa columna.

### Anulación de movimientos

Un cajero se equivoca de jugador o de monto: pasa y va a pasar. La
corrección **nunca** es editar o borrar el asiento — eso destruye la
auditoría.

`anular_movimiento()` crea un **contraasiento**: un movimiento inverso
que deja los dos visibles, marca el original como anulado y registra
quién lo autorizó y por qué. El motivo es obligatorio.

Si el jugador ya gastó la plata mal acreditada y el saldo quedaría
negativo, la función frena y avisa: ahí tiene que decidir una persona.

Requiere permiso `gestionar_staff` — o sea, un cajero no se corrige a sí
mismo sin testigo.

### Idempotencia en los giros

Si al jugador se le corta internet justo después de apostar, o toca dos
veces el botón, antes se le descontaba dos veces. Ahora el cliente manda
un `clientId` único por giro; si el servidor ya lo procesó, devuelve la
ronda existente en vez de cobrar de nuevo.

Es el reclamo número uno en cualquier casino online.

### Cierre de caja

Resumen por cajero del período: cuántas cargas, cuántos retiros, cuántas
anulaciones y el **neto** — lo que debería tener de más en efectivo al
cerrar.

Aparte se muestra el margen de los juegos, con una aclaración
importante: **ese margen no es efectivo**, son fichas que los jugadores
todavía tienen o ya retiraron por caja.

### Freno a la fuerza bruta

El login del jugador permitía probar contraseñas sin límite. Ahora se
bloquea a los 5 fallos en 15 minutos por usuario, o 20 por IP (para
quien prueba muchos usuarios distintos). Un login exitoso limpia el
contador.

Los intentos quedan en `login_attempts`; `limpiar_intentos()` borra los
de más de 7 días.


## Agregar juegos sin tocar código

El panel no sabe qué juegos existen: solo lista filas de `games`. Eso
permite agregar títulos sin desplegar de nuevo ni el panel ni el portal.

### Tres niveles de juego nuevo

| Nivel | Qué es | Qué hay que hacer |
|---|---|---|
| 1 | Mismo motor, otra config | Una fila. **Cero código.** |
| 2 | Motor nuevo (5x3, ruleta) | Un archivo en el proyecto de juegos |
| 3 | Proveedor externo | Una fila con `launch_url` |

### La config es lo que diferencia los juegos

`games.config` guarda símbolos, pesos de los rodillos y tabla de pagos.
El motor los aplica sin saber qué juego está resolviendo.

Los tres iniciales tienen el mismo retorno pero experiencia distinta:

| Juego | Retorno | Volatilidad | Premio mayor |
|---|---|---|---|
| Fortune | 91.8% | 4.4 — equilibrado | 330x |
| Gems | 92.4% | 3.6 — tranquilo | 140x |
| Hot 7 | 92.3% | 5.7 — arriesgado | 1150x |

Antes de esto los tres compartían tabla: eran el mismo juego con
distinto nombre.

### El manifiesto y la sincronización

El proyecto de juegos publica su catálogo en `/api/manifest` (público,
con cache de 5 minutos). Cada panel de operador tiene el botón
**Sincronizar catálogo** en la sección Juegos.

Al sincronizar:

- Lo que define el **proveedor** (nombre, motor, config, versión) se
  actualiza.
- Lo que define el **operador** (activo, orden, categoría, límites de
  apuesta) **no se toca** — eso es de cada país.
- Los juegos nuevos entran **desactivados**: que aparezcan solos en el
  portal sin que nadie los revise es pedir problemas.
- Una config con retorno mayor a 100% o menor a 70% se **rechaza** y se
  informa por qué. Mejor frenarla al sincronizar que descubrirla con el
  saldo en cero.

`version` decide si hay que actualizar: si la del catálogo no es mayor a
la guardada, no se toca nada.

### Flujo para agregar el juego número cuatro

1. En el proyecto de juegos: una fila (nivel 1) o un archivo (nivel 2).
2. En cada panel: botón Sincronizar.
3. Activarlo y ponerle límites.

Nunca más se toca el código del panel ni del portal.


## El ban corta la sesión

El token del jugador dura 12 horas y no sabe nada de lo que pasó
después de emitirse. Sin esto, alguien baneado mientras estaba adentro
seguía navegando hasta que venciera. Los movimientos de saldo sí lo
frenaban (las funciones de Postgres validan el ban), pero podía seguir
entrando a los juegos.

### Cómo funciona

`players.sesion_revocada_at` marca el momento a partir del cual todos
los tokens emitidos antes dejan de valer. No hay que guardar ni buscar
tokens: se compara la fecha de emisión (`iat`) contra esa columna.

Se actualiza sola por **trigger**, no desde la API, para que valga
siempre — incluso si alguien banea desde el SQL editor:

- Al aplicar un **ban permanente**.
- Al **cambiar la contraseña**, que es lo que uno espera cuando le
  roban la cuenta y pide el reseteo.

Todos los endpoints del jugador usan `requirePlayerActivo()`, que
además del token valida el estado en la base. Cuesta una consulta extra
por pedido: es el precio de que un ban tenga efecto inmediato.

El portal, al recibir 401 o 403, borra el token y vuelve al login
mostrando el motivo, en vez de quedarse con datos viejos en pantalla.

### Cerrar sesión sin banear

En el perfil del jugador hay un botón **Cerrar su sesión**: echa a quien
esté usando la cuenta ahora mismo sin aplicar ningún ban. Sirve para
cuando el jugador avisa que le entraron.


## Consolidación de endpoints (34 -> 10)

El plan gratuito de Vercel limita a **12 funciones serverless por
deployment**. El proyecto había crecido a 34 archivos en `/api`, uno por
endpoint — un límite real que frenó el primer deploy del panel.

Se agruparon en 10 archivos por parámetro `?recurso=` (o por método HTTP
donde ya alcanzaba para distinguir, como login/me o catálogo/girar). Cada
función interna hace exactamente lo mismo que el archivo que reemplazó —
mismos permisos, misma validación, mismas llamadas a Postgres. Solo cambió
la URL que usa el frontend para llegar a ella.

| Archivo nuevo | Reemplaza |
|---|---|
| `jugadores.js` | crear-jugador, verificar-usuario, cambiar-password, ban |
| `staff.js` | crear-cajero, actualizar-staff, listar-staff, registrar-acceso |
| `caja.js` | movimiento, cierre, anular, historial |
| `config.js` | settings, cuentas, cuentas-stats, banners, bonos, cloudinary-firma-staff, animaciones |
| `juegos.js` | juegos, sincronizar, manifest |
| `atencion.js` | solicitudes, soporte (staff) |
| `player-sesion.js` | player-login, player-me |
| `player-caja.js` | player-deposito, player-retiro, player-bono, player-cuentas, cloudinary-firma |
| `player-juego.js` | player-juegos, player-girar |
| `player-social.js` | player-banners, player-soporte |

Queda **1 archivo de margen** antes de volver a pegar contra el límite
(11 funciones: las 10 de la tabla más `proveedor.js`). Un endpoint nuevo
chico entra agregando una función más al archivo del grupo que le
corresponda, no creando un archivo nuevo.

`manifest` (dentro de `juegos.js`, `?recurso=manifest`) sigue con CORS
abierto (`Access-Control-Allow-Origin: '*'`) a propósito: lo consulta
cualquier panel de operador, no solo el nuestro. El resto de los
endpoints del jugador usan `aplicarCors()`, restringido a
`ORIGENES_PERMITIDOS`.


## Los 10 endpoints

El plan gratuito de Vercel permite **12 funciones serverless por
deployment**. El proyecto llegó a tener 34 archivos en `/api`, uno por
operación, y el deploy empezó a fallar.

La solución fue agrupar por área, resolviendo con un parámetro
`?recurso=` (o por método HTTP, donde ya alcanzaba). Cada función hace
exactamente lo mismo que antes; solo cambió la URL.

### Panel (staff)

| Endpoint | Recursos | Reemplaza a |
|---|---|---|
| `/api/jugadores` | `crear` (default), `verificar`, `password`, `ban` | crear-jugador, verificar-usuario, cambiar-password, ban |
| `/api/staff` | `crear` (default), `actualizar`, `listar`, `acceso` | crear-cajero, actualizar-staff, listar-staff, registrar-acceso |
| `/api/caja` | `movimiento` (default), `cierre`, `anular`, `historial` | movimiento, cierre, anular, historial |
| `/api/config` | `settings` (default), `cuentas`, `cuentas-stats`, `banners`, `bonos`, `cloudinary`, `animaciones` | settings, cuentas, cuentas-stats, banners, bonos, cloudinary-firma-staff, animaciones |
| `/api/juegos` | catálogo (default), `manifest`, `sincronizar` | juegos, manifest, sincronizar |
| `/api/atencion` | `solicitudes` (default), `soporte` | solicitudes, soporte |

### Portal (jugador)

| Endpoint | Cómo resuelve | Reemplaza a |
|---|---|---|
| `/api/player-sesion` | GET = datos, POST = login | player-me, player-login |
| `/api/player-caja` | `deposito` (default), `retiro`, `bono`, `cuentas`, `cloudinary` | player-deposito, player-retiro, player-bono, player-cuentas, cloudinary-firma |
| `/api/player-juego` | GET = catálogo, POST = girar | player-juegos, player-girar |
| `/api/player-social` | `banners` (default), `soporte` | player-banners, player-soporte |

### Los helpers NO van en `/api`

Un error de cálculo en el primer intento: Vercel cuenta **todos** los
archivos `.js` sueltos dentro de `/api` como funciones — incluidos los
que empiezan con `_`. Los 6 helpers (`supabaseAdmin`, `playerAuth`,
`cors`, `telegram`, `slot-engine`, `permisos`) sumaban a las 10 rutas
reales y daban 16, todavía arriba del límite.

Por eso los helpers viven en **`/lib`**, fuera de `/api`. Esa carpeta
no se despliega como funciones — es código compartido que los endpoints
importan. Quedan **11** funciones reales (`proveedor.js` más las 10 de
la tabla), con 1 de margen antes de volver a tocar el límite de 12.

Si hace falta más margen todavía, la próxima consolidación natural es
unir `player-social` dentro de `player-caja`.

`/api/juegos?recurso=manifest` sigue siendo **público y con CORS
abierto**: lo consulta cualquier panel de operador, no solo el propio.


## Juegos de proveedores externos

Cuando un juego lo hace otro equipo (deploy propio, servidor propio),
nunca le damos acceso directo a la base ni al saldo. La integración
completa está documentada para el proveedor en
[`deploy/integracion-proveedores.md`](deploy/integracion-proveedores.md)
— es lo que hay que pasarle al equipo que hace el juego.

### El flujo, en corto

1. El jugador toca el juego en el portal. Nosotros generamos un
   **token de lanzamiento** firmado con el secreto de ese proveedor y
   lo mandamos en la URL (`firmarLanzamiento` en `lib/proveedorAuth.js`).
2. El servidor del proveedor — nunca el navegador del jugador — nos
   llama a `/api/proveedor` para consultar saldo, apostar y premiar,
   firmando cada llamada con el mismo secreto.
3. Nosotros verificamos la firma antes de mover un peso.

### Por qué son dos pasos, no uno

El token que viaja en la URL lo ve el navegador del jugador — por
diseño, **no alcanza por sí solo para mover plata**. Si alcanzara,
cualquiera que capturara esa URL podría llamarnos directo y acreditarse
saldo. Por eso cada llamada de plata va firmada aparte con un secreto
que solo conocen los dos backends, nunca ningún navegador.

### Apostar y premiar van separados, con distinta idempotencia

Un primer intento los combinaba en una sola llamada con el mismo
`roundId` para las dos fases — y tenía un error real: la marca de "ya
procesado" que dejaba `apostar` hacía que `premiar` se ignorara en
silencio, sin ningún error visible, y el jugador nunca cobraba.

`proveedor_apostar()` y `proveedor_premiar()` son funciones separadas.
Premiar exige que exista una apuesta previa con ese `roundId` (no se
puede inventar un premio de la nada), y su propia protección contra
duplicados es independiente de la de apostar.

### Gestión desde el panel

Sección **Juegos → Proveedores externos**: alta de un proveedor nuevo
genera un secreto que se muestra **una sola vez** — no se puede volver
a ver, hay que regenerarlo si se pierde. Al crear o editar un juego,
tildando "Juego de un proveedor externo" aparecen los campos de URL de
lanzamiento y a qué proveedor pertenece.

### Validación en dos capas

`proveedor_apostar()` no confía en los límites que manda el proveedor:
los vuelve a chequear contra `games.min_bet`/`max_bet`. El proveedor
puede tener un bug, o alguien puede haber falsificado la llamada — la
firma es la primera barrera, los límites la segunda.
