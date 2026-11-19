---
version: 1
slug: "web-index-html"
primary_target: "web/index.html"
related_targets: ["web/admin.html","web/privacidad.html"]
---

# Surface Brief · PoliSocioLAB Reservas (Portal, Panel de gestión y Privacidad)

- **Scope:** `web/index.html`, `web/admin.html`, `web/privacidad.html` (`web/styles.css`, `web/app.js`, `web/admin.js`, `web/shared.js`)
- **Visitor Mode:** Operate (`index.html`, `admin.html`) + Read (`privacidad.html`)
- **Audience & Job:** Alumnado y PDI `@go.ugr.es` que reservan salas desde móvil o portátil en la Facultad de Ciencias Políticas y Sociología (UGR), y personal técnico que resuelve pendientes y bloqueos en `admin.html`.
- **Constraints:** Logo oficial (`web/assets/logo-facultad.jpg`), naranja institucional de la Facultad con contraste AA ≥4.5:1, despliegue estático sin build en GitHub Pages, cliente Supabase local (`web/vendor/supabase-js.mjs`), CSP estricta (`script-src 'self'`, `style-src 'self'`, `font-src 'self'`, `require-trusted-types-for 'script'`), PKCE OAuth y compatibilidad total con las RPCs y Edge Functions existentes.

## Direction contract

- **THESIS:** Plano de Aulario convierte el portal en una herramienta arquitectónica de disponibilidad en vivo donde el naranja institucional de la Facultad ancla la cabecera fija y las 3 salas, la semana y los turnos visibles comparten una sola pantalla operativa, rechazando el flujo lento de tarjetas SaaS intermedias con sombras genéricas.
- **OWN-WORLD:** Cabecera fija en naranja institucional `#B84408` con insignia blanca para el logo de la Facultad, carril lateral a ras del borde izquierdo en gris mineral `#EAECEF`, fondo arquitectónico diurno `#F4F5F7` (confirmado explícitamente por el usuario para armonizar con el escudo blanco de la Facultad y mantener 0 avisos de paleta crema), hojas operativas blancas `#FFFFFF` con filetes `1px` `#D4D8E0`, tinta pizarra `#171B20`, verde arquitectónico `#0E6A52` para aforo disponible y tipografía autoalojada `Schibsted Grotesk` con cifras tabulares; sin tarjetas anidadas ni barras laterales de color.
- **STORY:** Quien entra con su cuenta `@go.ugr.es` elige primero en el selector inicial cuál de los 3 laboratorios quiere utilizar (con modalidad clara «Uso exclusivo» frente a «Aforo compartido · Hasta 10 plazas»), accede a su hoja horaria, cambia de espacio o de día en un toque sin recargas redundantes, lee el aforo físico de cada franja (barra segmentada de 10 plazas en Cualitativo 2) y solicita su turno en un diálogo modal limpio; el personal ve sus indicadores clave, filtra y resuelve pendientes o cancela/elimina bloqueos con confirmación segura.
- **FIRST VIEWPORT:** Cabecera institucional naranja fija (`72px` en escritorio) con marca, logo oficial y sesión UGR; tras iniciar sesión se muestra el selector arquitectónico de los 3 espacios para elegir laboratorio sin imponer Radio por defecto, y al elegir espacio se abre la vista operativa full-bleed de dos columnas en escritorio (carril izquierdo de `320px` a ras del borde con retorno `Todos los espacios`, cambio rápido entre los 3 espacios y plano arquitectónico, y área principal con `<h1>` del espacio, barra semanal de 7 días con fines de semana cerrados diferenciados y hoja horaria de 08:00 a 21:00 con barra de aforo y botón `Solicitar` alineado a la derecha).
- **FORM:** Plano de Aulario (candidato #6 de la lista ordenada, asignado por el sorteo, elevado con alineación tabular derecha, identidad espacial de cada laboratorio y cero inflación de espacio en el primer viewport). `seed:4a9a4ddb8a1e9864`
- **FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
