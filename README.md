# PoliSocioLAB · Sistema de reservas de laboratorios (UGR)

Sistema gratuito (0 €) de reservas para los laboratorios de la **Facultad de Ciencias Políticas y Sociología de la Universidad de Granada**, construido con **GitHub Pages + Supabase + puente de correo oficial UGR**.

## Qué incluye

- **3 espacios (12 recursos):**
  - **Laboratorio de radio** (uso exclusivo).
  - **Laboratorio cualitativo 1** (uso exclusivo).
  - **Laboratorio cualitativo 2** (aforo de 10 plazas `C01`–`C10`, asignación y reasignación automática). El personal con cuenta institucional sin prefijo `e.` puede solicitar la sala completa para docencia. El equipo gestor revisa el uso docente y, al aprobarlo, las diez plazas quedan ocupadas en esa franja.
- **Horario configurable:** por defecto lunes a viernes de **08:00 a 21:00**, reservas de **1 a 6 horas consecutivas**.
- **Acceso exclusivo con Google `@go.ugr.es`:** tanto el portal de reservas como el panel de gestión exigen inicio de sesión con Google Workspace institucional `@go.ugr.es` mediante OAuth **PKCE**, verificado en base de datos (`amr = oauth`, identidad Google confirmada en `auth.identities`, nombre inmutable y correo confirmado).
- **Aprobación manual y protección contra dobles reservas:** panel privado (`/admin.html`) para el personal de la Facultad con restricción `EXCLUDE USING gist` en PostgreSQL, bloqueos transaccionales anti-TOCTOU y gestión de bloqueos de mantenimiento.
- **Mis reservas:** panel privado con el historial de solicitudes de la cuenta institucional, filtros de fecha y estado, y acceso a la disponibilidad.
- **Avisos automáticos por correo:**
  - `notify-new-request`: avisa al personal cuando entra una nueva solicitud pendiente.
  - `notify-booking`: envía confirmación (con archivo `.ics` saneado según RFC 5545), rechazo o cancelación al solicitante.
- **Endurecimiento del frontend:** `@supabase/supabase-js` empaquetado localmente en `web/vendor/supabase-js.mjs` (sin dependencias JS externas en tiempo de ejecución), política estricta `Content-Security-Policy` con `require-trusted-types-for 'script'` y cero `innerHTML`.

---

## Estructura del proyecto

- `web/index.html`, `web/app.js` — Portal de reservas para la comunidad universitaria (`@go.ugr.es`).
- `web/admin.html`, `web/admin.js` — Panel de gestión del personal (pendientes, agenda/historial, cancelación con diálogo de confirmación y bloqueos).
- `web/privacidad.html` — Política de privacidad (RGPD / LOPDGDD).
- `web/config.js` — Conexión pública al proyecto Supabase (`SUPABASE_URL` y `SUPABASE_ANON_KEY`).
- `web/vendor/supabase-js.mjs` — Cliente Supabase fijado localmente (sin carga desde CDN externo).
- `supabase/migrations/001_*.sql` … `009_my_bookings.sql` — Esquema, políticas RLS, restricción anti-solapamiento y consulta privada de reservas.
- `supabase/functions/notify-booking/index.ts` — Edge Function de avisos de resolución con adjunto `.ics`.
- `supabase/functions/notify-new-request/index.ts` — Edge Function de aviso al personal ante nuevas solicitudes.
- `supabase/mail-relay/Code.gs` — Puente de correo endurecido para Google Apps Script (comparación en tiempo constante, lista blanca de asuntos y límite de envíos por minuto).
- `.github/workflows/deploy-pages.yml` — Publicación automática en GitHub Pages con actions fijadas por SHA y permisos mínimos por job.

---

## Despliegue y lista de comprobación de seguridad

### 1. Base de datos (Supabase SQL Editor o CLI)
Aplica las migraciones en orden (`001` a `009`). Aplica `009_my_bookings.sql` antes de publicar la versión del portal con «Mis reservas». En concreto, `007_security_hardening.sql`:
- Endurece `is_verified_go_ugr_user()`, `is_staff()` y crea `is_admin()` exigiendo sesión Google OAuth (`amr = oauth`) e identidad verificada en `auth.identities`.
- Revoca el acceso RPC a `has_resource_conflict` y `range_within_opening_hours` para `PUBLIC`, `anon` y `authenticated`.
- Aplica mínimo privilegio en RLS (elimina `bookings_staff_update`, exige `is_admin()` para modificar `resources`/`opening_hours`, audita `blocks.created_by` mediante trigger).
- Lee el nombre del solicitante desde `auth.identities` (no desde `user_metadata`), serializa solicitudes concurrentes con `pg_advisory_xact_lock` y añade límite diario (20/24 h) y utilidad `purge_old_bookings(365)` para retención RGPD.

### 2. Configuración crítica en Supabase Dashboard (Auth)
1. **Desactivar proveedor Email:** en **Authentication → Providers → Email**, desactiva el proveedor Email/Password para que nadie pueda iniciar sesión o registrarse fuera de Google `@go.ugr.es`. Elimina también las contraseñas antiguas de cuentas de personal y de cualquier archivo local (`.env.local`).
2. **URL Configuration:** en **Authentication → URL Configuration → Redirect URLs**, deja únicamente las URLs exactas de producción (sin comodines `*` ni `localhost`):
   - `https://laboratorio-polisociolab.github.io/reservas/`
   - `https://laboratorio-polisociolab.github.io/reservas/index.html`
   - `https://laboratorio-polisociolab.github.io/reservas/admin.html`
3. **Google Cloud OAuth:** si es posible dentro del tenant de Google Workspace UGR, configurar la pantalla de consentimiento como **Interna** (o añadir un Supabase Auth Hook `before-user-created`) para impedir la creación de usuarios en `auth.users` con dominios externos.

### 3. Edge Functions y puente de correo (`Code.gs`)
```bash
supabase login
supabase link --project-ref <TU-PROJECT-REF>

supabase secrets set \
  MAIL_RELAY_URL="<URL-WEBAPP-APPS-SCRIPT>" \
  MAIL_RELAY_SECRET="<SECRETO-ALEATORIO-LARGO>" \
  STAFF_NOTIFY_EMAIL="vcalero@ugr.es" \
  ALLOWED_ORIGINS="https://laboratorio-polisociolab.github.io"

supabase functions deploy notify-booking notify-new-request --use-api --no-verify-jwt
```

Las funciones verifican la sesión OAuth y los permisos antes de tramitar los envíos.

Actualiza el código del proyecto de Google Apps Script con `supabase/mail-relay/Code.gs` y publica una nueva versión del despliegue web. (Recomendable migrar el puente a una cuenta funcional del laboratorio en lugar de una cuenta personal y rotar `MAIL_RELAY_SECRET` si se guardó en archivos locales).

### 4. GitHub Pages y aislamiento de origen
- Al usar GitHub Pages (`laboratorio-polisociolab.github.io`), **no publiques otros repositorios no auditados en esa misma organización**, ya que compartirían el mismo origen y `localStorage`.
- Si deseas además cabeceras HTTP completas (`Content-Security-Policy: frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`), puedes servir la carpeta `web/` desde un subdominio propio o Cloudflare Pages / Netlify (0 €).

---

## Pruebas locales

```bash
node --test tests/validation.test.mjs
deno check supabase/functions/notify-booking/index.ts supabase/functions/notify-new-request/index.ts
python3 -m http.server 8080 --directory web
```
