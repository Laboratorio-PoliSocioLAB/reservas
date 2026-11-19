import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CONFIG, isConfigured } from './config.js';
import {
  ROOM_NAMES,
  RESOURCE_LABELS,
  isValidUgrEmail,
  addDays,
  mondayOf,
  computeConsecutiveHours,
  formatMadridToday,
  formatDateLongEs,
  formatWeekdayShortEs,
  formatDateShortEs,
  initDialogLightDismissFallback,
  initAccessibleValidation,
} from './shared.js';

const $ = (id) => document.getElementById(id);
const demoMode = !isConfigured();
const supabase = demoMode ? null : createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

// Datos simulados solo cuando Supabase aún no está configurado en config.js
const demoState = {
  bookings: [],
};

function buildDemoAvailability(requestedDate) {
  const today = formatMadridToday();
  const lastDate = addDays(today, 60);
  const date = requestedDate || today;
  const isoDay = new Date(date + 'T00:00:00Z').getUTCDay() || 7;
  const slots = [];

  if (isoDay >= 1 && isoDay <= 5) {
    const rooms = [
      { room: 'RADIO', ids: ['RADIO'] },
      { room: 'CUALITATIVO1', ids: ['CUALITATIVO1'] },
      { room: 'CUALITATIVO2', ids: Array.from({ length: 10 }, (_, i) => 'C' + String(i + 1).padStart(2, '0')) },
    ];
    for (let h = 8; h < 21; h++) {
      const start = String(h).padStart(2, '0') + ':00';
      const end = String(h + 1).padStart(2, '0') + ':00';
      for (const r of rooms) {
        const available = r.ids.filter(
          (id) =>
            !demoState.bookings.some(
              (b) =>
                b.status === 'APROBADA' &&
                b.resource_id === id &&
                b.date === date &&
                b.start < end &&
                start < b.end
            )
        );
        slots.push({ room: r.room, date, start, end, available });
      }
    }
  }
  return { date, today, last_date: lastDate, slots };
}

const state = {
  date: '',
  today: '',
  lastDate: '',
  slots: [],
  activeSlot: null,
  selectedResource: '',
  loadSeq: 0,
};

function setStatus(message, kind = 'info') {
  const el = $('status');
  if (!message) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.dataset.kind = kind;
  el.textContent = message;
}

function clampDate(iso) {
  if (!state.today || !state.lastDate) return iso;
  if (iso < state.today) return state.today;
  if (iso > state.lastDate) return state.lastDate;
  return iso;
}

function renderWeek() {
  const wrap = $('week');
  wrap.innerHTML = '';
  if (!state.date) return;

  const first = mondayOf(state.date);
  for (let i = 0; i < 7; i++) {
    const d = addDays(first, i);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.disabled = d < state.today || d > state.lastDate;
    if (d === state.date) btn.setAttribute('aria-current', 'date');
    btn.setAttribute('aria-label', formatDateLongEs(d));

    const wd = document.createElement('small');
    wd.textContent = formatWeekdayShortEs(d);
    const num = document.createElement('strong');
    num.textContent = String(Number(d.slice(8, 10)));
    btn.append(wd, num);

    btn.addEventListener('click', () => loadDay(d));
    wrap.appendChild(btn);
  }

  $('selectedDate').textContent = formatDateLongEs(state.date);
  $('date').value = state.date;
  $('date').min = state.today;
  $('date').max = state.lastDate;
  $('prev').disabled = first <= state.today;
  $('next').disabled = addDays(first, 7) > state.lastDate;
}

