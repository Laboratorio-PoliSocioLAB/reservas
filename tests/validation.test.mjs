import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  isValidUgrEmail,
  isValidGoUgrEmail,
  getGoogleIdentityDisplayName,
  getSafeGoogleAvatarUrl,
  computeConsecutiveHours,
  TEACHING_ROOM_ID,
  addDays,
  mondayOf,
  formatDateShortEs,
  formatDayNumberEs,
} from '../web/shared.js';

const root = path.resolve(import.meta.dirname, '..');

test('valida correos institucionales terminados en ugr.es y rechaza otros dominios', () => {
  const valid = [
    'estudiante@go.ugr.es',
    'nombre.apellido@correo.ugr.es',
    'docente@ugr.es',
    'tecnico+lab@sub.depto.ugr.es',
    'MAYUSCULAS@GO.UGR.ES',
  ];
  for (const email of valid) {
    assert.equal(isValidUgrEmail(email), true, `Debería aceptar ${email}`);
  }

  const invalid = [
    'persona@gmail.com',
    'persona@fakeugr.es',
    'persona@ugr.es.evil.com',
    'persona@.ugr.es',
    '@ugr.es',
    'sin-arroba.ugr.es',
    '',
  ];
  for (const email of invalid) {
    assert.equal(isValidUgrEmail(email), false, `Debería rechazar ${email}`);
  }
});

test('calcula horas consecutivas disponibles respetando huecos ocupados y límite de 6 horas', () => {
  const slots = [
    { room: 'CUALITATIVO2', start: '09:00', end: '10:00', available: ['C01', 'C02'] },
    { room: 'CUALITATIVO2', start: '10:00', end: '11:00', available: ['C01', 'C02'] },
    { room: 'CUALITATIVO2', start: '11:00', end: '12:00', available: ['C02'] }, // C01 ocupado aquí
    { room: 'CUALITATIVO2', start: '12:00', end: '13:00', available: ['C01', 'C02'] },
  ];

  const c01 = computeConsecutiveHours(slots, 'CUALITATIVO2', '09:00', 'C01');
  assert.deepEqual(
    c01.map((o) => [o.hours, o.end]),
    [
      [1, '10:00'],
      [2, '11:00'],
    ]
  );

  const c02 = computeConsecutiveHours(slots, 'CUALITATIVO2', '09:00', 'C02');
  assert.deepEqual(
    c02.map((o) => [o.hours, o.end]),
    [
      [1, '10:00'],
      [2, '11:00'],
      [3, '12:00'],
      [4, '13:00'],
    ]
  );

  // Modo aforo de 10 plazas (CUALITATIVO2): encuentra automáticamente las 4 horas porque C02 está libre en todas
  const pool = computeConsecutiveHours(slots, 'CUALITATIVO2', '09:00', 'CUALITATIVO2');
  assert.deepEqual(
    pool.map((o) => [o.hours, o.end]),
    [
      [1, '10:00'],
      [2, '11:00'],
      [3, '12:00'],
      [4, '13:00'],
    ]
  );
});

test('la duración docente termina en la primera franja que no tiene la sala completa libre', () => {
  const room = 'CUALITATIVO2';
  const slots = [
    { room, start: '09:00', end: '10:00', available: ['C01', 'C02'], whole_room_available: true },
    { room, start: '10:00', end: '11:00', available: ['C02'], whole_room_available: false },
    { room, start: '11:00', end: '12:00', available: ['C01', 'C02'], whole_room_available: true },
  ];

  assert.deepEqual(computeConsecutiveHours(slots, room, '09:00', TEACHING_ROOM_ID).map(({ hours }) => hours), [1]);
  assert.deepEqual(computeConsecutiveHours(slots, room, '10:00', TEACHING_ROOM_ID), []);
  assert.equal(computeConsecutiveHours(slots, room, '09:00', room).length, 3);
});

test('utilidades de fechas y semanas ISO', () => {
  assert.equal(addDays('2026-11-19', 1), '2026-11-20');
  assert.equal(mondayOf('2026-11-19'), '2026-11-16'); // Jueves -> Lunes
  assert.equal(mondayOf('2026-11-22'), '2026-11-16'); // Domingo -> Lunes
  assert.equal(formatDateShortEs('2026-11-19'), '19/11/2026');
  assert.equal(formatDayNumberEs('2026-11-19'), '19');
});

