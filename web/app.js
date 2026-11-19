import { createClient } from './vendor/supabase-js.mjs';
import { CONFIG, isConfigured } from './config.js';
import {
  ROOM_NAMES,
  RESOURCE_LABELS,
  isValidGoUgrEmail,
  getGoogleIdentityDisplayName,
  getSafeGoogleAvatarUrl,
  renderUserAvatar,
  addDays,
  mondayOf,
  computeConsecutiveHours,
  formatMadridToday,
  formatDateLongEs,
  formatWeekdayShortEs,
  formatDayNumberEs,
  formatDateShortEs,
  initDialogLightDismissFallback,
  initAccessibleValidation,
} from './shared.js';

const $ = (id) => document.getElementById(id);
const demoMode = !isConfigured();
const supabase = demoMode
  ? null
  : createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
      },
    });

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const SPACE_META = {
  RADIO: {
    name: ROOM_NAMES.RADIO,
    subtitle: 'Reserva del espacio completo · Lunes a viernes, 08:00–21:00.',
    caption: 'Cabina de locución y control técnico · Reserva de sala completa.',
    image: 'assets/space-radio.svg',
    alt: 'Esquema arquitectónico del Laboratorio de radio',
    capacity: 1,
  },
  CUALITATIVO1: {
    name: ROOM_NAMES.CUALITATIVO1,
    subtitle: 'Reserva del espacio completo · Lunes a viernes, 08:00–21:00.',
    caption: 'Sala de grupos de discusión y entrevistas · Reserva de sala completa.',
    image: 'assets/space-cualitativo1.svg',
    alt: 'Esquema arquitectónico del Laboratorio cualitativo 1',
    capacity: 1,
  },
  CUALITATIVO2: {
    name: ROOM_NAMES.CUALITATIVO2,
    subtitle: 'Aforo máximo de 10 plazas simultáneas · Lunes a viernes, 08:00–21:00.',
    caption: '10 puestos individuales con asignación automática de plaza libre.',
    image: 'assets/space-cualitativo2.svg',
    alt: 'Esquema arquitectónico del Laboratorio cualitativo 2 de 10 plazas',
    capacity: 10,
  },
};

function createSyntheticDemoBookings() {
  const today = formatMadridToday();
  const sampleDate = (() => {
    let cursor = today;
    for (let i = 0; i < 7; i++) {
      const isoDay = new Date(cursor + 'T00:00:00Z').getUTCDay() || 7;
      if (isoDay >= 1 && isoDay <= 5) return cursor;
      cursor = addDays(cursor, 1);
    }
    return today;
  })();

  const bookings = [
    { id: 'demo-r1', resource_id: 'RADIO', date: sampleDate, start: '10:00', end: '12:00', status: 'APROBADA' },
    { id: 'demo-q1', resource_id: 'CUALITATIVO1', date: sampleDate, start: '12:00', end: '14:00', status: 'APROBADA' },
  ];

  // Ocupación parcial (6 libres), escasa (2 libres) y completa (0 libres) en Cualitativo 2
  for (let i = 1; i <= 4; i++) {
    bookings.push({
      id: `demo-c-part-${i}`,
      resource_id: 'C' + String(i).padStart(2, '0'),
      date: sampleDate,
      start: '10:00',
      end: '11:00',
      status: 'APROBADA',
    });
  }
  for (let i = 1; i <= 8; i++) {
    bookings.push({
      id: `demo-c-low-${i}`,
      resource_id: 'C' + String(i).padStart(2, '0'),
      date: sampleDate,
      start: '11:00',
      end: '12:00',
      status: 'APROBADA',
    });
  }
  for (let i = 1; i <= 10; i++) {
    bookings.push({
      id: `demo-c-full-${i}`,
      resource_id: 'C' + String(i).padStart(2, '0'),
      date: sampleDate,
      start: '12:00',
      end: '13:00',
      status: 'APROBADA',
    });
  }
  return bookings;
}

const demoState = {
  bookings: demoMode ? createSyntheticDemoBookings() : [],
};

function buildDemoAvailability(requestedDate) {
  const today = formatMadridToday();
  const lastDate = addDays(today, 60);
  let date = requestedDate && ISO_DATE_RE.test(requestedDate) ? requestedDate : today;
  if (date < today) date = today;
  if (date > lastDate) date = lastDate;

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

function readInitialUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  const date = params.get('date');
  return {
    room: room && SPACE_META[room] ? room : 'RADIO',
    date: date && ISO_DATE_RE.test(date) ? date : '',
  };
}

