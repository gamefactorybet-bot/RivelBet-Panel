// Única fuente de verdad de permisos, compartida con el cliente.
// Vercel sigue el import y empaqueta el archivo con la función, así que
// no hay copias que se puedan desincronizar.
export { puede, PERFILES, PERMISOS, PERFIL_KEYS, esExterno, esRevendedor, esComisionista } from '../src/lib/perfiles.js';