test('migración SQL y Edge Function existen y contienen restricciones críticas', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations/001_initial_schema.sql'), 'utf8');
  assert.match(sql, /bookings_no_approved_overlap/);
  assert.match(sql, /exclude using gist/i);
  assert.match(sql, /is_valid_ugr_email/);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /submit_booking_request/);
  assert.match(sql, /resolve_booking/);

  const fn = fs.readFileSync(path.join(root, 'supabase/functions/notify-booking/index.ts'), 'utf8');
  assert.match(fn, /BEGIN:VCALENDAR/);
  assert.match(fn, /api\.brevo\.com/);
  assert.match(fn, /staff_users/);
  assert.match(fn, /escapeIcsText/);
  assert.match(fn, /hasOAuthAmr/);
  assert.doesNotMatch(fn, /'Access-Control-Allow-Origin': '\*'/);

  const fnAlert = fs.readFileSync(path.join(root, 'supabase/functions/notify-new-request/index.ts'), 'utf8');
  assert.match(fnAlert, /hasOAuthAmr/);
  assert.match(fnAlert, /is_verified_go_ugr_user/);
  assert.doesNotMatch(fnAlert, /'Access-Control-Allow-Origin': '\*'/);
  assert.doesNotMatch(fnAlert, /notified:\s*staffNotifyEmail/);

  const sqlAuth = fs.readFileSync(
    path.join(root, 'supabase/migrations/003_require_go_ugr_google_auth.sql'),
    'utf8'
  );
  assert.match(sqlAuth, /is_valid_go_ugr_email/);
  assert.match(sqlAuth, /is_verified_go_ugr_user/);
  assert.match(sqlAuth, /revoke all on function public\.submit_booking_request/i);
  assert.match(sqlAuth, /revoke all on function public\.get_public_availability/i);

  const sqlPool = fs.readFileSync(
    path.join(root, 'supabase/migrations/004_cualitativo2_capacity_pool.sql'),
    'utf8'
  );
  assert.match(sqlPool, /aforo máximo de 10 plazas/i);
  assert.match(sqlPool, /p_resource_id = 'CUALITATIVO2'/);
});

test('migración 007 endurece auth Google OAuth, RLS, anti-TOCTOU e identidad inmutable', () => {
  const sqlHardening = fs.readFileSync(
    path.join(root, 'supabase/migrations/007_security_hardening.sql'),
    'utf8'
  );
  assert.match(sqlHardening, /entry ->> 'method' = 'oauth'/);
  assert.match(sqlHardening, /from auth\.identities i/i);
  assert.match(sqlHardening, /revoke all on function public\.has_resource_conflict/i);
  assert.match(sqlHardening, /revoke all on function public\.range_within_opening_hours/i);
  assert.match(sqlHardening, /revoke all on function public\.is_staff\(\) from public, anon/i);
  assert.match(sqlHardening, /drop policy if exists "bookings_staff_update" on public\.bookings/i);
  assert.match(sqlHardening, /pg_advisory_xact_lock/);
  assert.match(sqlHardening, /create or replace function public\.is_admin\(\)/i);
  assert.doesNotMatch(sqlHardening, /auth\.jwt\(\)\s*->\s*'user_metadata'/);
});

