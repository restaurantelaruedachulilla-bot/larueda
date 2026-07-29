let token = sessionStorage.getItem('adminToken') || null;
let menuActual = null;
let configActual = null;

const pantallaLogin = document.getElementById('pantalla-login');
const panel = document.getElementById('panel');

async function login(password) {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error('Contraseña incorrecta');
  const data = await res.json();
  return data.token;
}

document.getElementById('btn-login').addEventListener('click', async () => {
  const password = document.getElementById('input-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';
  try {
    token = await login(password);
    sessionStorage.setItem('adminToken', token);
    mostrarPanel();
  } catch (err) {
    errorEl.textContent = 'Contraseña incorrecta. Inténtalo de nuevo.';
  }
});

document.getElementById('input-password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-login').click();
});

document.getElementById('btn-logout').addEventListener('click', () => {
  sessionStorage.removeItem('adminToken');
  token = null;
  panel.hidden = true;
  pantallaLogin.hidden = false;
});

// Tabs
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => (p.hidden = true));
    btn.classList.add('active');
    const panelId = 'tab-' + btn.dataset.tab;
    document.getElementById(panelId).hidden = false;
    if (btn.dataset.tab === 'reservas') cargarReservas();
    if (btn.dataset.tab === 'menus') renderMenus();
    if (btn.dataset.tab === 'mesas') cargarConfigAdmin();
  });
});

async function mostrarPanel() {
  pantallaLogin.hidden = true;
  panel.hidden = false;
  await cargarCartaAdmin();
}

async function guardarMenu(msgElId) {
  const msg = document.getElementById(msgElId);
  msg.textContent = 'Guardando...';
  try {
    const res = await fetch('/api/menu', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify(menuActual),
    });
    if (!res.ok) throw new Error('fallo');
    msg.textContent = '✅ Guardado. Ya se ve actualizado en la web.';
    setTimeout(() => (msg.textContent = ''), 4000);
  } catch (err) {
    msg.textContent = '❌ No se ha podido guardar. Comprueba tu conexión.';
  }
}

// ---------- Carta ----------
async function cargarCartaAdmin() {
  const res = await fetch('/api/menu');
  menuActual = await res.json();
  renderCategorias();
}

function renderCategorias() {
  const cont = document.getElementById('lista-categorias');
  cont.innerHTML = '';
  menuActual.carta.forEach((cat, ci) => {
    const catEl = document.createElement('div');
    catEl.className = 'cat-card';
    catEl.innerHTML = `
      <div class="cat-card-header">
        <input type="text" value="${atributo(cat.categoria)}" data-cat="${ci}" class="input-categoria">
        <button class="btn-icon btn-borrar-cat" data-cat="${ci}" title="Eliminar categoría">🗑️</button>
      </div>
      <div class="platos-lista" data-cat="${ci}"></div>
      <button class="btn-add-plato" data-cat="${ci}">+ Añadir plato</button>
    `;
    cont.appendChild(catEl);
    renderPlatos(ci);
  });

  cont.querySelectorAll('.input-categoria').forEach((input) => {
    input.addEventListener('input', (e) => {
      menuActual.carta[e.target.dataset.cat].categoria = e.target.value;
    });
  });
  cont.querySelectorAll('.btn-borrar-cat').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (confirm('¿Eliminar esta categoría entera?')) {
        menuActual.carta.splice(Number(e.target.dataset.cat), 1);
        renderCategorias();
      }
    });
  });
  cont.querySelectorAll('.btn-add-plato').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const ci = Number(e.target.dataset.cat);
      menuActual.carta[ci].platos.push({ nombre: '', descripcion: '', precio: '' });
      renderPlatos(ci);
    });
  });
}

function renderPlatos(ci) {
  const cont = document.querySelector(`.platos-lista[data-cat="${ci}"]`);
  const cat = menuActual.carta[ci];
  cont.innerHTML = cat.platos.map((p, pi) => `
    <div class="plato-card">
      <div class="plato-card-row">
        <input type="text" placeholder="Nombre del plato" value="${atributo(p.nombre)}" data-ci="${ci}" data-pi="${pi}" data-campo="nombre">
        <input type="text" placeholder="Precio" value="${atributo(p.precio)}" data-ci="${ci}" data-pi="${pi}" data-campo="precio" class="campo-precio">
      </div>
      <div class="plato-card-row">
        <input type="text" placeholder="Descripción (opcional)" value="${atributo(p.descripcion)}" data-ci="${ci}" data-pi="${pi}" data-campo="descripcion">
        <button class="btn-icon btn-borrar-plato" data-ci="${ci}" data-pi="${pi}" title="Eliminar plato">🗑️</button>
      </div>
    </div>
  `).join('');

  cont.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', (e) => {
      const { ci, pi, campo } = e.target.dataset;
      menuActual.carta[ci].platos[pi][campo] = e.target.value;
    });
  });
  cont.querySelectorAll('.btn-borrar-plato').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const { ci, pi } = e.target.dataset;
      menuActual.carta[ci].platos.splice(Number(pi), 1);
      renderPlatos(Number(ci));
    });
  });
}

