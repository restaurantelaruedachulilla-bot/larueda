document.getElementById('anio').textContent = new Date().getFullYear();

// Cartel de cierre por descanso del personal (9-15 de noviembre de 2026).
(function mostrarAvisoCierre() {
  const hoy = new Date().toLocaleDateString('sv-SE');
  if (hoy >= '2026-11-09' && hoy <= '2026-11-15') {
    document.getElementById('aviso-cierre').hidden = false;
  }
})();

// Los 14 alergenos de declaracion obligatoria segun el Reglamento (UE) 1169/2011.
const ALERGENOS = [
  { clave: 'gluten', nombre: 'Gluten', icono: '🌾' },
  { clave: 'crustaceos', nombre: 'Crustáceos', icono: '🦐' },
  { clave: 'huevos', nombre: 'Huevos', icono: '🥚' },
  { clave: 'pescado', nombre: 'Pescado', icono: '🐟' },
  { clave: 'cacahuetes', nombre: 'Cacahuetes', icono: '🥜' },
  { clave: 'soja', nombre: 'Soja', icono: '🌱' },
  { clave: 'lacteos', nombre: 'Lácteos', icono: '🥛' },
  { clave: 'frutos-cascara', nombre: 'Frutos de cáscara', icono: '🌰' },
  { clave: 'apio', nombre: 'Apio', icono: '🥬' },
  { clave: 'mostaza', nombre: 'Mostaza', icono: '🟡' },
  { clave: 'sesamo', nombre: 'Sésamo', icono: '🟤' },
  { clave: 'sulfitos', nombre: 'Sulfitos', icono: '🍷' },
  { clave: 'altramuces', nombre: 'Altramuces', icono: '🫘' },
  { clave: 'moluscos', nombre: 'Moluscos', icono: '🐚' },
];

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

