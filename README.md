# PoliSocioLAB · Sistema de reservas de laboratorios (UGR)

Sistema gratuito (0 €) de reservas para los laboratorios de la **Facultad de Ciencias Políticas y Sociología de la Universidad de Granada**, construido con **GitHub Pages + Supabase + puente de correo oficial UGR (`vcalero@go.ugr.es`)**.

## Qué incluye

- **3 espacios (12 recursos):**
  - **Laboratorio de radio** (sala completa).
  - **Laboratorio cualitativo 1** (sala completa).
  - **Laboratorio cualitativo 2** (10 puestos independientes `C01`–`C10`, hasta 10 reservas simultáneas).
- **Horario configurable:** por defecto lunes a viernes de **08:00 a 21:00**, reservas de **1 a 6 horas consecutivas**.
- **Sin login ni códigos para el alumnado:** calendario público en tiempo real y envío directo con validación estricta de correo institucional UGR (cualquier dominio terminado en `ugr.es`: `@ugr.es`, `@go.ugr.es`, `@correo.ugr.es`, etc.).
- **Aprobación manual y protección contra dobles reservas:** panel privado (`/admin.html`) para el personal de la Facultad con restricción `EXCLUDE USING gist` en PostgreSQL (imposible aprobar dos reservas solapadas en el mismo recurso/puesto) y gestión de bloqueos por mantenimiento o eventos.
- **Correos automáticos oficiales desde `vcalero@go.ugr.es` (sin Brevo y sin spam):** enviados desde la Edge Function `notify-booking` a través de un puente privado mínimo en Apps Script (`supabase/mail-relay/Code.gs`) con firma SPF/DKIM oficial de Google Workspace UGR (1.500 correos/día gratis) y archivo adjunto de calendario `.ics` al aprobar.

---

## Estructura del proyecto

- `web/index.html`, `web/app.js` — Calendario público y solicitud de reserva para el alumnado.
- `web/admin.html`, `web/admin.js` — Panel de gestión del personal (pendientes, agenda/historial, reenvío de avisos y bloqueos).
- `web/config.js` — Conexión al proyecto Supabase (`SUPABASE_URL` y `SUPABASE_ANON_KEY`).
- `supabase/migrations/001_initial_schema.sql` — Tablas, políticas RLS, restricción anti-solapamiento y funciones RPC.
- `supabase/functions/notify-booking/index.ts` — Edge Function para envío de correos automáticos con `.ics`.
- `.github/workflows/deploy-pages.yml` — Publicación automática en GitHub Pages.

---

## Puesta en marcha (10 minutos, 0 €)

### Paso 1. Crear proyecto gratuito en Supabase y cargar el esquema
1. Entra en [supabase.com](https://supabase.com) y crea un proyecto gratuito (región recomendada: **West EU / Frankfurt o Ireland**).
2. En el menú izquierdo abre **SQL Editor → New query**, pega el contenido completo de `supabase/migrations/001_initial_schema.sql` y pulsa **Run**.
3. En **Authentication → Users → Add user**, crea los usuarios del personal autorizado (los mismos correos que figuren en la tabla `staff_users`, por ejemplo `vcalero@go.ugr.es` y `godoy@go.ugr.es`).
4. En **Project Settings → API**, copia:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon / public key**

### Paso 2. Configurar el remitente genérico de correos (Brevo gratis)
1. Crea una cuenta gratuita en [brevo.com](https://www.brevo.com) (300 correos/día gratis).
2. En **Senders, Domains & Dedicated IPs → Senders**, añade y verifica el correo genérico del laboratorio (p. ej. `polisociolab@go.ugr.es` o `reservas.polisociolab@gmail.com`). Así nunca aparecerá el correo personal de Virginia como remitente.
3. En **SMTP & API → API Keys**, genera una clave de API (`BREVO_API_KEY`).

### Paso 3. Desplegar la Edge Function `notify-booking`
Instala la CLI de Supabase (`brew install supabase/tap/supabase`) y ejecuta desde la raíz del proyecto:

```bash
supabase login
supabase link --project-ref <TU-PROJECT-REF>

supabase secrets set \
  BREVO_API_KEY="<TU-CLAVE-BREVO>" \
  MAIL_FROM_EMAIL="<correo-generico-del-laboratorio>" \
  MAIL_FROM_NAME="PoliSocioLAB · Facultad de Ciencias Políticas y Sociología" \
  MAIL_REPLY_TO="vcalero@go.ugr.es"

supabase functions deploy notify-booking
```

*(Alternativa: si algún día usáis dominio propio con Resend, basta con definir `RESEND_API_KEY` en lugar de `BREVO_API_KEY`).*

### Paso 4. Conectar el frontend y publicar en GitHub Pages
1. Edita `web/config.js` con tu `SUPABASE_URL` y `SUPABASE_ANON_KEY`.
2. Sube este repositorio a GitHub (p. ej. `Laboratorio-PoliSocioLAB/reservas`).
3. En **Settings → Pages → Source**, elige **GitHub Actions**. En menos de un minuto estará publicado en:
   - Alumnado: `https://laboratorio-polisociolab.github.io/reservas/`
   - Personal: `https://laboratorio-polisociolab.github.io/reservas/admin.html`

---

## Pruebas locales

```bash
node --test tests/validation.test.mjs
python3 -m http.server 8080 --directory web
```

Abre `http://localhost:8080/` para probar el portal en modo demostración local antes de conectar Supabase.