document.getElementById('btn-add-categoria').addEventListener('click', () => {
  menuActual.carta.push({ categoria: 'Nueva categoría', platos: [] });
  renderCategorias();
});

document.getElementById('btn-guardar-carta').addEventListener('click', () => guardarMenu('guardar-mensaje-carta'));
document.getElementById('btn-guardar-menus').addEventListener('click', () => guardarMenu('guardar-mensaje-menus'));

// ---------- Menús cerrados (Menú Chulilla, Menú Brasa...) ----------
function renderMenus() {
  const cont = document.getElementById('lista-menus');
  cont.innerHTML = menuActual.menus.map((menu, mi) => `
    <div class="menu-edit-card" data-menu="${mi}">
      <div class="menu-edit-header">
        <input type="text" value="${atributo(menu.nombre)}" data-mi="${mi}" data-campo="nombre" class="input-menu-campo">
        <button class="btn-icon btn-borrar-menu" data-mi="${mi}" title="Eliminar menú">🗑️</button>
      </div>
      <label>Precio</label>
      <input type="text" value="${atributo(menu.precio)}" data-mi="${mi}" data-campo="precio" class="input-menu-campo">
      <label>Condiciones (letra pequeña)</label>
      <input type="text" value="${atributo(menu.condiciones)}" data-mi="${mi}" data-campo="condiciones" class="input-menu-campo">
      <div class="secciones-lista" data-mi="${mi}"></div>
      <button class="btn-add-linea btn-add-seccion" data-mi="${mi}">+ Añadir apartado (ej. "Postres")</button>
    </div>
  `).join('');

  menuActual.menus.forEach((menu, mi) => renderSecciones(mi));

  cont.querySelectorAll('.input-menu-campo').forEach((input) => {
    input.addEventListener('input', (e) => {
      const { mi, campo } = e.target.dataset;
      menuActual.menus[mi][campo] = e.target.value;
    });
  });
  cont.querySelectorAll('.btn-borrar-menu').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (confirm('¿Eliminar este menú entero?')) {
        menuActual.menus.splice(Number(e.target.dataset.mi), 1);
        renderMenus();
      }
    });
  });
  cont.querySelectorAll('.btn-add-seccion').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const mi = Number(e.target.dataset.mi);
      menuActual.menus[mi].secciones.push({ titulo: '', platos: [''] });
      renderSecciones(mi);
    });
  });
}

function renderSecciones(mi) {
  const cont = document.querySelector(`.secciones-lista[data-mi="${mi}"]`);
  const menu = menuActual.menus[mi];
  cont.innerHTML = menu.secciones.map((sec, si) => `
    <div class="seccion-edit">
      <div class="seccion-edit-header">
        <input type="text" placeholder="Título del apartado" value="${atributo(sec.titulo)}" data-mi="${mi}" data-si="${si}" class="input-seccion-titulo">
        <button class="btn-icon btn-borrar-seccion" data-mi="${mi}" data-si="${si}" title="Eliminar apartado">🗑️</button>
      </div>
      <div class="platos-linea-lista" data-mi="${mi}" data-si="${si}"></div>
      <button class="btn-add-linea btn-add-plato-linea" data-mi="${mi}" data-si="${si}">+ Añadir línea</button>
    </div>
  `).join('');

  menu.secciones.forEach((sec, si) => renderPlatosLinea(mi, si));

  cont.querySelectorAll('.input-seccion-titulo').forEach((input) => {
    input.addEventListener('input', (e) => {
      const { mi, si } = e.target.dataset;
      menuActual.menus[mi].secciones[si].titulo = e.target.value;
    });
  });
  cont.querySelectorAll('.btn-borrar-seccion').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const { mi, si } = e.target.dataset;
      menuActual.menus[mi].secciones.splice(Number(si), 1);
      renderSecciones(Number(mi));
    });
  });
  cont.querySelectorAll('.btn-add-plato-linea').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const { mi, si } = e.target.dataset;
      menuActual.menus[mi].secciones[si].platos.push('');
      renderPlatosLinea(Number(mi), Number(si));
    });
  });
}