function renderRoom(containerId, roomKey) {
  const box = $(containerId);
  box.innerHTML = '';
  const list = state.slots.filter((s) => s.room === roomKey);
  const isMultiSeat = roomKey === 'CUALITATIVO2';

  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'No hay turnos abiertos para este día.';
    box.appendChild(p);
    return;
  }

  for (const slot of list) {
    const row = document.createElement('div');
    row.className = 'item slot';

    const info = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = `${slot.start} – ${slot.end}`;
    const meta = document.createElement('span');
    meta.className = 'muted';
    if (isMultiSeat) {
      meta.textContent = slot.available.length
        ? `${slot.available.length} de 10 puestos libres`
        : 'Sin puestos libres';
    } else {
      meta.textContent = slot.available.length ? 'Disponible' : 'Ocupado';
    }
    info.append(title, meta);
    row.appendChild(info);

    if (!slot.available.length) {
      const pill = document.createElement('span');
      pill.className = 'pill full';
      pill.textContent = 'Completo';
      row.appendChild(pill);
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'primary';
      btn.textContent = isMultiSeat ? 'Elegir puesto' : 'Solicitar';
      btn.setAttribute(
        'aria-label',
        `${btn.textContent} · ${ROOM_NAMES[roomKey]} · ${slot.start}–${slot.end}`
      );
      btn.addEventListener('click', () => openRequestDialog(slot));
      row.appendChild(btn);
    }
    box.appendChild(row);
  }
}

function updateDurationSelect() {
  const slot = state.activeSlot;
  if (!slot || !state.selectedResource) return;

  const opts = computeConsecutiveHours(state.slots, slot.room, slot.start, state.selectedResource, 6);
  const select = $('duration');
  select.innerHTML = '';

  const list = opts.length
    ? opts
    : [{ hours: 1, label: `1 hora (${slot.start}–${slot.end})` }];

  for (const item of list) {
    const opt = document.createElement('option');
    opt.value = String(item.hours);
    opt.textContent = item.label;
    select.appendChild(opt);
  }
}

function openRequestDialog(slot) {
  state.activeSlot = slot;
  const isMultiSeat = slot.room === 'CUALITATIVO2';
  state.selectedResource = slot.available[0];

  $('requestForm').reset();
  $('requestError').hidden = true;
  $('requestMeta').textContent =
    `${ROOM_NAMES[slot.room]} · ${formatDateShortEs(slot.date)} · inicio a las ${slot.start}`;

  const seatField = $('seatField');
  seatField.hidden = !isMultiSeat;

  if (isMultiSeat) {
    const grid = $('seatGrid');
    grid.innerHTML = '';
    for (let i = 1; i <= 10; i++) {
      const code = 'C' + String(i).padStart(2, '0');
      const free = slot.available.includes(code);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'seat-btn';
      btn.dataset.seat = code;
      btn.disabled = !free;
      btn.setAttribute('aria-pressed', code === state.selectedResource ? 'true' : 'false');

      const label = document.createElement('span');
      label.textContent = `Puesto ${String(i).padStart(2, '0')}`;
      const badge = document.createElement('small');
      badge.textContent = free ? 'Libre' : 'Ocupado';
      btn.append(label, badge);

      btn.addEventListener('click', () => {
        state.selectedResource = code;
        for (const el of grid.querySelectorAll('button')) {
          el.setAttribute('aria-pressed', el.dataset.seat === code ? 'true' : 'false');
        }
        updateDurationSelect();
      });
      grid.appendChild(btn);
    }
  }

  updateDurationSelect();
  $('requestDialog').showModal();
  $('requesterName').focus();
}

async function loadDay(date, bannerMessage = '', bannerKind = 'ok') {
  const seq = ++state.loadSeq;
  if (!bannerMessage) setStatus('Consultando disponibilidad…', 'info');

  try {
    let data;
    if (demoMode) {
      data = buildDemoAvailability(date);
    } else {
      const { data: rpcData, error } = await supabase.rpc('get_public_availability', {
        p_date: date || null,
      });
      if (error) throw new Error(error.message);
      data = rpcData;
    }
    if (seq !== state.loadSeq) return;

    state.date = data.date;
    state.today = data.today;
    state.lastDate = data.last_date;
    state.slots = data.slots || [];

    renderWeek();
    renderRoom('radio', 'RADIO');
    renderRoom('qualOne', 'CUALITATIVO1');
    renderRoom('qualTwo', 'CUALITATIVO2');
    setStatus(bannerMessage, bannerKind);
  } catch (err) {
    if (seq !== state.loadSeq) return;
    setStatus(
      'No se pudo cargar la disponibilidad: ' + (err?.message || err),
      'error'
    );
  }
}

