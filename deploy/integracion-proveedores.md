# Integrar un juego externo — guía para el proveedor

Esto es lo que necesita implementar el equipo que hace el juego para
conectarlo con la plataforma. No necesitan acceso a nuestra base de
datos ni a nuestro código: todo pasa por tres llamadas HTTP.

## 1. Recibir al jugador

Cuando alguien entra a jugar, lo mandamos a la URL del juego con un
`token` en la URL:

```
https://tu-juego.com/?token=XXXXX&operador=Win777
```

Ese token identifica al jugador y al juego, pero **por sí solo no
sirve para mover plata** — es solo la puerta de entrada. Guárdenlo (en
la sesión de su servidor, no hace falta descifrarlo del lado de
ustedes) para usarlo en las llamadas de abajo.

## 2. Consultar el saldo

```
GET https://caja.win777.com/api/proveedor?accion=balance&token=XXXXX
```

Cabeceras: `X-Timestamp` y `X-Firma` (ver punto 4).

Respuesta: `{ "balance": 150000 }`

## 3. Apostar y premiar

**Apostar** (al empezar una jugada, antes de saber el resultado):

```
POST https://caja.win777.com/api/proveedor?accion=apostar
{ "token": "XXXXX", "roundId": "un-id-único-de-esta-jugada", "monto": 5000 }
```

**Premiar** (cuando ya saben el resultado, con el MISMO `roundId`):

```
POST https://caja.win777.com/api/proveedor?accion=premiar
{ "token": "XXXXX", "roundId": "el-mismo-id-de-arriba", "monto": 12000 }
```

Si no hay premio, no hace falta llamar a `premiar` — la ronda queda
con el resultado que dejó `apostar`.

**El `roundId` tiene que ser único por jugada, generado por ustedes.**
Si una llamada se corta y la reintentan con el mismo `roundId`, no se
descuenta ni se acredita dos veces — es seguro reintentar.

Las dos devuelven `{ "balance": <saldo actualizado> }`.

## 4. Firmar cada llamada

Toda llamada (menos la de recibir al jugador) necesita dos cabeceras:

- `X-Timestamp`: los segundos desde 1970 (unix timestamp), del momento
  del pedido. Si difiere más de 2 minutos de la hora real, se rechaza.
- `X-Firma`: HMAC-SHA256 en base64url del texto
  `${accion}|${token}|${monto}|${roundId}|${timestamp}`, calculado con
  el secreto que les dimos. Para `balance`, `monto` y `roundId` van
  vacíos en ese texto.

Ejemplo en Node:

```js
import crypto from 'node:crypto';

function firmar(secreto, accion, token, monto, roundId, timestamp) {
  const texto = `${accion}|${token}|${monto ?? ''}|${roundId ?? ''}|${timestamp}`;
  return crypto.createHmac('sha256', secreto).update(texto)
    .digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
```

**El secreto vive solo en su servidor, nunca en el navegador del
jugador.** Si el juego corre en el navegador, las llamadas a
`/api/proveedor` las tiene que hacer SU backend, no el frontend del
juego directamente — de lo contrario cualquiera podría ver el secreto
y acreditarse plata sola.

## 5. Errores comunes

| Código | Motivo |
|---|---|
| 401 | Token vencido, o firma inválida |
| 400 | Falta `roundId`, monto inválido, o apuesta fuera de los límites del juego |
| 403 | El proveedor fue deshabilitado de nuestro lado |

## 6. Antes de ir a producción

Les damos un secreto de prueba primero, probamos el circuito completo
con montos chicos, y recién cuando esté validado activamos el secreto
real. El token de lanzamiento dura 6 horas — si la sesión de juego
puede ser más larga que eso, avisen para ajustarlo.