test('frontend evita CDNs externos, inline styles, innerHTML y window.prompt', () => {
  const appJs = fs.readFileSync(path.join(root, 'web/app.js'), 'utf8');
  const adminJs = fs.readFileSync(path.join(root, 'web/admin.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8');
  const adminHtml = fs.readFileSync(path.join(root, 'web/admin.html'), 'utf8');
  const privHtml = fs.readFileSync(path.join(root, 'web/privacidad.html'), 'utf8');

  assert.ok(fs.existsSync(path.join(root, 'web/vendor/supabase-js.mjs')));
  assert.ok(fs.existsSync(path.join(root, 'web/assets/fonts/schibsted-grotesk-latin.woff2')));
  assert.ok(fs.existsSync(path.join(root, 'web/assets/fonts/schibsted-grotesk-latin-ext.woff2')));
  for (const js of [appJs, adminJs]) {
    assert.match(js, /from '\.\/vendor\/supabase-js\.mjs'/);
    assert.match(js, /flowType:\s*'pkce'/);
    assert.doesNotMatch(js, /https:\/\/esm\.sh/);
    assert.doesNotMatch(js, /\.innerHTML\s*=/);
    assert.doesNotMatch(js, /window\.prompt/);
    assert.doesNotMatch(js, /window\.confirm/);
  }

  for (const html of [indexHtml, adminHtml, privHtml]) {
    assert.match(html, /http-equiv="Content-Security-Policy"/);
    assert.match(html, /name="referrer"\s+content="strict-origin-when-cross-origin"/);
    assert.doesNotMatch(html, /\sstyle="/);
    assert.doesNotMatch(html, /frame-ancestors/); // ignorada en <meta>
    assert.doesNotMatch(html, /fonts\.googleapis\.com/);
  }

  assert.match(indexHtml, /id="spacePicker"/);
  assert.match(indexHtml, /id="backToSpacesBtn"/);
  assert.match(indexHtml, /id="requestModeField"[^>]*hidden/);
  const pickerHtml = indexHtml.split('id="spacePicker"')[1].split('</section>')[0];
  assert.doesNotMatch(pickerHtml, /sala completa/i);
  assert.match(adminHtml, /<dialog id="cancelDialog"/);
  assert.match(adminHtml, /<dialog id="deleteBlockDialog"/);
  const adminHtmlNoComments = adminHtml.replace(/<!--[\s\S]*?-->/g, '');
  assert.doesNotMatch(adminHtmlNoComments, /role="dialog"|aria-modal/);
});

test('Code.gs aplica comparación en tiempo constante, lista blanca de asuntos y rate limit', () => {
  const gs = fs.readFileSync(path.join(root, 'supabase/mail-relay/Code.gs'), 'utf8');
  assert.match(gs, /function timingSafeEqual_/);
  assert.match(gs, /ALLOWED_SUBJECT_PREFIXES_/);
  assert.match(gs, /checkRateLimit_/);
  assert.doesNotMatch(gs, /PoliSocioLAB Mail Relay/);
});

test('valida correos exclusivos @go.ugr.es para acceso autenticado', () => {
  assert.equal(isValidGoUgrEmail('estudiante@go.ugr.es'), true);
  assert.equal(isValidGoUgrEmail('VCALERO@GO.UGR.ES'), true);
  assert.equal(isValidGoUgrEmail('docente@ugr.es'), false);
  assert.equal(isValidGoUgrEmail('persona@correo.ugr.es'), false);
  assert.equal(isValidGoUgrEmail('externo@gmail.com'), false);
  assert.equal(isValidGoUgrEmail('falso@sub.go.ugr.es'), false);
});

test('filtra de forma segura la URL de avatar de Google y prioriza identity_data', () => {
  assert.equal(
    getSafeGoogleAvatarUrl({
      user_metadata: { avatar_url: 'https://lh3.googleusercontent.com/a/ACg8ocTest=s96-c' },
    }),
    'https://lh3.googleusercontent.com/a/ACg8ocTest=s96-c'
  );
  assert.equal(
    getSafeGoogleAvatarUrl({
      identities: [
        {
          provider: 'google',
          identity_data: {
            full_name: 'Nombre Real Google',
            picture: 'https://lh3.googleusercontent.com/a/RealPic',
          },
        },
      ],
      user_metadata: {
        full_name: 'Nombre Editado',
        avatar_url: 'https://lh3.googleusercontent.com/a/FakePic',
      },
    }),
    'https://lh3.googleusercontent.com/a/RealPic'
  );
  assert.equal(
    getGoogleIdentityDisplayName({
      identities: [{ provider: 'google', identity_data: { full_name: 'Nombre Real Google' } }],
      user_metadata: { full_name: 'Nombre Editado' },
    }),
    'Nombre Real Google'
  );
  assert.equal(
    getSafeGoogleAvatarUrl({
      user_metadata: { picture: 'https://www.google.com/redirect?url=https://evil.example' },
    }),
    ''
  );
  assert.equal(
    getSafeGoogleAvatarUrl({
      user_metadata: { picture: 'https://evil.example.com/pic.png' },
    }),
    ''
  );
  assert.equal(
    getSafeGoogleAvatarUrl({
      user_metadata: { avatar_url: 'javascript:alert(1)' },
    }),
    ''
  );
});