const initialUrl = readInitialUrlParams();

const state = {
  selectedRoom: initialUrl.room,
  date: initialUrl.date,
  today: '',
  lastDate: '',
  slots: [],
  activeSlot: null,
  selectedResource: '',
  loadSeq: 0,
  userEmail: '',
  userName: '',
};

function syncUrlState() {
  const current = new URLSearchParams(window.location.search);
  if (current.has('code') || current.has('error')) return;
  const next = new URLSearchParams();
  if (state.selectedRoom) next.set('room', state.selectedRoom);
  if (state.date) next.set('date', state.date);
  const query = next.toString();
  const target = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState(null, '', target);
}

function setStatus(message, kind = 'info') {
  const el = $('status');
  if (!message) {
    el.hidden = true;
    el.textContent = '';
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

function nextWeekdayAfter(iso) {
  let cursor = addDays(iso, 1);
  for (let i = 0; i < 7; i++) {
    const isoDay = new Date(cursor + 'T00:00:00Z').getUTCDay() || 7;
    if (isoDay >= 1 && isoDay <= 5) return clampDate(cursor);
    cursor = addDays(cursor, 1);
  }
  return clampDate(cursor);
}

function getCleanRedirectUrl() {
  return window.location.origin + window.location.pathname;
}

function showAuthGate(message = '', kind = 'info') {
  state.userEmail = '';
  state.userName = '';
  $('topbarSession').hidden = true;
  $('authGate').hidden = false;
  $('appContent').hidden = true;
  if ($('requestDialog').open) $('requestDialog').close();
  setStatus(message, kind);
}

function showAppForUser(email, fullName = '', avatarUrl = '') {
  state.userEmail = email;
  state.userName = fullName;
  $('sessionName').textContent = fullName || email;
  $('sessionEmail').textContent = fullName ? email : 'Cuenta UGR verificada';
  renderUserAvatar($('sessionAvatarSlot'), $('sessionAvatarFallback'), {
    avatarUrl,
    name: fullName,
    email,
  });
  $('topbarSession').hidden = false;
  $('authGate').hidden = true;
  $('appContent').hidden = false;
}

function renderSlotsSkeleton() {
  const box = $('spaceSlots');
  box.replaceChildren();
  for (let i = 0; i < 6; i++) {
    const row = document.createElement('div');
    row.className = 'skeleton-row';
    for (let j = 0; j < 3; j++) {
      const bar = document.createElement('div');
      bar.className = 'skeleton-bar';
      row.appendChild(bar);
    }
    box.appendChild(row);
  }
}

function fillSeatMeterCells(container, availableCount, total = 10) {
  container.replaceChildren();
  const isLow = availableCount > 0 && availableCount <= 3;
  for (let i = 0; i < total; i++) {
    const cell = document.createElement('span');
    cell.className = 'seat-cell';
    if (i >= availableCount) {
      cell.classList.add('is-used');
    } else if (isLow) {
      cell.classList.add('is-low');
    }
    container.appendChild(cell);
  }
}

function updateRoomRailMeta() {
  for (const roomKey of Object.keys(SPACE_META)) {
    const badge = document.querySelector(`[data-room-count="${roomKey}"]`);
    const btn = document.querySelector(`.room-tab[data-room="${roomKey}"]`);
    if (btn) {
      btn.setAttribute('aria-pressed', roomKey === state.selectedRoom ? 'true' : 'false');
    }
    const roomSlots = state.slots.filter((s) => s.room === roomKey);
    if (badge) {
      if (!roomSlots.length) {
        badge.textContent = 'Cerrado';
      } else {
        const openCount = roomSlots.filter((s) => Array.isArray(s.available) && s.available.length > 0).length;
        badge.textContent = openCount === 1 ? '1 libre' : `${openCount} libres`;
      }
    }
    if (roomKey === 'CUALITATIVO2') {
      const railMeter = $('railCualitativo2Meter');
      if (railMeter) {
        const avgFree = roomSlots.length
          ? Math.round(
              roomSlots.reduce((sum, s) => sum + (Array.isArray(s.available) ? s.available.length : 0), 0) /
                roomSlots.length
            )
          : 0;
        fillSeatMeterCells(railMeter, avgFree, 10);
      }
    }
  }
}

function updateRoomHeader() {
  const meta = SPACE_META[state.selectedRoom] || SPACE_META.RADIO;
  $('detailSpaceTitle').textContent = meta.name;
  $('detailSpaceSubtitle').textContent = meta.subtitle;
  $('detailSpaceImg').src = meta.image;
  $('detailSpaceImg').alt = meta.alt;
  $('detailSpaceCaption').textContent = meta.caption;
  document.title = `${meta.name} · PoliSocioLAB (UGR)`;
}

function renderWeek() {
  const wrap = $('week');
  wrap.replaceChildren();
  if (!state.date) return;

  const first = mondayOf(state.date);
  for (let i = 0; i < 7; i++) {
    const d = addDays(first, i);
    const isoDay = new Date(d + 'T00:00:00Z').getUTCDay() || 7;
    const isWeekend = isoDay >= 6;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = isWeekend ? 'day-btn is-weekend' : 'day-btn';
    btn.disabled = d < state.today || d > state.lastDate;
    if (d === state.date) btn.setAttribute('aria-current', 'date');
    btn.setAttribute(
      'aria-label',
      isWeekend ? `${formatDateLongEs(d)} (cerrado)` : formatDateLongEs(d)
    );

    const wd = document.createElement('small');
    wd.textContent = formatWeekdayShortEs(d);
    const num = document.createElement('strong');
    num.textContent = formatDayNumberEs(d);
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

function buildSeatMeter(availableCount, total = 10) {
  const meter = document.createElement('div');
  meter.className = 'seat-meter';
  meter.setAttribute('aria-hidden', 'true');
  fillSeatMeterCells(meter, availableCount, total);
  return meter;
}

function renderSelectedRoomSlots() {
  const box = $('spaceSlots');
  box.replaceChildren();
  const roomKey = state.selectedRoom;
  if (!roomKey) return;

  const list = state.slots.filter((s) => s.room === roomKey);
  const isCapacityPool = roomKey === 'CUALITATIVO2';
  const openSlots = list.filter((s) => s.available.length > 0).length;

  $('slotsSummary').textContent = list.length
    ? `${openSlots} de ${list.length} franjas con disponibilidad`
    : 'Sin franjas abiertas';

  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const title = document.createElement('strong');
    title.textContent = 'No hay turnos abiertos para este día';
    const copy = document.createElement('p');
    copy.textContent =
      'Los laboratorios abren de lunes a viernes entre las 08:00 y las 21:00. Elige otro día o salta al próximo día lectivo.';
    empty.append(title, copy);

    if (state.date && state.lastDate && state.date < state.lastDate) {
      const nextDate = nextWeekdayAfter(state.date);
      if (nextDate !== state.date) {
        const jumpBtn = document.createElement('button');
        jumpBtn.type = 'button';
        jumpBtn.className = 'primary';
        jumpBtn.textContent = `Ver ${formatDateShortEs(nextDate)}`;
        jumpBtn.addEventListener('click', () => loadDay(nextDate));
        empty.appendChild(jumpBtn);
      }
    }
    box.appendChild(empty);
    return;
  }

  const ul = document.createElement('ul');
  ul.className = 'slot-list';

  for (const slot of list) {
    const li = document.createElement('li');
    const freeCount = slot.available.length;
    li.className = freeCount ? 'slot-row' : 'slot-row is-full';

    const timeEl = document.createElement('div');
    timeEl.className = 'slot-time';
    timeEl.textContent = `${slot.start} – ${slot.end}`;

    const visualEl = document.createElement('div');
    visualEl.className = 'slot-visual';
    if (isCapacityPool) {
      visualEl.appendChild(buildSeatMeter(freeCount, 10));
    } else {
      const bar = document.createElement('div');
      bar.className = 'room-bar';
      const track = document.createElement('span');
      track.className = freeCount ? 'room-bar-track' : 'room-bar-track is-full';
      track.setAttribute('aria-hidden', 'true');
      const desc = document.createElement('span');
      desc.textContent = freeCount ? 'Sala completa' : 'Sala ocupada o bloqueada';
      bar.append(track, desc);
      visualEl.appendChild(bar);
    }

    const capEl = document.createElement('div');
    capEl.className = 'slot-capacity';
    if (isCapacityPool) {
      capEl.textContent = `${freeCount} / 10 plazas`;
      if (freeCount === 0) capEl.classList.add('is-full');
      else if (freeCount <= 3) capEl.classList.add('is-low');
    } else {
      capEl.textContent = freeCount ? 'Disponible' : 'Ocupado';
      if (!freeCount) capEl.classList.add('is-full');
    }

    const actionEl = document.createElement('div');
    actionEl.className = 'slot-action';
    if (!freeCount) {
      const tag = document.createElement('span');
      tag.className = 'status-tag';
      tag.dataset.state = 'COMPLETO';
      tag.textContent = 'Completo';
      actionEl.appendChild(tag);
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'primary';
      btn.textContent = 'Solicitar';
      btn.setAttribute(
        'aria-label',
        `Solicitar ${ROOM_NAMES[roomKey]} de ${slot.start} a ${slot.end}`
      );
      btn.addEventListener('click', () => openRequestDialog(slot));
      actionEl.appendChild(btn);
    }

    li.append(timeEl, visualEl, capEl, actionEl);
    ul.appendChild(li);
  }

  box.appendChild(ul);
}

function selectRoom(roomKey) {
  if (!SPACE_META[roomKey]) return;
  state.selectedRoom = roomKey;
  updateRoomHeader();
  updateRoomRailMeta();
  renderSelectedRoomSlots();
  syncUrlState();
}

function updatePurposeCounter() {
  const input = $('purpose');
  input.setCustomValidity('');
  $('purposeCounter').textContent = `${input.value.length} / 400`;
}

function updateDurationSelect() {
  const slot = state.activeSlot;
  if (!slot || !state.selectedResource) return;

  const opts = computeConsecutiveHours(state.slots, slot.room, slot.start, state.selectedResource, 6);
  const select = $('duration');
  select.replaceChildren();

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
  const isCapacityPool = slot.room === 'CUALITATIVO2';
  state.selectedResource = isCapacityPool ? 'CUALITATIVO2' : slot.available[0];

  $('requestForm').reset();
  $('purpose').setCustomValidity('');
  $('requestError').hidden = true;
  updatePurposeCounter();
  const capacityText = isCapacityPool ? ` · 1 plaza (${slot.available.length}/10 libres)` : '';
  $('requestMeta').textContent =
    `${ROOM_NAMES[slot.room]} · ${formatDateShortEs(slot.date)} · inicio a las ${slot.start}${capacityText}`;

  updateDurationSelect();
  $('requestDialog').showModal();
  $('duration').focus();
}

async function loadDay(date, bannerMessage = '', bannerKind = 'ok') {
  const seq = ++state.loadSeq;
  if (!bannerMessage) {
    setStatus('');
  }
  renderSlotsSkeleton();

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

    updateRoomHeader();
    updateRoomRailMeta();
    renderWeek();
    renderSelectedRoomSlots();
    syncUrlState();
    setStatus(bannerMessage, bannerKind);
  } catch (err) {
    if (seq !== state.loadSeq) return;
    $('spaceSlots').replaceChildren();
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const title = document.createElement('strong');
    title.textContent = 'No se pudo cargar la disponibilidad';
    const msg = document.createElement('p');
    msg.textContent = `${err?.message || err} Comprueba tu conexión e inténtalo de nuevo.`;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'primary';
    retry.textContent = 'Reintentar';
    retry.addEventListener('click', () => loadDay(date));
    empty.append(title, msg, retry);
    $('spaceSlots').appendChild(empty);
    setStatus('No se pudo cargar la disponibilidad. Comprueba tu conexión y pulsa «Actualizar».', 'error');
  }
}

async function syncAuthSession(session) {
  if (demoMode) {
    showAppForUser('demo@go.ugr.es', 'Usuario demo');
    await loadDay(state.date || '');
    return;
  }

  if (!session?.user?.email) {
    showAuthGate('', 'info');
    return;
  }

  const email = session.user.email.trim().toLowerCase();
  if (!isValidGoUgrEmail(email)) {
    await supabase.auth.signOut();
    showAuthGate(
      `La cuenta ${email} no pertenece al dominio @go.ugr.es. Cierra sesión en Google o selecciona tu cuenta institucional de la UGR (@go.ugr.es).`,
      'error'
    );
    return;
  }

  const fullName = getGoogleIdentityDisplayName(session.user);
  const avatarUrl = getSafeGoogleAvatarUrl(session.user);
  const sameUser = state.userEmail === email && !$('appContent').hidden;

  showAppForUser(email, fullName, avatarUrl);
  if (!sameUser) {
    await loadDay(state.date || '');
  }
}

async function signInWithGoogle() {
  if (demoMode) return;
  const btn = $('googleLoginBtn');
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  setStatus('Redirigiendo a Google (@go.ugr.es)…', 'info');

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: getCleanRedirectUrl(),
      queryParams: {
        hd: 'go.ugr.es',
        prompt: 'select_account',
      },
    },
  });

  if (error) {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    setStatus(`No se pudo iniciar sesión con Google (${error.message}). Reinténtalo o comprueba tu conexión.`, 'error');
  }
}

