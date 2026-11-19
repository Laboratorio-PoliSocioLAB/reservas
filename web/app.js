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

const SPACE_META = {
  RADIO: {
    name: ROOM_NAMES.RADIO,
    subtitle: 'Reserva del espacio completo · Lunes a viernes, 08:00–21:00.',
    image: 'assets/space-radio.svg',
    alt: 'Laboratorio de radio de PoliSocioLAB',
  },
  CUALITATIVO1: {
    name: ROOM_NAMES.CUALITATIVO1,
    subtitle: 'Reserva del espacio completo · Lunes a viernes, 08:00–21:00.',
    image: 'assets/space-cualitativo1.svg',
    alt: 'Laboratorio cualitativo 1 de PoliSocioLAB',
  },
  CUALITATIVO2: {
    name: ROOM_NAMES.CUALITATIVO2,
    subtitle: 'Aforo máximo de 10 plazas · Lunes a viernes, 08:00–21:00.',
    image: 'assets/space-cualitativo2.svg',
    alt: 'Laboratorio cualitativo 2 de PoliSocioLAB',
  },
};

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
  selectedRoom: '',
  date: '',
  today: '',
  lastDate: '',
  slots: [],
  activeSlot: null,
  selectedResource: '',
  loadSeq: 0,
  userEmail: '',
  userName: '',
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

function getCleanRedirectUrl() {
  return window.location.origin + window.location.pathname;
}

function clearTransitionNames() {
  document.querySelectorAll('.space-card > img').forEach((img) => {
    img.style.viewTransitionName = '';
  });
  $('detailSpaceImg').style.viewTransitionName = '';
}

function showAuthGate(message = '', kind = 'info') {
  state.userEmail = '';
  state.userName = '';
  state.selectedRoom = '';
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
  renderUserAvatar($('sessionAvatar'), $('sessionAvatarFallback'), {
    avatarUrl,
    name: fullName,
    email,
  });
  $('authGate').hidden = true;
  $('appContent').hidden = false;
}

function renderWeek() {
  const wrap = $('week');
  wrap.replaceChildren();
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

function renderSelectedRoomSlots() {
  const box = $('spaceSlots');
  box.replaceChildren();
  const roomKey = state.selectedRoom;
  if (!roomKey) return;

  const list = state.slots.filter((s) => s.room === roomKey);
  const isCapacityPool = roomKey === 'CUALITATIVO2';

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
    if (isCapacityPool) {
      meta.textContent =
        slot.available.length === 1
          ? '1 de 10 plazas libres'
          : slot.available.length
            ? `${slot.available.length} de 10 plazas libres`
            : 'Sin plazas libres (0 de 10)';
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
      btn.textContent = 'Solicitar';
      btn.setAttribute(
        'aria-label',
        `Solicitar · ${ROOM_NAMES[roomKey]} · ${slot.start}–${slot.end}`
      );
      btn.addEventListener('click', () => openRequestDialog(slot));
      row.appendChild(btn);
    }
    box.appendChild(row);
  }
}

function openSpaceDetail(roomKey) {
  const meta = SPACE_META[roomKey];
  if (!meta) return;

  state.selectedRoom = roomKey;
  const cardImg = document.querySelector(`.space-card[data-room="${roomKey}"] > img`);
  const detailImg = $('detailSpaceImg');

  const applyView = () => {
    detailImg.src = meta.image;
    detailImg.alt = meta.alt;
    $('detailSpaceTitle').textContent = meta.name;
    $('detailSpaceSubtitle').textContent = meta.subtitle;
    $('spaceMenuView').hidden = true;
    $('spaceDetailView').hidden = false;
    if (state.slots.length) {
      renderWeek();
      renderSelectedRoomSlots();
    }
  };

  clearTransitionNames();
  if (!document.startViewTransition) {
    applyView();
    $('detailSpaceTitle').focus();
  } else {
    if (cardImg) cardImg.style.viewTransitionName = 'selected-space-photo';
    const transition = document.startViewTransition(() => {
      if (cardImg) cardImg.style.viewTransitionName = '';
      detailImg.style.viewTransitionName = 'selected-space-photo';
      applyView();
    });
    transition.finished.finally(() => {
      clearTransitionNames();
      $('detailSpaceTitle').focus();
    });
  }

  loadDay(state.date || '');
}