// Cargar carta, vinos y menús desde la API
async function cargarCarta() {
  const contenedorCarta = document.getElementById('carta-contenido');
  const contenedorVinos = document.getElementById('vinos-contenido');
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
        <h3 data-i18n>${escapeHtml(cat.categoria)}</h3>
        ${cat.nota ? `<p class="carta-categoria-nota" data-i18n>${escapeHtml(cat.nota)}</p>` : ''}
        ${cat.platos.map((p) => `
          <div class="plato">
            <div>
              <div class="plato-nombre" data-i18n>${escapeHtml(p.nombre)}</div>
              ${p.descripcion ? `<div class="plato-desc" data-i18n>${escapeHtml(p.descripcion)}</div>` : ''}
              ${iconosAlergenos(p.alergenos)}
            </div>
            <div class="plato-precio">${escapeHtml(p.precio)}</div>
          </div>
        `).join('')}
      </div>
    `).join('') + leyendaAlergenos();

    contenedorVinos.innerHTML = (data.vinos || [])
      .map((cat) => ({
        ...cat,
        grupos: cat.grupos
          .map((g) => ({ ...g, vinos: g.vinos.filter((v) => v.visible !== false) }))
          .filter((g) => g.vinos.length),
      }))
      .filter((cat) => cat.grupos.length)
      .map((cat) => `
      <details class="vinos-categoria">
        <summary data-i18n>${escapeHtml(cat.categoria)}</summary>
        ${cat.grupos.map((g) => `
          ${g.denominacion ? `<h4 class="vinos-denominacion" data-i18n>${escapeHtml(g.denominacion)}</h4>` : ''}
          ${g.vinos.map((v) => `
            <div class="vino">
              <div>
                <div class="vino-nombre">${escapeHtml(v.nombre)}</div>
                ${v.descripcion ? `<div class="vino-desc">${escapeHtml(v.descripcion)}</div>` : ''}
              </div>
              <div class="vino-precio">${escapeHtml(formatearPrecioVino(v))}</div>
            </div>
          `).join('')}
        `).join('')}
      </details>
    `).join('');

    contenedorMenus.innerHTML = data.menus.map((menu) => `
      <div class="menu-card">
        <h3 data-i18n>${escapeHtml(menu.nombre)}</h3>
        <div class="menu-precio">${escapeHtml(menu.precio)}</div>
        <div class="menu-condiciones" data-i18n>${escapeHtml(menu.condiciones || '')}</div>
        ${menu.secciones
          .map((sec) => ({ ...sec, platos: sec.platos.filter((p) => p.visible !== false) }))
          .filter((sec) => sec.platos.length)
          .map((sec) => `
          <div class="menu-seccion-titulo" data-i18n>${escapeHtml(sec.titulo)}</div>
          <ul>${sec.platos.map((pl) => `
            <li>
              <span class="menu-plato-nombre" data-i18n>${escapeHtml(pl.nombre)}</span>
              ${pl.descripcion ? `<span class="menu-plato-desc" data-i18n>${escapeHtml(pl.descripcion)}</span>` : ''}
            </li>
          `).join('')}</ul>
        `).join('')}
      </div>
    `).join('');

    refrescarTraduccion([avisoCarta, contenedorCarta, contenedorVinos, contenedorMenus]);
  } catch (err) {
    contenedorCarta.innerHTML = '<p class="cargando">No se ha podido cargar la carta. Inténtalo de nuevo más tarde.</p>';
    contenedorVinos.innerHTML = '';
    contenedorMenus.innerHTML = '';
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function iconosAlergenos(claves) {
  if (!Array.isArray(claves) || !claves.length) return '';
  const iconos = ALERGENOS.filter((a) => claves.includes(a.clave));
  if (!iconos.length) return '';
  return `<div class="plato-alergenos">${iconos.map((a) => `<span title="${escapeHtml(a.nombre)}">${a.icono}</span>`).join('')}</div>`;
}

function leyendaAlergenos() {
  return `
    <div class="leyenda-alergenos">
      <p class="leyenda-alergenos-titulo" data-i18n>Alérgenos</p>
      <div class="leyenda-alergenos-lista">
        ${ALERGENOS.map((a) => `<span>${a.icono} <span data-i18n>${escapeHtml(a.nombre)}</span></span>`).join('')}
      </div>
    </div>
  `;
}

// Solo se publica el precio que este relleno (copa y/o botella): si un vino no se vende por
// copas, esa casilla se deja vacia en el panel y aqui no se muestra nada de "copa".
function formatearPrecioVino(v) {
  const partes = [];
  if (v.precioCopa) partes.push(`${v.precioCopa} copa`);
  if (v.precioBotella) partes.push(`${v.precioBotella} botella`);
  return partes.join(' · ');
}

// ---------- Traducción automática de la web ----------
// La carta cambia cada día, así que en vez de traducir a mano en 5 idiomas, cada elemento
// marcado con data-i18n guarda su texto en español (data-es) y se traduce al vuelo al
// cambiar de idioma (con caché en el servidor para no traducir lo mismo dos veces).
let idiomaActual = localStorage.getItem('idioma') || 'es';

function marcarTraducibles(raiz) {
  if (!raiz) return;
  if (raiz.hasAttribute && raiz.hasAttribute('data-i18n')) raiz.dataset.es = raiz.textContent;
  raiz.querySelectorAll('[data-i18n]').forEach((el) => {
    el.dataset.es = el.textContent;
  });
}

async function aplicarIdioma(idioma) {
  idiomaActual = idioma;
  localStorage.setItem('idioma', idioma);
  document.querySelectorAll('.idioma-btn').forEach((btn) => {
    btn.classList.toggle('idioma-activo', btn.dataset.idioma === idioma);
  });

  const elementos = Array.from(document.querySelectorAll('[data-i18n]'))
    .filter((el) => el.dataset.es && el.dataset.es.trim());

  if (idioma === 'es') {
    elementos.forEach((el) => { el.textContent = el.dataset.es; });
    return;
  }

  const textos = elementos.map((el) => el.dataset.es);
  try {
    const res = await fetch('/api/traducir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ textos, destino: idioma }),
    });
    const data = await res.json();
    elementos.forEach((el, i) => {
      if (data.textos && data.textos[i]) el.textContent = data.textos[i];
    });
  } catch (err) {
    // Si falla la traducción nos quedamos con el texto en español: la web nunca se rompe.
  }
}

// raices: elementos cuyo contenido en español se acaba de escribir/refrescar ahora mismo
// (por eso es seguro volver a capturarlo como data-es). Nunca se pasa "document" aquí salvo
// en la carga inicial, para no pisar con texto ya traducido el data-es de otros elementos
// que puedan estar traduciéndose en paralelo (ej. mientras carga la carta).
function refrescarTraduccion(raices) {
  (raices || [document]).forEach((raiz) => marcarTraducibles(raiz));
  aplicarIdioma(idiomaActual);
}

document.querySelectorAll('.idioma-btn').forEach((btn) => {
  btn.addEventListener('click', () => aplicarIdioma(btn.dataset.idioma));
});

marcarTraducibles(document);
aplicarIdioma(idiomaActual);

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
    selectTurno.innerHTML = '<option value="" data-i18n>Elige antes la fecha y el número de personas</option>';
    turnoAyuda.textContent = '';
    return;
  }

  selectTurno.innerHTML = '<option value="" data-i18n>Cargando turnos...</option>';

  try {
    const res = await fetch(`/api/disponibilidad?fecha=${encodeURIComponent(fecha)}`);
    const data = await res.json();

    if (!data.franjas.length) {
      selectTurno.innerHTML = '<option value="" data-i18n>Ese día cerramos</option>';
      turnoAyuda.textContent = 'Ese día no tenemos servicio. Elige otra fecha o llámanos al 613 72 76 80.';
      refrescarTraduccion([selectTurno, turnoAyuda]);
      return;
    }

    selectTurno.innerHTML =
      '<option value="" data-i18n>Elige un turno</option>' +
      data.franjas.map((f) => {
        const cabe = !f.cerrada && (!personas || f.disponibles >= personas);
        const motivo = f.cerrada ? ' (cerrado)' : (cabe ? '' : ' (no disponible)');
        const etiqueta = `${f.nombre} · ${f.inicio}–${f.fin}${motivo}`;
        return `<option value="${f.id}" ${!cabe ? 'disabled' : ''} data-i18n>${escapeHtml(etiqueta)}</option>`;
      }).join('');

    turnoAyuda.textContent = personas
      ? 'Los turnos marcados como "no disponible" no tienen sitio para tantas personas ese día.'
      : 'Indica cuántas personas sois para ver qué turnos tienen sitio.';
    refrescarTraduccion([selectTurno, turnoAyuda]);
  } catch (err) {
    selectTurno.innerHTML = '<option value="">No se han podido cargar los turnos</option>';
  }

  actualizarZonasDisponibles();
}

const selectZona = document.getElementById('zona');
const zonaAyuda = document.getElementById('zona-ayuda');

async function actualizarZonasDisponibles() {
  Array.from(selectZona.options).forEach((opt) => { opt.disabled = false; });
  zonaAyuda.textContent = '';

  const fecha = inputFecha.value;
  const franjaId = selectTurno.value;
  const personas = Number(inputPersonas.value) || 0;
  if (!fecha || !franjaId || !personas) { refrescarTraduccion([zonaAyuda]); return; }

  try {
    const res = await fetch(`/api/zonas-disponibles?fecha=${encodeURIComponent(fecha)}&franjaId=${encodeURIComponent(franjaId)}&personas=${personas}`);
    const data = await res.json();
    const sinSitio = Object.entries(data.zonas || {}).filter(([, disponible]) => !disponible).map(([zona]) => zona);

    sinSitio.forEach((zona) => {
      const opt = Array.from(selectZona.options).find((o) => o.value === zona);
      if (opt) opt.disabled = true;
    });

    const actual = selectZona.selectedOptions[0];
    if (actual && actual.disabled) selectZona.value = '';

    if (sinSitio.length === 1) {
      zonaAyuda.textContent = `No quedan mesas en la zona ${sinSitio[0]} para ese turno ese día.`;
    } else if (sinSitio.length > 1) {
      zonaAyuda.textContent = 'No quedan mesas libres en ninguna zona para ese turno ese día.';
    }
    refrescarTraduccion([zonaAyuda]);
  } catch (err) {
    // Si falla la comprobación dejamos todas las zonas seleccionables: nunca bloqueamos al cliente por esto.
  }
}

inputFecha.addEventListener('change', actualizarFormularioReserva);
inputPersonas.addEventListener('input', actualizarFormularioReserva);
selectTurno.addEventListener('change', actualizarZonasDisponibles);

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
    selectTurno.innerHTML = '<option value="" data-i18n>Elige antes la fecha y el número de personas</option>';
    avisoGrupoGrande.hidden = true;
    filaTurno.hidden = false;
  } catch (err) {
    mensajeReserva.textContent = err.message || 'No se ha podido enviar la reserva. Prueba a llamarnos al 613 72 76 80.';
    mensajeReserva.classList.add('error');
  } finally {
    btnReservar.disabled = false;
    btnReservar.textContent = 'Enviar solicitud de reserva';
    refrescarTraduccion([selectTurno, btnReservar]);
  }
});