$('googleLoginBtn').addEventListener('click', signInWithGoogle);

$('logoutBtn').addEventListener('click', async () => {
  if (demoMode) {
    setStatus('Estás en modo demostración local. Conecta Supabase en web/config.js para iniciar sesión real con @go.ugr.es.', 'info');
    return;
  }
  await supabase.auth.signOut();
  showAuthGate('Has cerrado sesión. Puedes volver a entrar con tu cuenta @go.ugr.es.', 'info');
});

for (const btn of document.querySelectorAll('.room-tab[data-room]')) {
  btn.addEventListener('click', () => selectRoom(btn.dataset.room));
}

$('purpose').addEventListener('input', updatePurposeCounter);

window.addEventListener('beforeunload', (e) => {
  if ($('requestDialog').open && $('purpose').value.trim().length > 0) {
    e.preventDefault();
  }
});

$('requestForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const errBox = $('requestError');
  errBox.hidden = true;

  const purposeInput = $('purpose');
  const trimmedPurpose = purposeInput.value.trim();
  if (trimmedPurpose.length < 3) {
    purposeInput.setCustomValidity('Escribe al menos 3 caracteres válidos indicando el motivo o la asignatura.');
  } else {
    purposeInput.setCustomValidity('');
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
  const prevLabel = submitBtn.textContent;
  submitBtn.disabled = true;
  cancelBtn.disabled = true;
  submitBtn.setAttribute('aria-busy', 'true');
  submitBtn.textContent = 'Enviando solicitud…';

  try {
    const slot = state.activeSlot;
    const hours = Number($('duration').value) || 1;
    const payload = {
      p_name: state.userName || state.userEmail.split('@')[0] || '',
      p_email: state.userEmail,
      p_resource_id: state.selectedResource,
      p_date: slot.date,
      p_start_time: slot.start,
      p_hours: hours,
      p_purpose: trimmedPurpose,
    };

    let created;
    if (demoMode) {
      const endHour = Number(slot.start.slice(0, 2)) + hours;
      const end = String(endHour).padStart(2, '0') + ':00';
      const assigned = state.selectedResource === 'CUALITATIVO2' ? slot.available[0] : state.selectedResource;
      created = {
        id: 'demo-' + Math.random().toString(36).slice(2, 10),
        resource_label: RESOURCE_LABELS[state.selectedResource] || state.selectedResource,
        requester_email: state.userEmail,
        date: slot.date,
        start: slot.start,
        end,
      };
      demoState.bookings.push({
        id: created.id,
        resource_id: assigned,
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
    const notifyPromise = demoMode
      ? Promise.resolve()
      : supabase.functions
          .invoke('notify-new-request', { body: { bookingId: created.id } })
          .catch((notifyErr) => {
            console.warn('No se pudo enviar el aviso al personal:', notifyErr);
          });

    const targetEmail = created.requester_email || state.userEmail;
    await Promise.all([
      loadDay(
        slot.date,
        `Solicitud enviada (${created.resource_label}, ${formatDateShortEs(created.date)} · ${created.start}–${created.end}). Queda pendiente de revisión y recibirás confirmación en ${targetEmail}. Ref.: ${created.id}`,
        'ok'
      ),
      notifyPromise,
    ]);
  } catch (err) {
    errBox.textContent = `${err?.message || 'No se pudo enviar la solicitud.'} Revisa los datos o vuelve a intentarlo.`;
    errBox.hidden = false;
  } finally {
    submitBtn.disabled = false;
    cancelBtn.disabled = false;
    submitBtn.removeAttribute('aria-busy');
    submitBtn.textContent = prevLabel;
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

if (demoMode) {
  syncAuthSession(null);
} else {
  supabase.auth.onAuthStateChange((_event, session) => {
    syncAuthSession(session);
  });
  supabase.auth.getSession().then(({ data: { session } }) => {
    syncAuthSession(session);
  });
}