function renderPlatosLinea(mi, si) {
  const cont = document.querySelector(`.platos-linea-lista[data-mi="${mi}"][data-si="${si}"]`);
  const platos = menuActual.menus[mi].secciones[si].platos;
  cont.innerHTML = platos.map((texto, pi) => `
    <div class="plato-linea">
      <input type="text" value="${atributo(texto)}" data-mi="${mi}" data-si="${si}" data-pi="${pi}" placeholder="Nombre del plato">
      <button class="btn-icon btn-borrar-linea" data-mi="${mi}" data-si="${si}" data-pi="${pi}">🗑️</button>
    </div>
  `).join('');

  cont.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', (e) => {
      const { mi, si, pi } = e.target.dataset;
      menuActual.menus[mi].secciones[si].platos[pi] = e.target.value;
    });
  });
  cont.querySelectorAll('.btn-borrar-linea').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const { mi, si, pi } = e.target.dataset;
      menuActual.menus[mi].secciones[si].platos.splice(Number(pi), 1);
      renderPlatosLinea(Number(mi), Number(si));
    });
  });
}

document.getElementById('btn-add-menu').addEventListener('click', () => {
  menuActual.menus.push({
    nombre: 'Nuevo menú',
    precio: '',
    condiciones: '',
    secciones: [{ titulo: 'Platos', platos: [''] }],
  });
  renderMenus();
});

// ---------- Mesas y turnos ----------
async function cargarConfigAdmin() {
  const res = await fetch('/api/config', { headers: { 'x-admin-token': token } });
  configActual = await res.json();
  renderConfig();
}

function renderConfig() {
  document.getElementById('input-turno-minutos').value = configActual.turnoMinutos;
  renderMesas();
  renderFranjas();
}

document.getElementById('input-turno-minutos').addEventListener('input', (e) => {
  configActual.turnoMinutos = Number(e.target.value) || 0;
});

function renderMesas() {
  const cont = document.getElementById('lista-mesas');
  cont.innerHTML = configActual.mesas.map((mesa, mi) => `
    <div class="mesa-card">
      <div class="mesa-card-row">
        <input type="text" placeholder="Nombre" value="${atributo(mesa.nombre)}" data-mi="${mi}" data-campo="nombre" class="mesa-nombre">
        <input type="text" placeholder="Zona (Interior/Terraza)" value="${atributo(mesa.zona || '')}" data-mi="${mi}" data-campo="zona" class="mesa-zona">
        <input type="number" min="1" placeholder="Plazas" value="${atributo(mesa.capacidad)}" data-mi="${mi}" data-campo="capacidad" class="mesa-capacidad">
        <button class="btn-icon btn-borrar-mesa" data-mi="${mi}" title="Eliminar mesa">🗑️</button>
      </div>
    </div>
  `).join('');

  cont.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', (e) => {
      const { mi, campo } = e.target.dataset;
      const valor = campo === 'capacidad' ? Number(e.target.value) || 0 : e.target.value;
      configActual.mesas[mi][campo] = valor;
    });
  });
  cont.querySelectorAll('.btn-borrar-mesa').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (confirm('¿Eliminar esta mesa?')) {
        configActual.mesas.splice(Number(e.target.dataset.mi), 1);
        renderMesas();
      }
    });
  });
}

document.getElementById('btn-add-mesa').addEventListener('click', () => {
  configActual.mesas.push({ id: 'm' + Date.now(), nombre: 'Nueva mesa', zona: '', capacidad: 4 });
  renderMesas();
});

const DIAS_SEMANA = [
  { valor: 1, letra: 'L' },
  { valor: 2, letra: 'M' },
  { valor: 3, letra: 'X' },
  { valor: 4, letra: 'J' },
  { valor: 5, letra: 'V' },
  { valor: 6, letra: 'S' },
  { valor: 7, letra: 'D' },
];

function renderFranjas() {
  const cont = document.getElementById('lista-franjas');
  cont.innerHTML = configActual.franjas.map((franja, fi) => {
    const dias = Array.isArray(franja.dias) ? franja.dias : [1, 2, 3, 4, 5, 6, 7];
    return `
    <div class="franja-card">
      <div class="franja-card-row">
        <input type="text" placeholder="Nombre (ej. Comida)" value="${atributo(franja.nombre)}" data-fi="${fi}" data-campo="nombre" class="franja-nombre">
        <button class="btn-icon btn-borrar-franja" data-fi="${fi}" title="Eliminar turno">🗑️</button>
      </div>
      <div class="franja-card-row">
        <input type="time" value="${atributo(franja.inicio)}" data-fi="${fi}" data-campo="inicio" class="franja-hora">
        <input type="time" value="${atributo(franja.fin)}" data-fi="${fi}" data-campo="fin" class="franja-hora">
        <input type="number" min="1" placeholder="Aforo máx." value="${atributo(franja.capacidadMaxima)}" data-fi="${fi}" data-campo="capacidadMaxima" class="franja-capacidad">
      </div>
      <div class="franja-dias-row">
        ${DIAS_SEMANA.map((d) => `
          <button type="button" class="dia-toggle ${dias.includes(d.valor) ? 'dia-activo' : ''}" data-fi="${fi}" data-dia="${d.valor}">${d.letra}</button>
        `).join('')}
      </div>
    </div>
  `;
  }).join('');

  cont.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', (e) => {
      const { fi, campo } = e.target.dataset;
      const valor = campo === 'capacidadMaxima' ? Number(e.target.value) || 0 : e.target.value;
      configActual.franjas[fi][campo] = valor;
    });
  });
  cont.querySelectorAll('.btn-borrar-franja').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (confirm('¿Eliminar este turno?')) {
        configActual.franjas.splice(Number(e.target.dataset.fi), 1);
        renderFranjas();
      }
    });
  });
  cont.querySelectorAll('.dia-toggle').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const fi = Number(e.target.dataset.fi);
      const dia = Number(e.target.dataset.dia);
      const franja = configActual.franjas[fi];
      const dias = Array.isArray(franja.dias) ? franja.dias : [1, 2, 3, 4, 5, 6, 7];
      franja.dias = dias.includes(dia) ? dias.filter((d) => d !== dia) : [...dias, dia].sort();
      renderFranjas();
    });
  });
}

