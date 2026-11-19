import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  isValidUgrEmail,
  isValidGoUgrEmail,
  computeConsecutiveHours,
  addDays,
  mondayOf,
  formatDateShortEs,
} from '../web/shared.js';

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

test('utilidades de fechas y semanas ISO', () => {
  assert.equal(addDays('2026-11-19', 1), '2026-11-20');
  assert.equal(mondayOf('2026-11-19'), '2026-11-16'); // Jueves -> Lunes
  assert.equal(mondayOf('2026-11-22'), '2026-11-16'); // Domingo -> Lunes
  assert.equal(formatDateShortEs('2026-11-19'), '19/11/2026');
});

test('migración SQL y Edge Function existen y contienen restricciones críticas', () => {
  const root = path.resolve(import.meta.dirname, '..');
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

test('valida correos exclusivos @go.ugr.es para acceso autenticado', () => {
  assert.equal(isValidGoUgrEmail('estudiante@go.ugr.es'), true);
  assert.equal(isValidGoUgrEmail('VCALERO@GO.UGR.ES'), true);
  assert.equal(isValidGoUgrEmail('docente@ugr.es'), false);
  assert.equal(isValidGoUgrEmail('persona@correo.ugr.es'), false);
  assert.equal(isValidGoUgrEmail('externo@gmail.com'), false);
  assert.equal(isValidGoUgrEmail('falso@sub.go.ugr.es'), false);
});
