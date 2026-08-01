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
    if (btn.dataset.tab === 'reservas') {
      cargarReservas();
      cargarAforo();
    }
    if (btn.dataset.tab === 'menus') renderMenus();
    if (btn.dataset.tab === 'vinos') renderVinosCategorias();
    if (btn.dataset.tab === 'mesas') cargarConfigAdmin();
    if (btn.dataset.tab === 'mapa') iniciarMapaMesas();
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
  if (!Array.isArray(menuActual.vinos)) menuActual.vinos = [];
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
      menuActual.carta[ci].platos.push({ nombre: '', descripcion: '', precio: '', visible: true });
      renderPlatos(ci);
    });
  });
}

// Arrastrar para reordenar (raton en ordenador, mantener pulsado y arrastrar en movil), usando
// Pointer Events para no tener que distinguir raton/tactil. "seleccionAgarre" es el tirador
// dentro de cada tarjeta; "seleccionItem" es la tarjeta arrastrable entera; alSoltar(origen,
// destino) se llama con los indices dentro del contenedor cuando el orden cambia de verdad.
function activarArrastre(contenedor, seleccionItem, seleccionAgarre, alSoltar) {
  let arrastrando = null;
  let indiceOrigen = -1;

  function itemsOrdenados() {
    return Array.from(contenedor.querySelectorAll(seleccionItem));
  }

  function alMover(e) {
    if (!arrastrando) return;
    const y = e.clientY;
    const destino = itemsOrdenados().find((el) => {
      if (el === arrastrando) return false;
      const r = el.getBoundingClientRect();
      return y >= r.top && y <= r.bottom;
    });
    if (destino) {
      const r = destino.getBoundingClientRect();
      const antes = y < r.top + r.height / 2;
      contenedor.insertBefore(arrastrando, antes ? destino : destino.nextSibling);
    }
  }

  function alLevantar() {
    if (!arrastrando) return;
    arrastrando.classList.remove('arrastrando');
    const indiceDestino = itemsOrdenados().indexOf(arrastrando);
    const elemento = arrastrando;
    arrastrando = null;
    document.removeEventListener('pointermove', alMover);
    document.removeEventListener('pointerup', alLevantar);
    if (indiceDestino !== -1 && indiceDestino !== indiceOrigen) alSoltar(indiceOrigen, indiceDestino);
    elemento.classList.remove('arrastrando');
  }

  contenedor.querySelectorAll(seleccionAgarre).forEach((agarre) => {
    agarre.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      arrastrando = agarre.closest(seleccionItem);
      if (!arrastrando) return;
      indiceOrigen = itemsOrdenados().indexOf(arrastrando);
      arrastrando.classList.add('arrastrando');
      document.addEventListener('pointermove', alMover);
      document.addEventListener('pointerup', alLevantar);
    });
  });
}