document.getElementById('btn-add-franja').addEventListener('click', () => {
  configActual.franjas.push({
    id: 'f' + Date.now(),
    nombre: 'Nuevo turno',
    inicio: '13:00',
    fin: '14:00',
    capacidadMaxima: 8,
    dias: [1, 2, 3, 4, 5, 6, 7],
  });
  renderFranjas();
});

document.getElementById('btn-guardar-config').addEventListener('click', async () => {
  const msg = document.getElementById('guardar-mensaje-config');
  msg.textContent = 'Guardando...';
  try {
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify(configActual),
    });
    if (!res.ok) throw new Error('fallo');
    msg.textContent = '✅ Guardado. Los próximos turnos ya usan esta configuración.';
    setTimeout(() => (msg.textContent = ''), 4000);
  } catch (err) {
    msg.textContent = '❌ No se ha podido guardar. Comprueba tu conexión.';
  }
});

// ---------- Reservas ----------
async function cargarReservas() {
  const cont = document.getElementById('lista-reservas');
  cont.innerHTML = '<p class="cargando">Cargando reservas...</p>';
  const res = await fetch('/api/reservas', { headers: { 'x-admin-token': token } });
  const reservas = await res.json();
  reservas.sort((a, b) => new Date(b.creada) - new Date(a.creada));

  if (!reservas.length) {
    cont.innerHTML = '<p class="cargando">Todavía no hay reservas.</p>';
    return;
  }

  cont.innerHTML = reservas.map((r) => `
    <div class="reserva-card" data-id="${r.id}">
      <h4>${atributo(r.nombre)} · ${atributo(String(r.personas))}p</h4>
      <div class="reserva-detalle">
        📅 ${atributo(r.fecha)} — 🕒 ${atributo(r.franjaNombre || '')} ${atributo(r.hora)}<br>
        🪑 ${atributo(r.mesaNombre || 'sin asignar')}${r.mesaZona ? ' (' + atributo(r.mesaZona) + ')' : ''}<br>
        📞 <a href="tel:${atributo(r.telefono)}">${atributo(r.telefono)}</a>
        ${r.email ? ` · ✉️ ${atributo(r.email)}` : ''}
        ${r.comentarios ? `<br>💬 ${atributo(r.comentarios)}` : ''}
      </div>
      <div class="reserva-acciones">
        <span class="badge badge-${r.estado}">${r.estado}</span>
        <select data-id="${r.id}" class="select-estado">
          <option value="pendiente" ${r.estado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
          <option value="confirmada" ${r.estado === 'confirmada' ? 'selected' : ''}>Confirmada</option>
          <option value="cancelada" ${r.estado === 'cancelada' ? 'selected' : ''}>Cancelada</option>
        </select>
        <button class="btn-icon btn-borrar-reserva" data-id="${r.id}">🗑️</button>
      </div>
    </div>
  `).join('');

  cont.querySelectorAll('.select-estado').forEach((sel) => {
    sel.addEventListener('change', async (e) => {
      await fetch(`/api/reservas/${e.target.dataset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ estado: e.target.value }),
      });
      cargarReservas();
    });
  });
  cont.querySelectorAll('.btn-borrar-reserva').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      if (!confirm('¿Eliminar esta reserva?')) return;
      await fetch(`/api/reservas/${e.target.dataset.id}`, {
        method: 'DELETE',
        headers: { 'x-admin-token': token },
      });
      cargarReservas();
    });
  });
}

function atributo(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Si ya había sesión guardada, intentar entrar directo
if (token) {
  mostrarPanel().catch(() => {
    sessionStorage.removeItem('adminToken');
    token = null;
  });
}