function returnToSpaceMenu() {
  const previousRoom = state.selectedRoom;
  const cardImg = previousRoom
    ? document.querySelector(`.space-card[data-room="${previousRoom}"] > img`)
    : null;
  const detailImg = $('detailSpaceImg');

  const applyView = () => {
    state.selectedRoom = '';
    $('spaceDetailView').hidden = true;
    $('spaceMenuView').hidden = false;
    setStatus('');
  };

  clearTransitionNames();
  if (!document.startViewTransition) {
    applyView();
    $('spaceMenuTitle').focus();
  } else {
    detailImg.style.viewTransitionName = 'selected-space-photo';
    const transition = document.startViewTransition(() => {
      detailImg.style.viewTransitionName = '';
      if (cardImg) cardImg.style.viewTransitionName = 'selected-space-photo';
      applyView();
    });
    transition.finished.finally(() => {
      clearTransitionNames();
      $('spaceMenuTitle').focus();
    });
  }
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
  $('requestError').hidden = true;
  const capacityText = isCapacityPool ? ` · 1 plaza (${slot.available.length}/10 libres)` : '';
  $('requestMeta').textContent =
    `${ROOM_NAMES[slot.room]} · ${formatDateShortEs(slot.date)} · inicio a las ${slot.start}${capacityText}`;

  updateDurationSelect();
  $('requestDialog').showModal();
  $('duration').focus();
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

    if (state.selectedRoom) {
      renderWeek();
      renderSelectedRoomSlots();
    }
    setStatus(bannerMessage, bannerKind);
  } catch (err) {
    if (seq !== state.loadSeq) return;
    setStatus(
      'No se pudo cargar la disponibilidad: ' + (err?.message || err),
      'error'
    );
  }
}

async function syncAuthSession(session) {
  if (demoMode) {
    showAppForUser('demo@go.ugr.es', 'Usuario demo');
    $('spaceMenuView').hidden = false;
    $('spaceDetailView').hidden = true;
    setStatus('');
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
      `La cuenta ${email} no pertenece al dominio @go.ugr.es. Inicia sesión con tu cuenta institucional de la UGR (@go.ugr.es).`,
      'error'
    );
    return;
  }

  const fullName = getGoogleIdentityDisplayName(session.user);
  const avatarUrl = getSafeGoogleAvatarUrl(session.user);
  const sameUser = state.userEmail === email && !$('appContent').hidden;

  showAppForUser(email, fullName, avatarUrl);
  if (!sameUser) {
    state.selectedRoom = '';
    $('spaceMenuView').hidden = false;
    $('spaceDetailView').hidden = true;
    setStatus('');
  }
}

async function signInWithGoogle() {
  if (demoMode) return;
  const btn = $('googleLoginBtn');
  btn.disabled = true;
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
    setStatus('No se pudo iniciar sesión con Google: ' + error.message, 'error');
  }
}

$('googleLoginBtn').addEventListener('click', signInWithGoogle);

$('logoutBtn').addEventListener('click', async () => {
  if (demoMode) return;
  await supabase.auth.signOut();
  showAuthGate('Has cerrado sesión. Puedes volver a entrar con tu cuenta @go.ugr.es.', 'info');
});

for (const btn of document.querySelectorAll('.card-action[data-room]')) {
  btn.addEventListener('click', () => openSpaceDetail(btn.dataset.room));
}

$('backToSpaces').addEventListener('click', returnToSpaceMenu);

$('requestForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const errBox = $('requestError');
  errBox.hidden = true;

  const purposeInput = $('purpose');

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
      p_name: state.userName || state.userEmail.split('@')[0] || '',
      p_email: state.userEmail,
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