function renderPlatos(ci) {
  const cont = document.querySelector(`.platos-lista[data-cat="${ci}"]`);
  const cat = menuActual.carta[ci];
  cont.innerHTML = cat.platos.map((p, pi) => `
    <div class="plato-card ${p.visible === false ? 'plato-oculto' : ''}">
      <div class="plato-card-row">
        <span class="asa-arrastre" title="Mantén pulsado y arrastra para reordenar">⠿</span>
        <input type="text" placeholder="Nombre del plato" value="${atributo(p.nombre)}" data-ci="${ci}" data-pi="${pi}" data-campo="nombre">
        <input type="text" placeholder="Precio" value="${atributo(p.precio)}" data-ci="${ci}" data-pi="${pi}" data-campo="precio" class="campo-precio">
      </div>
      <div class="plato-card-row">
        <input type="text" placeholder="Descripción (opcional)" value="${atributo(p.descripcion)}" data-ci="${ci}" data-pi="${pi}" data-campo="descripcion">
        <button class="btn-icon btn-visible-toggle" data-ci="${ci}" data-pi="${pi}" title="${p.visible === false ? 'Oculto: pulsa para mostrar' : 'Visible: pulsa para ocultar'}">${p.visible === false ? '🙈' : '👁️'}</button>
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
  activarArrastre(cont, '.plato-card', '.asa-arrastre', (origen, destino) => {
    const [plato] = menuActual.carta[ci].platos.splice(origen, 1);
    menuActual.carta[ci].platos.splice(destino, 0, plato);
    renderPlatos(ci);
  });
  cont.querySelectorAll('.btn-visible-toggle').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const { ci, pi } = e.target.dataset;
      const plato = menuActual.carta[ci].platos[pi];
      plato.visible = plato.visible === false;
      renderPlatos(Number(ci));
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
document.getElementById('btn-guardar-vinos').addEventListener('click', () => guardarMenu('guardar-mensaje-vinos'));

// ---------- Vinos ----------
function renderVinosCategorias() {
  const cont = document.getElementById('lista-vinos-categorias');
  cont.innerHTML = menuActual.vinos.map((cat, ci) => `
    <div class="cat-card" data-ci="${ci}">
      <div class="cat-card-header">
        <input type="text" value="${atributo(cat.categoria)}" data-ci="${ci}" class="input-vinos-categoria">
        <button class="btn-icon btn-borrar-vinos-cat" data-ci="${ci}" title="Eliminar apartado">🗑️</button>
      </div>
      <div class="vinos-grupos-lista" data-ci="${ci}"></div>
      <button class="btn-add-linea btn-add-grupo" data-ci="${ci}">+ Añadir denominación de origen</button>
    </div>
  `).join('');

  menuActual.vinos.forEach((cat, ci) => renderVinosGrupos(ci));

  cont.querySelectorAll('.input-vinos-categoria').forEach((input) => {
    input.addEventListener('input', (e) => {
      menuActual.vinos[e.target.dataset.ci].categoria = e.target.value;
    });
  });
  cont.querySelectorAll('.btn-borrar-vinos-cat').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (confirm('¿Eliminar este apartado de vinos entero?')) {
        menuActual.vinos.splice(Number(e.target.dataset.ci), 1);
        renderVinosCategorias();
      }
    });
  });
  cont.querySelectorAll('.btn-add-grupo').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const ci = Number(e.target.dataset.ci);
      menuActual.vinos[ci].grupos.push({ denominacion: '', vinos: [{ nombre: '', precio: '', visible: true }] });
      renderVinosGrupos(ci);
    });
  });
}

function renderVinosGrupos(ci) {
  const cont = document.querySelector(`.vinos-grupos-lista[data-ci="${ci}"]`);
  const cat = menuActual.vinos[ci];
  cont.innerHTML = cat.grupos.map((g, gi) => `
    <div class="seccion-edit">
      <div class="seccion-edit-header">
        <input type="text" placeholder="Denominación de origen (ej. D.O. Rioja)" value="${atributo(g.denominacion)}" data-ci="${ci}" data-gi="${gi}" class="input-vinos-denominacion">
        <button class="btn-icon btn-borrar-grupo" data-ci="${ci}" data-gi="${gi}" title="Eliminar denominación">🗑️</button>
      </div>
      <div class="vinos-lista" data-ci="${ci}" data-gi="${gi}"></div>
      <button class="btn-add-linea btn-add-vino" data-ci="${ci}" data-gi="${gi}">+ Añadir vino</button>
    </div>
  `).join('');

  cat.grupos.forEach((g, gi) => renderVinosLista(ci, gi));

  cont.querySelectorAll('.input-vinos-denominacion').forEach((input) => {
    input.addEventListener('input', (e) => {
      const { ci, gi } = e.target.dataset;
      menuActual.vinos[ci].grupos[gi].denominacion = e.target.value;
    });
  });
  cont.querySelectorAll('.btn-borrar-grupo').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const { ci, gi } = e.target.dataset;
      menuActual.vinos[ci].grupos.splice(Number(gi), 1);
      renderVinosGrupos(Number(ci));
    });
  });
  cont.querySelectorAll('.btn-add-vino').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const { ci, gi } = e.target.dataset;
      menuActual.vinos[ci].grupos[gi].vinos.push({ nombre: '', precio: '', visible: true });
      renderVinosLista(Number(ci), Number(gi));
    });
  });
}

function renderVinosLista(ci, gi) {
  const cont = document.querySelector(`.vinos-lista[data-ci="${ci}"][data-gi="${gi}"]`);
  const vinos = menuActual.vinos[ci].grupos[gi].vinos;
  cont.innerHTML = vinos.map((v, vi) => `
    <div class="plato-card ${v.visible === false ? 'plato-oculto' : ''}">
      <div class="plato-card-row">
        <input type="text" placeholder="Nombre del vino" value="${atributo(v.nombre)}" data-ci="${ci}" data-gi="${gi}" data-vi="${vi}" data-campo="nombre">
        <input type="text" placeholder="Precio" value="${atributo(v.precio)}" data-ci="${ci}" data-gi="${gi}" data-vi="${vi}" data-campo="precio" class="campo-precio">
      </div>
      <div class="plato-card-row">
        <button class="btn-icon btn-vino-visible-toggle" data-ci="${ci}" data-gi="${gi}" data-vi="${vi}" title="${v.visible === false ? 'Oculto: pulsa para mostrar' : 'Visible: pulsa para ocultar'}">${v.visible === false ? '🙈' : '👁️'}</button>
        <button class="btn-icon btn-borrar-vino" data-ci="${ci}" data-gi="${gi}" data-vi="${vi}" title="Eliminar vino">🗑️</button>
      </div>
    </div>
  `).join('');

  cont.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', (e) => {
      const { ci, gi, vi, campo } = e.target.dataset;
      menuActual.vinos[ci].grupos[gi].vinos[vi][campo] = e.target.value;
    });
  });
  cont.querySelectorAll('.btn-vino-visible-toggle').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const { ci, gi, vi } = e.target.dataset;
      const vino = menuActual.vinos[ci].grupos[gi].vinos[vi];
      vino.visible = vino.visible === false;
      renderVinosLista(Number(ci), Number(gi));
    });
  });
  cont.querySelectorAll('.btn-borrar-vino').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const { ci, gi, vi } = e.target.dataset;
      menuActual.vinos[ci].grupos[gi].vinos.splice(Number(vi), 1);
      renderVinosLista(Number(ci), Number(gi));
    });
  });
}

document.getElementById('btn-add-vinos-categoria').addEventListener('click', () => {
  menuActual.vinos.push({ categoria: 'Nuevo apartado', grupos: [] });
  renderVinosCategorias();
});

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
      menuActual.menus[mi].secciones.push({ titulo: '', platos: [{ nombre: '', visible: true }] });
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
      menuActual.menus[mi].secciones[si].platos.push({ nombre: '', visible: true });
      renderPlatosLinea(Number(mi), Number(si));
    });
  });
}

function renderPlatosLinea(mi, si) {
  const cont = document.querySelector(`.platos-linea-lista[data-mi="${mi}"][data-si="${si}"]`);
  const platos = menuActual.menus[mi].secciones[si].platos;
  cont.innerHTML = platos.map((p, pi) => `
    <div class="plato-linea ${p.visible === false ? 'plato-oculto' : ''}">
      <span class="asa-arrastre" title="Mantén pulsado y arrastra para reordenar">⠿</span>
      <input type="text" value="${atributo(p.nombre)}" data-mi="${mi}" data-si="${si}" data-pi="${pi}" placeholder="Nombre del plato">
      <button class="btn-icon btn-visible-toggle-linea" data-mi="${mi}" data-si="${si}" data-pi="${pi}" title="${p.visible === false ? 'Oculto: pulsa para mostrar' : 'Visible: pulsa para ocultar'}">${p.visible === false ? '🙈' : '👁️'}</button>
      <button class="btn-icon btn-borrar-linea" data-mi="${mi}" data-si="${si}" data-pi="${pi}">🗑️</button>
    </div>
  `).join('');

  cont.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', (e) => {
      const { mi, si, pi } = e.target.dataset;
      menuActual.menus[mi].secciones[si].platos[pi].nombre = e.target.value;
    });
  });
  activarArrastre(cont, '.plato-linea', '.asa-arrastre', (origen, destino) => {
    const [plato] = menuActual.menus[mi].secciones[si].platos.splice(origen, 1);
    menuActual.menus[mi].secciones[si].platos.splice(destino, 0, plato);
    renderPlatosLinea(mi, si);
  });
  cont.querySelectorAll('.btn-visible-toggle-linea').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const { mi, si, pi } = e.target.dataset;
      const plato = menuActual.menus[mi].secciones[si].platos[pi];
      plato.visible = plato.visible === false;
      renderPlatosLinea(Number(mi), Number(si));
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
    secciones: [{ titulo: 'Platos', platos: [{ nombre: '', visible: true }] }],
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
        <button class="btn-icon btn-borrar-mesa" data-mi="${mi}" title="Eliminar mesa">🗑️</button>
      </div>
      <div class="mesa-card-row">
        <label class="mesa-campo-label">Plazas
          <input type="number" min="1" placeholder="Plazas" value="${atributo(mesa.capacidad)}" data-mi="${mi}" data-campo="capacidad" class="mesa-capacidad">
        </label>
        <label class="mesa-campo-label">Mínimo personas
          <input type="number" min="1" placeholder="Mínimo" value="${atributo(mesa.minimo ?? 1)}" data-mi="${mi}" data-campo="minimo" class="mesa-capacidad">
        </label>
      </div>
      <div class="mesa-card-row">
        <label class="mesa-campo-label mesa-campo-label-ancho">Grupo combinable (solo se juntan mesas del mismo grupo)
          <input type="text" placeholder="ej. int-estandar" value="${atributo(mesa.grupoCombinable || '')}" data-mi="${mi}" data-campo="grupoCombinable">
        </label>
      </div>
    </div>
  `).join('');

  cont.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', (e) => {
      const { mi, campo } = e.target.dataset;
      const valor = campo === 'capacidad' || campo === 'minimo' ? Number(e.target.value) || 0 : e.target.value;
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
  configActual.mesas.push({ id: 'm' + Date.now(), nombre: 'Nueva mesa', zona: '', capacidad: 4, minimo: 1, grupoCombinable: '' });
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

// ---------- Alta manual de reservas por teléfono ----------
const btnToggleNuevaReserva = document.getElementById('btn-toggle-nueva-reserva');
const formNuevaReserva = document.getElementById('form-nueva-reserva');
const adminRFecha = document.getElementById('admin-r-fecha');
const adminRTurno = document.getElementById('admin-r-turno');

btnToggleNuevaReserva.addEventListener('click', () => {
  formNuevaReserva.hidden = !formNuevaReserva.hidden;
  if (!formNuevaReserva.hidden && !adminRFecha.value) {
    adminRFecha.value = new Date().toISOString().slice(0, 10);
    cargarTurnosAdmin();
  }
});

adminRFecha.addEventListener('change', cargarTurnosAdmin);

async function cargarTurnosAdmin() {
  const fecha = adminRFecha.value;
  if (!fecha) {
    adminRTurno.innerHTML = '<option value="">Elige antes la fecha</option>';
    return;
  }
  adminRTurno.innerHTML = '<option value="">Cargando turnos...</option>';
  try {
    const res = await fetch(`/api/disponibilidad?fecha=${encodeURIComponent(fecha)}`);
    const data = await res.json();
    if (!data.franjas.length) {
      adminRTurno.innerHTML = '<option value="">Ese día no hay turnos configurados</option>';
      return;
    }
    adminRTurno.innerHTML =
      '<option value="">Elige un turno</option>' +
      data.franjas.map((f) => `<option value="${f.id}">${atributo(f.nombre)} · ${atributo(f.inicio)}–${atributo(f.fin)} (${f.ocupadas}/${f.capacidadMaxima} ocupadas)</option>`).join('');
  } catch (err) {
    adminRTurno.innerHTML = '<option value="">No se han podido cargar los turnos</option>';
  }
}

formNuevaReserva.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-guardar-nueva-reserva');
  const msg = document.getElementById('nueva-reserva-mensaje');
  btn.disabled = true;
  msg.textContent = '';
  msg.className = 'guardar-mensaje';

  const datos = {
    nombre: document.getElementById('admin-r-nombre').value,
    telefono: document.getElementById('admin-r-telefono').value,
    email: document.getElementById('admin-r-email').value,
    fecha: adminRFecha.value,
    franjaId: adminRTurno.value,
    personas: document.getElementById('admin-r-personas').value,
    zona: document.getElementById('admin-r-zona').value,
    comentarios: document.getElementById('admin-r-comentarios').value,
  };

  try {
    const res = await fetch('/api/admin/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify(datos),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error al guardar la reserva');

    msg.textContent = `✅ Reserva guardada (mesa: ${json.mesa}).`;
    msg.classList.add('ok');
    formNuevaReserva.reset();
    adminRTurno.innerHTML = '<option value="">Elige antes la fecha</option>';
    cargarReservas();
    cargarAforo();
  } catch (err) {
    msg.textContent = '❌ ' + (err.message || 'No se ha podido guardar.');
    msg.classList.add('error');
  } finally {
    btn.disabled = false;
  }
});

