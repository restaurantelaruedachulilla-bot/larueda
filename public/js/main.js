document.getElementById('anio').textContent = new Date().getFullYear();

// Menú móvil
const navToggle = document.getElementById('nav-toggle');
const mainNav = document.getElementById('main-nav');
navToggle.addEventListener('click', () => mainNav.classList.toggle('open'));
mainNav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => mainNav.classList.remove('open')));

// Galería (lightbox)
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
document.querySelectorAll('.galeria-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    lightboxImg.src = btn.dataset.full;
    lightboxImg.alt = btn.querySelector('img').alt;
    lightbox.hidden = false;
  });
});
document.getElementById('lightbox-cerrar').addEventListener('click', () => { lightbox.hidden = true; });
lightbox.addEventListener('click', (e) => { if (e.target === lightbox) lightbox.hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') lightbox.hidden = true; });

// Cargar carta y menús desde la API
async function cargarCarta() {
  const contenedorCarta = document.getElementById('carta-contenido');
  const contenedorMenus = document.getElementById('menus-contenido');
  const avisoCarta = document.getElementById('carta-aviso');

  try {
    const res = await fetch('/api/menu');
    const data = await res.json();

    if (data.aviso) avisoCarta.textContent = data.aviso;

    contenedorCarta.innerHTML = data.carta
      .map((cat) => ({ ...cat, platos: cat.platos.filter((p) => p.visible !== false) }))
      .filter((cat) => cat.platos.length)
      .map((cat) => `
      <div class="carta-categoria">
        <h3>${escapeHtml(cat.categoria)}</h3>
        ${cat.platos.map((p) => `
          <div class="plato">
            <div>
              <div class="plato-nombre">${escapeHtml(p.nombre)}</div>
              ${p.descripcion ? `<div class="plato-desc">${escapeHtml(p.descripcion)}</div>` : ''}
            </div>
            <div class="plato-precio">${escapeHtml(p.precio)}</div>
          </div>
        `).join('')}
      </div>
    `).join('');

    contenedorMenus.innerHTML = data.menus.map((menu) => `
      <div class="menu-card">
        <h3>${escapeHtml(menu.nombre)}</h3>
        <div class="menu-precio">${escapeHtml(menu.precio)}</div>
        <div class="menu-condiciones">${escapeHtml(menu.condiciones || '')}</div>
        ${menu.secciones
          .map((sec) => ({ ...sec, platos: sec.platos.filter((p) => p.visible !== false) }))
          .filter((sec) => sec.platos.length)
          .map((sec) => `
          <div class="menu-seccion-titulo">${escapeHtml(sec.titulo)}</div>
          <ul>${sec.platos.map((pl) => `<li>${escapeHtml(pl.nombre)}</li>`).join('')}</ul>
        `).join('')}
      </div>
    `).join('');
  } catch (err) {
    contenedorCarta.innerHTML = '<p class="cargando">No se ha podido cargar la carta. Inténtalo de nuevo más tarde.</p>';
    contenedorMenus.innerHTML = '';
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

cargarCarta();

// Formulario de reservas
const formReserva = document.getElementById('form-reserva');
const btnReservar = document.getElementById('btn-reservar');
const mensajeReserva = document.getElementById('reserva-mensaje');
const inputFecha = document.getElementById('fecha');
const inputPersonas = document.getElementById('personas');
const selectTurno = document.getElementById('franjaId');
const turnoAyuda = document.getElementById('turno-ayuda');
const avisoGrupoGrande = document.getElementById('aviso-grupo-grande');
const filaTurno = document.getElementById('fila-turno');

const LIMITE_GRUPO_TELEFONO = 8;

const hoy = new Date().toISOString().slice(0, 10);
inputFecha.min = hoy;

function esGrupoGrande() {
  return Number(inputPersonas.value) >= LIMITE_GRUPO_TELEFONO;
}

async function actualizarFormularioReserva() {
  if (esGrupoGrande()) {
    avisoGrupoGrande.hidden = false;
    filaTurno.hidden = true;
    selectTurno.required = false;
    selectTurno.value = '';
    btnReservar.disabled = true;
    return;
  }

  avisoGrupoGrande.hidden = true;
  filaTurno.hidden = false;
  selectTurno.required = true;
  btnReservar.disabled = false;
  await actualizarTurnos();
}

async function actualizarTurnos() {
  const fecha = inputFecha.value;
  const personas = Number(inputPersonas.value) || 0;

  if (!fecha) {
    selectTurno.innerHTML = '<option value="">Elige antes la fecha y el número de personas</option>';
    turnoAyuda.textContent = '';
    return;
  }

  selectTurno.innerHTML = '<option value="">Cargando turnos...</option>';

  try {
    const res = await fetch(`/api/disponibilidad?fecha=${encodeURIComponent(fecha)}`);
    const data = await res.json();

    if (!data.franjas.length) {
      selectTurno.innerHTML = '<option value="">Ese día cerramos</option>';
      turnoAyuda.textContent = 'Ese día no tenemos servicio. Elige otra fecha o llámanos al 613 72 76 80.';
      return;
    }

    selectTurno.innerHTML =
      '<option value="">Elige un turno</option>' +
      data.franjas.map((f) => {
        const cabe = !f.cerrada && (!personas || f.disponibles >= personas);
        const motivo = f.cerrada ? ' (cerrado)' : (cabe ? '' : ' (no disponible)');
        const etiqueta = `${f.nombre} · ${f.inicio}–${f.fin}${motivo}`;
        return `<option value="${f.id}" ${!cabe ? 'disabled' : ''}>${escapeHtml(etiqueta)}</option>`;
      }).join('');

    turnoAyuda.textContent = personas
      ? 'Los turnos marcados como "no disponible" no tienen sitio para tantas personas ese día.'
      : 'Indica cuántas personas sois para ver qué turnos tienen sitio.';
  } catch (err) {
    selectTurno.innerHTML = '<option value="">No se han podido cargar los turnos</option>';
  }
}

inputFecha.addEventListener('change', actualizarFormularioReserva);
inputPersonas.addEventListener('input', actualizarFormularioReserva);

formReserva.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (esGrupoGrande()) {
    avisoGrupoGrande.hidden = false;
    return;
  }

  btnReservar.disabled = true;
  btnReservar.textContent = 'Enviando...';
  mensajeReserva.textContent = '';
  mensajeReserva.className = 'reserva-mensaje';

  const datos = Object.fromEntries(new FormData(formReserva).entries());

  try {
    const res = await fetch('/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error al enviar la reserva');

    mensajeReserva.textContent = `¡Gracias! Hemos recibido tu solicitud de reserva (${json.turno}). Te confirmaremos en breve.`;
    mensajeReserva.classList.add('ok');
    formReserva.reset();
    selectTurno.innerHTML = '<option value="">Elige antes la fecha y el número de personas</option>';
    avisoGrupoGrande.hidden = true;
    filaTurno.hidden = false;
  } catch (err) {
    mensajeReserva.textContent = err.message || 'No se ha podido enviar la reserva. Prueba a llamarnos al 613 72 76 80.';
    mensajeReserva.classList.add('error');
  } finally {
    btnReservar.disabled = false;
    btnReservar.textContent = 'Enviar solicitud de reserva';
  }
});