$('requestForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const errBox = $('requestError');
  errBox.hidden = true;

  const nameInput = $('requesterName');
  const emailInput = $('requesterEmail');
  const purposeInput = $('purpose');

  // Limpiar mensaje personalizado previo antes de comprobar validez nativa
  emailInput.setCustomValidity('');
  if (emailInput.value.trim() && !isValidUgrEmail(emailInput.value)) {
    emailInput.setCustomValidity('Usa un correo institucional terminado en ugr.es.');
  }

  if (!form.checkValidity()) {
    const firstInvalid = form.querySelector(':invalid');
    if (firstInvalid) {
      firstInvalid.dispatchEvent(new Event('invalid', { cancelable: true }));
      firstInvalid.focus();
    }
    return;
  }

  const submitBtn = $('submitRequest');
  const cancelBtn = $('cancelRequest');
  submitBtn.disabled = true;
  cancelBtn.disabled = true;

  try {
    const slot = state.activeSlot;
    const hours = Number($('duration').value) || 1;
    const payload = {
      p_name: nameInput.value.trim(),
      p_email: emailInput.value.trim().toLowerCase(),
      p_resource_id: state.selectedResource,
      p_date: slot.date,
      p_start_time: slot.start,
      p_hours: hours,
      p_purpose: purposeInput.value.trim(),
    };

    let created;
    if (demoMode) {
      const endHour = Number(slot.start.slice(0, 2)) + hours;
      const end = String(endHour).padStart(2, '0') + ':00';
      created = {
        id: 'demo-' + Math.random().toString(36).slice(2, 10),
        resource_label: RESOURCE_LABELS[state.selectedResource] || state.selectedResource,
        date: slot.date,
        start: slot.start,
        end,
      };
      demoState.bookings.push({
        id: created.id,
        resource_id: state.selectedResource,
        date: slot.date,
        start: slot.start,
        end,
        status: 'PENDIENTE',
      });
    } else {
      const { data, error } = await supabase.rpc('submit_booking_request', payload);
      if (error) throw new Error(error.message);
      created = data;
    }

    $('requestDialog').close();
    await loadDay(
      slot.date,
      `Solicitud enviada (${created.resource_label}, ${formatDateShortEs(created.date)} · ${created.start}–${created.end}). Queda pendiente de revisión y recibirás confirmación en ${payload.p_email}. Ref.: ${created.id}`,
      'ok'
    );
  } catch (err) {
    errBox.textContent = err?.message || 'No se pudo enviar la solicitud.';
    errBox.hidden = false;
  } finally {
    submitBtn.disabled = false;
    cancelBtn.disabled = false;
  }
});

$('requestDialog').addEventListener('close', () => {
  $('requestDialog').returnValue = '';
});
$('cancelRequest').addEventListener('click', () => $('requestDialog').close());
$('prev').addEventListener('click', () => loadDay(clampDate(addDays(state.date, -7))));
$('next').addEventListener('click', () => loadDay(clampDate(addDays(state.date, 7))));
$('today').addEventListener('click', () => loadDay(state.today));
$('refresh').addEventListener('click', () => loadDay(state.date));
$('date').addEventListener('change', (e) => {
  if (e.target.value) loadDay(clampDate(e.target.value));
});

if (demoMode) {
  $('demoBanner').hidden = false;
}

initDialogLightDismissFallback();
initAccessibleValidation();
loadDay('');