// ---------- Aforo por turno (solo admin) ----------
const inputAforoFecha = document.getElementById('input-aforo-fecha');
inputAforoFecha.value = new Date().toISOString().slice(0, 10);
inputAforoFecha.addEventListener('change', cargarAforo);

async function cargarAforo() {
  const cont = document.getElementById('aforo-resultado');
  const fecha = inputAforoFecha.value;
  if (!fecha) { cont.innerHTML = ''; return; }

  cont.innerHTML = '<p class="cargando">Cargando aforo...</p>';
  try {
    const res = await fetch(`/api/admin/turnos-dia?fecha=${encodeURIComponent(fecha)}`, {
      headers: { 'x-admin-token': token },
    });
    const data = await res.json();

    if (!data.turnos.length) {
      cont.innerHTML = '<p class="cargando">Todavía no habéis configurado ningún turno.</p>';
      return;
    }

    cont.innerHTML = data.turnos.map((f) => {
      let clase = '';
      let estado;
      let titulo;
      if (f.cerrada) {
        clase = 'aforo-cerrado';
        estado = 'Cerrado por el restaurante';
        titulo = 'Haz clic para reabrir este turno ese día';
      } else if (f.abiertaExtra) {
        clase = 'aforo-extra';
        estado = `Abierto excepcionalmente · ${f.ocupadas}/${f.capacidadMaxima} ocupadas`;
        titulo = 'Haz clic para quitar esta apertura excepcional';
      } else if (!f.aplicaNormalmente) {
        clase = 'aforo-inactivo';
        estado = 'Cerrado ese día de la semana';
        titulo = 'Haz clic para abrirlo excepcionalmente ese día';
      } else {
        clase = f.disponibles <= 0 ? 'aforo-lleno' : '';
        estado = `${f.ocupadas}/${f.capacidadMaxima} ocupadas`;
        titulo = 'Haz clic para cerrar este turno ese día';
      }
      return `
      <button type="button" class="aforo-item ${clase}" data-franja-id="${atributo(f.id)}" data-aplica="${f.aplicaNormalmente}" title="${titulo}">
        <strong>${atributo(f.nombre)} ${atributo(f.inicio)}</strong><br>
        ${estado}
      </button>
    `;
    }).join('');

    cont.querySelectorAll('.aforo-item').forEach((btn) => {
      btn.addEventListener('click', () => toggleTurno(btn.dataset.franjaId, btn.dataset.aplica === 'true'));
    });
  } catch (err) {
    cont.innerHTML = '<p class="cargando">No se ha podido cargar el aforo.</p>';
  }
}

