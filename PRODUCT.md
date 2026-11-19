# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML, CSS, and vanilla ES Modules (`web/`) with zero build step, local vendored `@supabase/supabase-js` (`web/vendor/supabase-js.mjs`), deployed directly to GitHub Pages with strict Content Security Policy (`script-src 'self'`, `style-src 'self'`, `require-trusted-types-for 'script'`).

## Users

1. **Estudiantado y PDI de la Universidad de Granada (`@go.ugr.es`)**: acceden desde móvil o portátil en la Facultad de Ciencias Políticas y Sociología (entre clases, preparando prácticas de radio, entrevistas de TFG o grupos de discusión) para consultar disponibilidad real y solicitar una franja horaria en segundos.
2. **Personal técnico y de gestión de PoliSocioLAB (`staff_users`)**: revisan solicitudes pendientes desde `admin.html`, aprueban, rechazan o cancelan reservas con notificación automática por correo e `.ics`, y programan bloqueos por mantenimiento o docencia.

## Product Purpose

Gestionar de forma rápida, transparente y sin dobles reservas el acceso a los tres laboratorios de PoliSocioLAB (Laboratorio de radio, Laboratorio cualitativo 1 y Laboratorio cualitativo 2 con aforo simultáneo de 10 plazas). El éxito significa que un usuario `@go.ugr.es` localice un hueco libre y envíe su solicitud en pocos toques desde móvil, y que el personal resuelva la cola de pendientes sin errores ni ambigüedad.

## Positioning

Portal oficial de reservas de PoliSocioLAB (UGR) con verificación de identidad institucional Google `@go.ugr.es` en base de datos, protección a nivel PostgreSQL contra solapamientos (`EXCLUDE USING gist`), asignación automática de plazas en aforo compartido (10 puestos) y avisos institucionales con calendario `.ics` a coste 0 €.

## Operating Context

* Uso frecuente en móviles dentro del campus y en ordenadores de despacho del personal administrativo/técnico.
* Horario lectivo estándar de lunes a viernes, 08:00–21:00, en bloques de 1 a 6 horas consecutivas con ventana de 60 días (zona horaria `Europe/Madrid`).
* Flujo de aprobación manual: toda solicitud nace `PENDIENTE` y solo bloquea aforo definitivo al pasar a `APROBADA`.

## Capabilities and Constraints

* **Tres superficies:** portal de reservas (`web/index.html`), panel de gestión (`web/admin.html`) y política de privacidad RGPD (`web/privacidad.html`).
* **Restricciones técnicas y de seguridad innegociables:**
  * Despliegue estático directo en GitHub Pages (`web/`), sin servidor propio ni dependencias JS externas en tiempo de ejecución.
  * Mantener CSP estricta (`script-src 'self'`, `style-src 'self'`, `require-trusted-types-for 'script'`, cero `style="..."` inline y cero `innerHTML`), OAuth PKCE con `@go.ugr.es`, y los contratos RPC/Edge Function existentes con Supabase (`get_public_availability`, `submit_booking_request`, `resolve_booking`, `notify-new-request`, `notify-booking`).
  * Mantener modo demostración local cuando `web/config.js` no está configurado.
* **Imágenes de espacios:** aún no hay fotografías reales de las salas (`web/assets/space-*.svg` son ilustraciones provisionales hasta recibir fotos reales de la Facultad).

## Brand Commitments

* **Nombre institucional:** PoliSocioLAB · Facultad de Ciencias Políticas y Sociología (Universidad de Granada).
* **Activos obligatorios:** logotipo oficial de la Facultad (`web/assets/logo-facultad.jpg`).
* **Color institucional vinculante:** naranja institucional de la Facultad de Ciencias Políticas y Sociología como base de identidad (ajustando contraste WCAG AA ≥4.5:1 en texto y controles).

## Evidence on Hand

* Logotipo oficial: `web/assets/logo-facultad.jpg` (490×130).
* Ilustraciones vectoriales provisionales de los 3 laboratorios: `web/assets/space-radio.svg`, `web/assets/space-cualitativo1.svg`, `web/assets/space-cualitativo2.svg`.
* Datos reales de espacios: Laboratorio de radio (sala completa), Laboratorio cualitativo 1 (sala completa), Laboratorio cualitativo 2 (aforo máximo de 10 plazas).
* Falta fotografía real de las salas (no inventar fotos falsas ni métricas inexistentes).

## Product Principles

1. **Velocidad operativa en móvil primero:** llegar del acceso a elegir día y franja en el menor número de pasos y toques posible, sin rodeos ni bloques decorativos.
2. **Claridad inmediata de estado y aforo:** distinguir de un vistazo qué está libre, cuántas plazas quedan en Cualitativo 2 y qué está completo o pendiente de aprobación.
3. **Mínima fricción con máxima seguridad:** toda acción destructiva pide confirmación segura; las validaciones y los errores dicen exactamente qué ocurre y cómo resolverlo.
4. **Identidad universitaria seria y reconocible:** presencia institucional limpia de facultad europea de ciencias sociales, nunca plantilla genérica de SaaS.

## Accessibility & Inclusion

* Cumplimiento estricto WCAG 2.1 AA (contraste ≥4.5:1 en texto normal y ≥3:1 en texto grande/componentes UI).
* Navegación completa por teclado, foco `:focus-visible` nítido, áreas táctiles ≥44×44 px, respeto a `prefers-reduced-motion` y soporte `forced-colors`.