async function toggleTurno(franjaId, aplicaNormalmente) {
  const fecha = inputAforoFecha.value;
  const endpoint = aplicaNormalmente ? '/api/admin/cierres/toggle' : '/api/admin/aperturas/toggle';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ fecha, franjaId }),
    });
    if (!res.ok) throw new Error();
    await cargarAforo();
  } catch (err) {
    alert('No se ha podido cambiar el estado de ese turno.');
  }
}

// ---------- Reservas ----------
async function cargarReservas() {
  const cont = document.getElementById('lista-reservas');
  cont.innerHTML = '<p class="cargando">Cargando reservas...</p>';
  const res = await fetch('/api/reservas', { headers: { 'x-admin-token': token } });
  const todas = await res.json();

  // Las reservas de dias ya pasados se quedan guardadas (por si hace falta consultarlas),
  // pero no se muestran aqui para no llenar el panel de reservas que ya no estan por venir.
  const hoy = new Date().toLocaleDateString('sv-SE');
  const reservas = todas.filter((r) => r.fecha >= hoy);
  reservas.sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));

  if (!reservas.length) {
    cont.innerHTML = '<p class="cargando">No hay reservas por venir.</p>';
    return;
  }

  const porDia = [];
  reservas.forEach((r) => {
    let grupo = porDia.find((g) => g.fecha === r.fecha);
    if (!grupo) { grupo = { fecha: r.fecha, items: [] }; porDia.push(grupo); }
    grupo.items.push(r);
  });

  cont.innerHTML = porDia.map((grupo) => `
    <h3 class="reservas-dia-titulo">${formatearFechaLarga(grupo.fecha)}</h3>
    ${grupo.items.map((r) => `
    <div class="reserva-card" data-id="${r.id}">
      <h4>${atributo(r.nombre)} · ${atributo(String(r.personas))}p ${r.creadaPorAdmin ? '📞' : ''}</h4>
      <div class="reserva-detalle">
        🕒 ${atributo(r.franjaNombre || '')} ${atributo(r.hora)}<br>
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
    `).join('')}
  `).join('');

  cont.querySelectorAll('.select-estado').forEach((sel) => {
    sel.addEventListener('change', async (e) => {
      await fetch(`/api/reservas/${e.target.dataset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ estado: e.target.value }),
      });
      cargarReservas();
      cargarAforo();
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
      cargarAforo();
    });
  });
}

// ---------- Mapa de mesas (solo admin) ----------
const mapaFecha = document.getElementById('mapa-fecha');
const mapaTurno = document.getElementById('mapa-turno');
const mapaResultado = document.getElementById('mapa-mesas-resultado');

function iniciarMapaMesas() {
  if (!mapaFecha.value) mapaFecha.value = new Date().toLocaleDateString('sv-SE');
  cargarTurnosMapa();
}

mapaFecha.addEventListener('change', cargarTurnosMapa);
mapaTurno.addEventListener('change', cargarMapaMesas);

async function cargarTurnosMapa() {
  const fecha = mapaFecha.value;
  mapaResultado.innerHTML = '';
  if (!fecha) {
    mapaTurno.innerHTML = '<option value="">Elige antes la fecha</option>';
    return;
  }
  mapaTurno.innerHTML = '<option value="">Cargando turnos...</option>';
  try {
    const res = await fetch(`/api/admin/turnos-dia?fecha=${encodeURIComponent(fecha)}`, {
      headers: { 'x-admin-token': token },
    });
    const data = await res.json();
    const abiertos = data.turnos.filter((f) => f.abierta);
    if (!abiertos.length) {
      mapaTurno.innerHTML = '<option value="">Ese día no hay turnos abiertos</option>';
      return;
    }
    mapaTurno.innerHTML =
      '<option value="">Elige un turno</option>' +
      abiertos.map((f) => `<option value="${f.id}">${atributo(f.nombre)} · ${atributo(f.inicio)}–${atributo(f.fin)}</option>`).join('');
  } catch (err) {
    mapaTurno.innerHTML = '<option value="">No se han podido cargar los turnos</option>';
  }
}

async function cargarMapaMesas() {
  const fecha = mapaFecha.value;
  const franjaId = mapaTurno.value;
  if (!fecha || !franjaId) { mapaResultado.innerHTML = ''; return; }

  mapaResultado.innerHTML = '<p class="cargando">Cargando mapa...</p>';
  try {
    const res = await fetch(`/api/admin/mapa-mesas?fecha=${encodeURIComponent(fecha)}&franjaId=${encodeURIComponent(franjaId)}`, {
      headers: { 'x-admin-token': token },
    });
    const data = await res.json();

    const zonas = [];
    data.mesas.forEach((m) => {
      let zona = zonas.find((z) => z.nombre === (m.zona || 'Sin zona'));
      if (!zona) { zona = { nombre: m.zona || 'Sin zona', mesas: [] }; zonas.push(zona); }
      zona.mesas.push(m);
    });

    mapaResultado.innerHTML = zonas.map((zona) => `
      <h3 class="config-subtitulo">${atributo(zona.nombre)}</h3>
      <div class="mapa-grid">
        ${zona.mesas.map((m) => `
          <div class="mapa-mesa ${m.reserva ? 'mapa-mesa-ocupada' : 'mapa-mesa-libre'}">
            <div class="mapa-mesa-nombre">${atributo(m.nombre)}</div>
            <div class="mapa-mesa-capacidad">${m.capacidad} plazas</div>
            ${m.reserva ? `
              <div class="mapa-mesa-reserva">
                <strong>${atributo(m.reserva.nombre)}</strong> · ${m.reserva.personas}p${m.reserva.creadaPorAdmin ? ' 📞' : ''}<br>
                <a href="tel:${atributo(m.reserva.telefono)}">${atributo(m.reserva.telefono)}</a>
              </div>
            ` : '<div class="mapa-mesa-libre-texto">Libre</div>'}
          </div>
        `).join('')}
      </div>
    `).join('');
  } catch (err) {
    mapaResultado.innerHTML = '<p class="cargando">No se ha podido cargar el mapa.</p>';
  }
}

function formatearFechaLarga(fechaISO) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const fecha = new Date(y, m - 1, d);
  const texto = fecha.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
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
