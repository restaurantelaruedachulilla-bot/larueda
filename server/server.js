// Todas las fechas/horas del restaurante son hora de Madrid, independientemente
// de en que zona horaria este el servidor donde se despliegue (ej. Render usa UTC).
process.env.TZ = 'Europe/Madrid';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Carpeta donde viven los datos "de fabrica" (los que llegan con el codigo en git).
const SEED_DIR = path.join(__dirname, 'data');
// Carpeta donde se leen/escriben los datos realmente. En local es la misma que SEED_DIR.
// En produccion, DATA_DIR debe apuntar a un disco persistente (ver README) para que la
// carta, las mesas y las reservas sobrevivan a cada despliegue.
const DATA_DIR = process.env.DATA_DIR || SEED_DIR;

function asegurarArchivoDatos(nombre, contenidoPorDefecto) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const destino = path.join(DATA_DIR, nombre);
  if (fs.existsSync(destino)) return;

  const semilla = path.join(SEED_DIR, nombre);
  if (semilla !== destino && fs.existsSync(semilla)) {
    fs.copyFileSync(semilla, destino);
  } else {
    fs.writeFileSync(destino, contenidoPorDefecto, 'utf8');
  }
}

asegurarArchivoDatos('menu.json', JSON.stringify({ actualizado: '', aviso: '', carta: [], menus: [] }, null, 2));
asegurarArchivoDatos('config.json', JSON.stringify({ turnoMinutos: 120, mesas: [], franjas: [] }, null, 2));
asegurarArchivoDatos('reservas.json', '[]');
asegurarArchivoDatos('cierres.json', '[]');
asegurarArchivoDatos('aperturas.json', '[]');
asegurarArchivoDatos('bloqueosZona.json', '[]');
asegurarArchivoDatos('traducciones.json', '{}');

const MENU_PATH = path.join(DATA_DIR, 'menu.json');
const RESERVAS_PATH = path.join(DATA_DIR, 'reservas.json');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const CIERRES_PATH = path.join(DATA_DIR, 'cierres.json');
const APERTURAS_PATH = path.join(DATA_DIR, 'aperturas.json');
const BLOQUEOS_ZONA_PATH = path.join(DATA_DIR, 'bloqueosZona.json');
const TRADUCCIONES_PATH = path.join(DATA_DIR, 'traducciones.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'cambia-esta-contrasena';
const LIMITE_GRUPO_TELEFONO = 8;

app.use(cors());
app.use(express.json());
// Sin cache para HTML/JS/CSS: asi el movil (sobre todo si esta "instalado" como app) siempre
// pide la version mas reciente en vez de quedarse con una copia antigua guardada.
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res, filePath) => {
    if (/\.(html|js|css)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  },
}));

// ---------- Autenticacion simple del panel admin ----------
const sesionesAdmin = new Set();

function requiereAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token && sesionesAdmin.has(token)) return next();
  return res.status(401).json({ error: 'No autorizado' });
}

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) {
    const token = crypto.randomBytes(24).toString('hex');
    sesionesAdmin.add(token);
    return res.json({ token });
  }
  return res.status(401).json({ error: 'Contraseña incorrecta' });
});

// ---------- Carta ----------
app.get('/api/menu', (req, res) => {
  const menu = JSON.parse(fs.readFileSync(MENU_PATH, 'utf8'));
  res.json(menu);
});

app.put('/api/menu', requiereAdmin, (req, res) => {
  const nuevoMenu = req.body;
  if (!nuevoMenu || !Array.isArray(nuevoMenu.carta) || !Array.isArray(nuevoMenu.menus)) {
    return res.status(400).json({ error: 'Formato de carta inválido' });
  }
  if (!Array.isArray(nuevoMenu.vinos)) nuevoMenu.vinos = [];
  nuevoMenu.actualizado = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(MENU_PATH, JSON.stringify(nuevoMenu, null, 2), 'utf8');
  res.json({ ok: true });
});

// ---------- Configuracion (mesas, franjas, turno) ----------
function leerConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}
function guardarConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

app.get('/api/franjas', (req, res) => {
  const config = leerConfig();
  res.json({
    turnoMinutos: config.turnoMinutos,
    franjas: config.franjas,
  });
});

app.get('/api/config', requiereAdmin, (req, res) => {
  res.json(leerConfig());
});

app.get('/api/disponibilidad', (req, res) => {
  const { fecha } = req.query;
  if (!fecha) return res.status(400).json({ error: 'Falta la fecha' });
  const config = leerConfig();
  const reservas = leerReservas();
  const cierres = leerCierres();
  const aperturas = leerAperturas();
  const disponibilidad = calcularDisponibilidad(config, fecha, reservas, cierres, aperturas);
  res.json({ turnoMinutos: config.turnoMinutos, franjas: disponibilidad });
});

// ---------- Cierres manuales de turnos (solo admin) ----------
// Permite cerrar un turno concreto de un dia concreto (ej. "1 de agosto, 13:00")
// para que la gente no pueda reservarlo online, sin tener que tocar el horario general.
app.get('/api/admin/cierres', requiereAdmin, (req, res) => {
  res.json(leerCierres());
});

app.post('/api/admin/cierres/toggle', requiereAdmin, (req, res) => {
  const { fecha, franjaId } = req.body || {};
  if (!fecha || !franjaId) return res.status(400).json({ error: 'Faltan fecha o franjaId' });

  const cierres = leerCierres();
  const idx = cierres.findIndex((c) => c.fecha === fecha && c.franjaId === franjaId);
  let cerrada;
  if (idx >= 0) {
    cierres.splice(idx, 1);
    cerrada = false;
  } else {
    cierres.push({ fecha, franjaId });
    cerrada = true;
  }
  guardarCierres(cierres);
  res.json({ ok: true, cerrada });
});

// ---------- Aperturas extraordinarias (solo admin) ----------
// Al reves que los cierres: permite abrir un turno concreto de un dia concreto aunque ese dia
// de la semana normalmente esteis cerrados (ej. "abrimos el miercoles 12 de agosto a comer").
app.get('/api/admin/aperturas', requiereAdmin, (req, res) => {
  res.json(leerAperturas());
});

app.post('/api/admin/aperturas/toggle', requiereAdmin, (req, res) => {
  const { fecha, franjaId } = req.body || {};
  if (!fecha || !franjaId) return res.status(400).json({ error: 'Faltan fecha o franjaId' });

  const aperturas = leerAperturas();
  const idx = aperturas.findIndex((a) => a.fecha === fecha && a.franjaId === franjaId);
  let abierta;
  if (idx >= 0) {
    aperturas.splice(idx, 1);
    abierta = false;
  } else {
    aperturas.push({ fecha, franjaId });
    abierta = true;
  }
  guardarAperturas(aperturas);
  res.json({ ok: true, abierta });
});

// Vista completa de un dia para el admin: TODOS los turnos configurados (aunque ese dia de la
// semana no toque), con su estado real (aplica normalmente / cerrado ese dia / abierto extra ese
// dia), para poder abrir excepciones o cerrar turnos concretos desde el panel.
app.get('/api/admin/turnos-dia', requiereAdmin, (req, res) => {
  const { fecha } = req.query;
  if (!fecha) return res.status(400).json({ error: 'Falta la fecha' });

  const config = leerConfig();
  const reservas = leerReservas();
  const cierres = leerCierres();
  const aperturas = leerAperturas();

  const diaSemana = diaSemanaISO(fecha);
  const cierresDelDia = new Set(cierres.filter((c) => c.fecha === fecha).map((c) => c.franjaId));
  const aperturasDelDia = new Set(aperturas.filter((a) => a.fecha === fecha).map((a) => a.franjaId));
  const reservasDelDia = reservas.filter((r) => r.fecha === fecha && r.estado !== 'cancelada');

  const turnos = config.franjas.map((franja) => {
    const aplicaNormalmente = !Array.isArray(franja.dias) || franja.dias.includes(diaSemana);
    const cerrada = aplicaNormalmente && cierresDelDia.has(franja.id);
    const abiertaExtra = !aplicaNormalmente && aperturasDelDia.has(franja.id);
    const abierta = (aplicaNormalmente && !cerrada) || abiertaExtra;
    const ocupadas = reservasDelDia
      .filter((r) => r.franjaId === franja.id)
      .reduce((suma, r) => suma + Number(r.personas), 0);
    return {
      ...franja,
      aplicaNormalmente,
      cerrada,
      abiertaExtra,
      abierta,
      ocupadas,
      disponibles: abierta ? Math.max(0, franja.capacidadMaxima - ocupadas) : 0,
    };
  });

  res.json({ turnos });
});

// Mapa de mesas: para una fecha y un turno concretos, dice que reserva ocupa cada mesa (si hay
// alguna), a lo largo de TODO un turno (ej. "Comida"), no solo en un instante concreto: cada
// mesa devuelve la lista de huecos ocupados (de su hora de inicio a +turnoMinutos) para poder
// pintar una linea de tiempo y ver como se va quedando libre/ocupada segun avanza el turno.
app.get('/api/admin/mapa-mesas', requiereAdmin, (req, res) => {
  const { fecha, turno } = req.query;
  if (!fecha || !turno) return res.status(400).json({ error: 'Faltan fecha o turno' });

  const config = leerConfig();
  const aperturas = leerAperturas();
  const franjasTurno = franjasDelDia(config, fecha, aperturas).filter((f) => f.nombre === turno);
  if (!franjasTurno.length) return res.status(400).json({ error: 'Ese turno no existe o no está abierto ese día' });

  const rangoInicio = Math.min(...franjasTurno.map((f) => minutosDesdeMedianoche(f.inicio)));
  const rangoFin = Math.max(...franjasTurno.map((f) => minutosDesdeMedianoche(f.inicio))) + config.turnoMinutos;

  const reservasDelDia = leerReservas().filter((r) => r.fecha === fecha && r.estado !== 'cancelada' && r.franjaNombre === turno);
  const zonasBloqueadas = leerBloqueosZona()
    .filter((b) => b.fecha === fecha && b.turno === turno)
    .map((b) => b.zona);

  function ocupaMesa(r, mesaId) {
    if (r.mesaId === mesaId) return true;
    return Array.isArray(r.mesaIds) && r.mesaIds.includes(mesaId);
  }

  const mesas = config.mesas.map((mesa) => {
    const ocupaciones = reservasDelDia
      .filter((r) => ocupaMesa(r, mesa.id))
      .map((r) => {
        const inicio = minutosDesdeMedianoche(r.hora);
        return {
          inicio,
          fin: inicio + config.turnoMinutos,
          reserva: {
            id: r.id,
            nombre: r.nombre,
            personas: r.personas,
            telefono: r.telefono,
            hora: r.hora,
            creadaPorAdmin: !!r.creadaPorAdmin,
          },
        };
      })
      .sort((a, b) => a.inicio - b.inicio);
    return { ...mesa, ocupaciones };
  });

  res.json({ rangoInicio, rangoFin, turnoMinutos: config.turnoMinutos, zonasBloqueadas, mesas });
});

// Bloquea/desbloquea que se puedan hacer NUEVAS reservas online en una zona concreta, para un
// dia y turno concretos (ej. "no quiero mas reservas en Interior el 4 de agosto a comer"). No
// cancela las reservas que ya hubiera en esa zona, solo impide que entren mas por la web; el
// alta manual del admin puede seguir usando esas mesas si hace falta.
app.get('/api/admin/bloqueos-zona', requiereAdmin, (req, res) => {
  res.json(leerBloqueosZona());
});

app.post('/api/admin/bloqueos-zona/toggle', requiereAdmin, (req, res) => {
  const { fecha, turno, zona } = req.body || {};
  if (!fecha || !turno || !zona) return res.status(400).json({ error: 'Faltan fecha, turno o zona' });

  const bloqueos = leerBloqueosZona();
  const idx = bloqueos.findIndex((b) => b.fecha === fecha && b.turno === turno && b.zona === zona);
  let bloqueada;
  if (idx >= 0) {
    bloqueos.splice(idx, 1);
    bloqueada = false;
  } else {
    bloqueos.push({ fecha, turno, zona });
    bloqueada = true;
  }
  guardarBloqueosZona(bloqueos);
  res.json({ ok: true, bloqueada });
});

app.put('/api/config', requiereAdmin, (req, res) => {
  const nuevaConfig = req.body;
  if (
    !nuevaConfig ||
    typeof nuevaConfig.turnoMinutos !== 'number' ||
    !Array.isArray(nuevaConfig.mesas) ||
    !Array.isArray(nuevaConfig.franjas)
  ) {
    return res.status(400).json({ error: 'Formato de configuración inválido' });
  }
  guardarConfig(nuevaConfig);
  res.json({ ok: true });
});

// ---------- Traduccion automatica de la web (carta incluida) ----------
// Usamos MyMemory (gratis, sin API key) porque la carta cambia cada dia y no es viable
// traducir a mano a 5 idiomas. Cada texto traducido se guarda en traducciones.json para
// no volver a llamar al servicio si ya se tradujo antes (el 99% de las veces sera cache).
const IDIOMAS_TRADUCCION = new Set(['en', 'ca', 'de', 'it', 'fr']);

// MyMemory a veces confunde frases cortas y ambiguas con entradas sueltas de su memoria de
// traduccion (ej. "La carta" lo traduce como "the letter"). Para esos casos concretos usamos
// una traduccion fija en vez de fiarnos del servicio.
const TRADUCCIONES_MANUALES = {
  'La carta': { en: 'The menu', ca: 'La carta', de: 'Die Speisekarte', it: 'Il menù', fr: 'La carte' },
};

function leerTraducciones() {
  return JSON.parse(fs.readFileSync(TRADUCCIONES_PATH, 'utf8'));
}
function guardarTraducciones(cache) {
  fs.writeFileSync(TRADUCCIONES_PATH, JSON.stringify(cache), 'utf8');
}

// MyMemory rechaza textos muy largos (limite ~500 caracteres); los parrafos largos de la
// web (historia, perfiles...) se trocean por frases y se traducen por partes.
function trocearTexto(texto, maxLen = 400) {
  if (texto.length <= maxLen) return [texto];
  const frases = texto.split(/(?<=[.!?])\s+/);
  const trozos = [];
  let actual = '';
  frases.forEach((frase) => {
    if (actual && (actual + ' ' + frase).trim().length > maxLen) {
      trozos.push(actual.trim());
      actual = frase;
    } else {
      actual = (actual + ' ' + frase).trim();
    }
  });
  if (actual) trozos.push(actual.trim());
  return trozos;
}

// Devuelve el texto traducido, o null si MyMemory ha fallado (incluida la cuota gratuita
// agotada) para que el llamante NUNCA cachee ni sirva un fallo como si fuera una traduccion.
async function traducirConMyMemory(texto, destino) {
  const trozos = trocearTexto(texto);
  const partes = [];
  for (const trozo of trozos) {
    const emailParam = process.env.RESTAURANT_EMAIL ? `&de=${encodeURIComponent(process.env.RESTAURANT_EMAIL)}` : '';
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(trozo)}&langpair=es|${destino}${emailParam}`;
    const resp = await fetch(url);
    const data = await resp.json();
    // Si se agota la cuota gratuita diaria (o cualquier otro fallo), MyMemory NO devuelve un
    // error HTTP limpio: mete un aviso en texto dentro de "translatedText" (ej. "MYMEMORY
    // WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS..."). Comprobamos responseStatus
    // explicitamente para no dar ese aviso por bueno.
    if (!data || data.responseStatus !== 200 || !data.responseData || !data.responseData.translatedText) {
      return null;
    }
    let traducido = data.responseData.translatedText;
    // MyMemory a veces devuelve el texto envuelto en etiquetas tipo XLIFF (ej. <g id="1">...</g>)
    // cuando reutiliza una entrada de su memoria de traduccion; las quitamos, no son HTML real.
    traducido = traducido.replace(/<\/?[a-z][^>]*>/gi, '').trim();
    partes.push(traducido || trozo);
  }
  return partes.join(' ');
}

app.post('/api/traducir', async (req, res) => {
  const { textos, destino } = req.body || {};
  if (!Array.isArray(textos) || !IDIOMAS_TRADUCCION.has(destino)) {
    return res.status(400).json({ error: 'Parámetros inválidos' });
  }

  const cache = leerTraducciones();
  cache[destino] = cache[destino] || {};

  const resultado = new Array(textos.length);
  const pendientes = [];
  textos.forEach((texto, i) => {
    const limpio = String(texto || '').trim();
    if (!limpio) { resultado[i] = texto || ''; return; }
    if (TRADUCCIONES_MANUALES[limpio] && TRADUCCIONES_MANUALES[limpio][destino]) {
      resultado[i] = TRADUCCIONES_MANUALES[limpio][destino];
      return;
    }
    if (cache[destino][limpio]) { resultado[i] = cache[destino][limpio]; return; }
    pendientes.push(i);
  });

  let huboCambios = false;
  const CONCURRENCIA = 4;
  let cursor = 0;
  async function trabajador() {
    while (cursor < pendientes.length) {
      const idx = pendientes[cursor++];
      const original = String(textos[idx]).trim();
      try {
        const traducido = await traducirConMyMemory(original, destino);
        if (traducido === null) {
          // Fallo de MyMemory (cuota agotada u otro error): nos quedamos en español y NO
          // lo cacheamos, para que se reintente traducir en cuanto el servicio se recupere.
          resultado[idx] = textos[idx];
        } else {
          cache[destino][original] = traducido;
          resultado[idx] = traducido;
          huboCambios = true;
        }
      } catch (err) {
        resultado[idx] = textos[idx];
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, pendientes.length) }, trabajador));

  if (huboCambios) guardarTraducciones(cache);
  res.json({ textos: resultado });
});

// Mantenimiento: quita de la cache cualquier entrada que en realidad sea un aviso de fallo de
// MyMemory (cuota agotada, etc.) que se haya podido colar antes de validar responseStatus.
app.post('/api/admin/traducciones/limpiar', requiereAdmin, (req, res) => {
  const cache = leerTraducciones();
  let eliminadas = 0;
  Object.keys(cache).forEach((idioma) => {
    Object.keys(cache[idioma]).forEach((texto) => {
      if (/MYMEMORY|WARNING/i.test(cache[idioma][texto])) {
        delete cache[idioma][texto];
        eliminadas++;
      }
    });
  });
  if (eliminadas) guardarTraducciones(cache);
  res.json({ ok: true, eliminadas });
});

// ---------- Reservas ----------
function leerReservas() {
  return JSON.parse(fs.readFileSync(RESERVAS_PATH, 'utf8'));
}
function guardarReservas(lista) {
  fs.writeFileSync(RESERVAS_PATH, JSON.stringify(lista, null, 2), 'utf8');
}

function leerCierres() {
  return JSON.parse(fs.readFileSync(CIERRES_PATH, 'utf8'));
}
function guardarCierres(lista) {
  fs.writeFileSync(CIERRES_PATH, JSON.stringify(lista, null, 2), 'utf8');
}

function leerAperturas() {
  return JSON.parse(fs.readFileSync(APERTURAS_PATH, 'utf8'));
}
function guardarAperturas(lista) {
  fs.writeFileSync(APERTURAS_PATH, JSON.stringify(lista, null, 2), 'utf8');
}

function leerBloqueosZona() {
  return JSON.parse(fs.readFileSync(BLOQUEOS_ZONA_PATH, 'utf8'));
}
function guardarBloqueosZona(lista) {
  fs.writeFileSync(BLOQUEOS_ZONA_PATH, JSON.stringify(lista, null, 2), 'utf8');
}

function minutosDesdeMedianoche(horaHHMM) {
  const [h, m] = horaHHMM.split(':').map(Number);
  return h * 60 + m;
}

// Dia de la semana en formato ISO: 1=lunes ... 7=domingo
function diaSemanaISO(fechaHHMM) {
  const [y, m, d] = fechaHHMM.split('-').map(Number);
  const dia = new Date(y, m - 1, d).getDay(); // 0=domingo..6=sabado
  return dia === 0 ? 7 : dia;
}

// Franjas que aplican ese dia de la semana (si una franja no tiene "dias", aplica todos los dias),
// mas las que se hayan abierto excepcionalmente ese dia concreto aunque no toque por horario
// semanal (ver aperturas.json, ej. "abrimos este miercoles aunque cerramos los miercoles").
function franjasDelDia(config, fecha, aperturas) {
  const diaSemana = diaSemanaISO(fecha);
  const extraIds = new Set((aperturas || []).filter((a) => a.fecha === fecha).map((a) => a.franjaId));
  return config.franjas.filter((f) => (!Array.isArray(f.dias) || f.dias.includes(diaSemana)) || extraIds.has(f.id));
}

// Calcula, para una fecha dada, cuantas plazas ya estan ocupadas en cada franja
// (sumando reservas activas -no canceladas- de esa fecha y esa franja), y si el
// restaurante ha cerrado manualmente ese turno ese dia concreto (ver cierres.json).
function calcularDisponibilidad(config, fecha, reservas, cierres, aperturas) {
  const reservasDelDia = reservas.filter((r) => r.fecha === fecha && r.estado !== 'cancelada');
  const cierresDelDia = new Set(cierres.filter((c) => c.fecha === fecha).map((c) => c.franjaId));

  return franjasDelDia(config, fecha, aperturas).map((franja) => {
    const ocupadas = reservasDelDia
      .filter((r) => r.franjaId === franja.id)
      .reduce((suma, r) => suma + Number(r.personas), 0);
    const cerrada = cierresDelDia.has(franja.id);
    const disponibles = cerrada ? 0 : Math.max(0, franja.capacidadMaxima - ocupadas);
    return { ...franja, ocupadas, disponibles, cerrada };
  });
}

// Junta mesas de un mismo grupo combinable para cubrir el grupo de comensales: coge primero
// la mesa libre mas grande (asi los grupos de 7-8 caen en una de 6 + una de 4, no dos de 4),
// y va anadiendo la mas pequeña que cubra lo que falte. Devuelve null si no llega ni juntando
// todas las mesas de ese grupo.
function combinarMesasMismoGrupo(mesasLibres, personas) {
  const disponibles = [...mesasLibres];
  const elegidas = [];
  let restante = personas;

  while (restante > 0 && disponibles.length) {
    const sirven = disponibles.filter((m) => m.capacidad >= restante).sort((a, b) => a.capacidad - b.capacidad);
    const elegida = sirven.length ? sirven[0] : [...disponibles].sort((a, b) => b.capacidad - a.capacidad)[0];
    elegidas.push(elegida);
    restante -= elegida.capacidad;
    disponibles.splice(disponibles.indexOf(elegida), 1);
  }

  return restante <= 0 ? elegidas : null;
}

// De entre las mesas libres (ya de una sola zona), busca la mejor forma de sentar al grupo:
// 1) una sola mesa libre que quepa entera, respetando su minimo de comensales (para no sentar
//    a 2 personas en una mesa de 6), la mas pequeña posible que valga.
// 2) si ninguna sirve sola, se combinan mesas, pero SOLO dentro de un mismo "grupo combinable"
//    (las mesas de distinto tamaño/forma no se pueden juntar en la vida real). Si hay varios
//    grupos combinables que podrian cubrir el hueco, se prueba primero el de mesas mas grandes
//    (asi 9+10 gana a repartir en varias de 4, para grupos de 8-10).
function buscarMesas(mesasLibres, personas) {
  const ajustadas = mesasLibres
    .filter((m) => m.capacidad >= personas && personas >= (m.minimo || 1))
    .sort((a, b) => a.capacidad - b.capacidad);
  if (ajustadas.length) return [ajustadas[0]];

  const grupos = {};
  mesasLibres.forEach((m) => {
    const clave = m.grupoCombinable || m.zona || 'sin-grupo';
    (grupos[clave] = grupos[clave] || []).push(m);
  });

  const ordenGrupos = Object.values(grupos).sort((a, b) => {
    const minA = Math.min(...a.map((m) => m.capacidad));
    const minB = Math.min(...b.map((m) => m.capacidad));
    return minB - minA;
  });

  for (const grupo of ordenGrupos) {
    const combo = combinarMesasMismoGrupo(grupo, personas);
    if (combo) return combo;
  }

  return null;
}

// Busca mesa(s) para el grupo, respetando la zona preferida si se indica (Interior/Terraza).
// Si la zona elegida no tiene sitio ni combinando mesas, cae de vuelta a mirar en cualquier
// zona antes de rendirse. Solo devuelve null si no queda ninguna mesa libre sin solape.
// "zonasBloqueadas" son zonas que el restaurante ha cerrado a nuevas reservas online para ese
// dia y turno concretos (ver bloqueosZona.json); esas mesas quedan fuera de la busqueda entera,
// tanto en la zona preferida como en el resto de zonas de repuesto.
function asignarMesa(config, fecha, franja, personas, reservas, zonaPreferida, zonasBloqueadas) {
  const inicioNueva = minutosDesdeMedianoche(franja.inicio);
  const finNueva = inicioNueva + config.turnoMinutos;
  const bloqueadas = zonasBloqueadas || new Set();

  const reservasDelDia = reservas.filter((r) => r.fecha === fecha && r.estado !== 'cancelada' && (r.mesaId || (r.mesaIds && r.mesaIds.length)));

  function ocupaMesa(r, mesaId) {
    if (r.mesaId === mesaId) return true;
    return Array.isArray(r.mesaIds) && r.mesaIds.includes(mesaId);
  }

  function libre(mesa) {
    return !reservasDelDia.some((r) => {
      if (!ocupaMesa(r, mesa.id)) return false;
      const otraFranja = config.franjas.find((f) => f.id === r.franjaId);
      if (!otraFranja) return false;
      const otroInicio = minutosDesdeMedianoche(otraFranja.inicio);
      const otroFin = otroInicio + config.turnoMinutos;
      return inicioNueva < otroFin && otroInicio < finNueva;
    });
  }

  const mesasAbiertas = config.mesas.filter((m) => !bloqueadas.has(m.zona));
  const zonaFiltro = zonaPreferida && zonaPreferida !== 'Cualquiera' ? zonaPreferida : null;
  const candidatas = mesasAbiertas.filter((m) => !zonaFiltro || m.zona === zonaFiltro);
  const libresEnZona = candidatas.filter(libre);

  const combo = buscarMesas(libresEnZona, Number(personas));
  if (combo) return combo;

  if (zonaFiltro) {
    const libresTodas = mesasAbiertas.filter(libre);
    const comboTodas = buscarMesas(libresTodas, Number(personas));
    if (comboTodas) return comboTodas;
  }

  return null;
}

// A partir del array de mesas asignadas, arma los campos que se guardan en la reserva.
function resumenMesas(mesas) {
  const zonasUnicas = [...new Set(mesas.map((m) => m.zona).filter(Boolean))];
  return {
    mesaIds: mesas.map((m) => m.id),
    mesaNombre: mesas.map((m) => m.nombre).join(' + '),
    mesaZona: zonasUnicas.join(' + '),
  };
}

let transporter = null;
if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

async function enviarEmailCliente(reserva, { asunto, cuerpo }) {
  if (!transporter) {
    console.warn('enviarEmailCliente: no hay transporter configurado, no se envia nada.');
    return;
  }
  if (!reserva.email) {
    console.warn('enviarEmailCliente: la reserva no tiene email, no se envia nada.');
    return;
  }
  try {
    const info = await transporter.sendMail({
      from: `"Restaurante La Rueda" <${process.env.GMAIL_USER}>`,
      to: reserva.email,
      subject: asunto,
      text: cuerpo,
    });
    console.log('enviarEmailCliente: email enviado a', reserva.email, 'messageId:', info.messageId);
  } catch (err) {
    console.error('No se pudo enviar el email al cliente:', err.message);
  }
}

function textoConfirmacionCliente(reserva) {
  return (
    `¡Hola ${reserva.nombre}!\n\n` +
    `Hemos recibido tu solicitud de reserva en Restaurante La Rueda:\n\n` +
    `Fecha: ${reserva.fecha}\n` +
    `Turno: ${reserva.franjaNombre} (${reserva.hora})\n` +
    `Personas: ${reserva.personas}\n\n` +
    `Si necesitas cancelarla, hazlo en un clic aquí:\n${reserva.cancelUrl}\n\n` +
    `(o llámanos al 613 72 76 80 si lo prefieres)\n\n` +
    `¡Te esperamos!\n` +
    `Restaurante La Rueda · Chulilla`
  );
}

function textoRecordatorioCliente(reserva) {
  return (
    `¡Hola ${reserva.nombre}!\n\n` +
    `Te recordamos tu reserva de hoy en Restaurante La Rueda:\n\n` +
    `Turno: ${reserva.franjaNombre} (${reserva.hora})\n` +
    `Personas: ${reserva.personas}\n\n` +
    `Si al final no podéis venir, cancela en un clic aquí para que podamos ofrecer la mesa a otras personas:\n${reserva.cancelUrl}\n\n` +
    `¡Hasta ahora!\n` +
    `Restaurante La Rueda · Chulilla`
  );
}

// Cada cierto tiempo revisa las reservas activas y manda un recordatorio por email
// a las que esten a 3 horas o menos de su turno y no lo hayan recibido ya.
const MINUTOS_ANTES_RECORDATORIO = 180;
function comprobarRecordatorios() {
  const reservas = leerReservas();
  const ahora = new Date();
  let cambios = false;

  reservas.forEach((reserva) => {
    if (reserva.estado === 'cancelada' || reserva.recordatorioEnviado || !reserva.email) return;

    const [anio, mes, dia] = reserva.fecha.split('-').map(Number);
    const [hora, minuto] = reserva.hora.split(':').map(Number);
    const momentoReserva = new Date(anio, mes - 1, dia, hora, minuto);
    const minutosRestantes = (momentoReserva - ahora) / 60000;

    if (minutosRestantes > 0 && minutosRestantes <= MINUTOS_ANTES_RECORDATORIO) {
      enviarEmailCliente(reserva, {
        asunto: `Recordatorio: tu reserva de hoy en La Rueda (${reserva.hora})`,
        cuerpo: textoRecordatorioCliente(reserva),
      });
      reserva.recordatorioEnviado = true;
      cambios = true;
    }
  });

  if (cambios) guardarReservas(reservas);
}
setInterval(comprobarRecordatorios, 5 * 60 * 1000);

async function avisarWhatsapp(reserva) {
  const telefono = process.env.CALLMEBOT_PHONE;
  const apikey = process.env.CALLMEBOT_APIKEY;
  if (!telefono || !apikey) {
    console.warn('CALLMEBOT_PHONE/CALLMEBOT_APIKEY no configurados: no se ha enviado aviso de WhatsApp.');
    return;
  }

  const texto =
    `📅 Nueva reserva web\n` +
    `${reserva.nombre} · ${reserva.personas}p\n` +
    `${reserva.fecha} · ${reserva.franjaNombre} (${reserva.hora})\n` +
    `Mesa: ${reserva.mesaNombre}${reserva.mesaZona ? ' (' + reserva.mesaZona + ')' : ''}\n` +
    `Tel: ${reserva.telefono}` +
    (reserva.comentarios ? `\nNota: ${reserva.comentarios}` : '');

  const url =
    `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(telefono)}` +
    `&text=${encodeURIComponent(texto)}&apikey=${encodeURIComponent(apikey)}`;

  try {
    await fetch(url);
  } catch (err) {
    console.error('No se pudo enviar el aviso de WhatsApp:', err.message);
    // La reserva ya quedó guardada en reservas.json aunque falle el aviso de WhatsApp.
  }
}

app.post('/api/reservas', async (req, res) => {
  const { nombre, telefono, email, fecha, franjaId, personas, comentarios, zona } = req.body || {};

  if (!nombre || !telefono || !fecha || !franjaId || !personas) {
    return res.status(400).json({ error: 'Faltan datos obligatorios (nombre, teléfono, fecha, turno, personas)' });
  }

  const numPersonas = Number(personas);
  if (!Number.isInteger(numPersonas) || numPersonas < 1) {
    return res.status(400).json({ error: 'El número de personas no es válido' });
  }

  if (numPersonas >= LIMITE_GRUPO_TELEFONO) {
    return res.status(400).json({
      error: 'Para grupos de 8 personas o más trabajamos con menús a mesa completa: llamad al 613 72 76 80 para reservar.',
    });
  }

  const config = leerConfig();
  const aperturas = leerAperturas();
  const franja = franjasDelDia(config, fecha, aperturas).find((f) => f.id === franjaId);
  if (!franja) {
    return res.status(400).json({ error: 'Ese turno no está disponible ese día. Elige uno de la lista.' });
  }

  const reservas = leerReservas();
  const cierres = leerCierres();

  const disponibilidad = calcularDisponibilidad(config, fecha, reservas, cierres, aperturas).find((f) => f.id === franjaId);
  if (disponibilidad.cerrada) {
    return res.status(409).json({
      error: 'Ese turno está cerrado ese día. Elige otro turno o llámanos al 613 72 76 80.',
    });
  }
  if (disponibilidad.disponibles < numPersonas) {
    return res.status(409).json({
      error: `Lo sentimos, ya no quedan plazas para ese turno ese día (quedan ${disponibilidad.disponibles}).`,
    });
  }

  const bloqueosZona = leerBloqueosZona();
  const zonasBloqueadas = new Set(
    bloqueosZona.filter((b) => b.fecha === fecha && b.turno === franja.nombre).map((b) => b.zona)
  );

  const mesas = asignarMesa(config, fecha, franja, numPersonas, reservas, zona, zonasBloqueadas);
  if (!mesas) {
    const zonaTexto = zona && zona !== 'Cualquiera' ? ` en la zona ${zona}` : '';
    return res.status(409).json({
      error: `No tenemos ninguna mesa libre${zonaTexto} para ese horario. Prueba otro turno${zona && zona !== 'Cualquiera' ? ' o cambia de zona' : ''}.`,
    });
  }

  const reservaId = crypto.randomUUID();
  const cancelUrl = `${req.protocol}://${req.get('host')}/cancelar.html?id=${reservaId}`;

  const reserva = {
    id: reservaId,
    nombre,
    telefono,
    email: email || '',
    fecha,
    franjaId: franja.id,
    franjaNombre: franja.nombre,
    hora: franja.inicio,
    zonaPreferida: zona && zona !== 'Cualquiera' ? zona : '',
    personas: numPersonas,
    ...resumenMesas(mesas),
    comentarios: comentarios || '',
    estado: 'confirmada',
    recordatorioEnviado: false,
    cancelUrl,
    creada: new Date().toISOString(),
  };

  reservas.push(reserva);
  guardarReservas(reservas);

  if (transporter) {
    const destino = process.env.RESTAURANT_EMAIL || process.env.GMAIL_USER;
    try {
      await transporter.sendMail({
        from: `"Web La Rueda" <${process.env.GMAIL_USER}>`,
        to: destino,
        replyTo: email || undefined,
        subject: `Nueva reserva: ${nombre} - ${fecha} ${franja.nombre} ${franja.inicio} (${numPersonas}p)`,
        text:
          `Nueva reserva desde la web\n\n` +
          `Nombre: ${nombre}\n` +
          `Teléfono: ${telefono}\n` +
          `Email: ${email || '-'}\n` +
          `Fecha: ${fecha}\n` +
          `Turno: ${franja.nombre} (${franja.inicio})\n` +
          `Personas: ${numPersonas}\n` +
          `Mesa asignada: ${reserva.mesaNombre}${reserva.mesaZona ? ' (' + reserva.mesaZona + ')' : ''}\n` +
          `Comentarios: ${comentarios || '-'}\n`,
      });
    } catch (err) {
      console.error('No se pudo enviar el email de la reserva:', err.message);
      // La reserva ya quedó guardada en reservas.json aunque falle el email.
    }
  } else {
    console.warn('GMAIL_USER/GMAIL_APP_PASSWORD no configurados: la reserva se guardó pero no se envió email.');
  }

  await avisarWhatsapp(reserva);
  await enviarEmailCliente(reserva, {
    asunto: `Confirmación de tu reserva en La Rueda (${reserva.fecha})`,
    cuerpo: textoConfirmacionCliente(reserva),
  });

  res.json({ ok: true, id: reserva.id, mesa: reserva.mesaNombre, turno: `${franja.nombre} (${franja.inicio})` });
});

// Alta manual de reservas por telefono (solo admin): sin limite de personas y sin bloquear
// por aforo, ya que quien llama por telefono conoce la situacion real del restaurante.
app.post('/api/admin/reservas', requiereAdmin, async (req, res) => {
  const { nombre, telefono, email, fecha, franjaId, personas, comentarios, zona } = req.body || {};

  if (!nombre || !telefono || !fecha || !franjaId || !personas) {
    return res.status(400).json({ error: 'Faltan datos obligatorios (nombre, teléfono, fecha, turno, personas)' });
  }

  const numPersonas = Number(personas);
  if (!Number.isInteger(numPersonas) || numPersonas < 1) {
    return res.status(400).json({ error: 'El número de personas no es válido' });
  }

  const config = leerConfig();
  const aperturas = leerAperturas();
  const franja = franjasDelDia(config, fecha, aperturas).find((f) => f.id === franjaId);
  if (!franja) {
    return res.status(400).json({ error: 'Ese turno no existe ese día. Elige uno de la lista.' });
  }

  const reservas = leerReservas();
  const mesas = asignarMesa(config, fecha, franja, numPersonas, reservas, zona);

  const reservaId = crypto.randomUUID();
  const cancelUrl = `${req.protocol}://${req.get('host')}/cancelar.html?id=${reservaId}`;

  const reserva = {
    id: reservaId,
    nombre,
    telefono,
    email: email || '',
    fecha,
    franjaId: franja.id,
    franjaNombre: franja.nombre,
    hora: franja.inicio,
    zonaPreferida: zona && zona !== 'Cualquiera' ? zona : '',
    personas: numPersonas,
    ...(mesas ? resumenMesas(mesas) : { mesaIds: [], mesaNombre: 'Sin asignar (todas ocupadas)', mesaZona: '' }),
    comentarios: comentarios || '',
    estado: 'confirmada',
    recordatorioEnviado: false,
    cancelUrl,
    creada: new Date().toISOString(),
    creadaPorAdmin: true,
  };

  reservas.push(reserva);
  guardarReservas(reservas);

  await enviarEmailCliente(reserva, {
    asunto: `Confirmación de tu reserva en La Rueda (${reserva.fecha})`,
    cuerpo: textoConfirmacionCliente(reserva),
  });

  res.json({ ok: true, id: reserva.id, mesa: reserva.mesaNombre, turno: `${franja.nombre} (${franja.inicio})` });
});

// Consulta y cancelacion publicas: el propio id (UUID, imposible de adivinar) hace de
// clave de acceso, para que el cliente pueda ver/cancelar su reserva desde el enlace del email.
app.get('/api/reservas/publica/:id', (req, res) => {
  const reserva = leerReservas().find((r) => r.id === req.params.id);
  if (!reserva) return res.status(404).json({ error: 'No encontramos esa reserva.' });
  const { nombre, fecha, franjaNombre, hora, personas, estado } = reserva;
  res.json({ nombre, fecha, franjaNombre, hora, personas, estado });
});

app.post('/api/reservas/publica/:id/cancelar', async (req, res) => {
  const reservas = leerReservas();
  const reserva = reservas.find((r) => r.id === req.params.id);
  if (!reserva) return res.status(404).json({ error: 'No encontramos esa reserva.' });

  if (reserva.estado === 'cancelada') {
    return res.json({ ok: true, yaEstabaCancelada: true });
  }

  reserva.estado = 'cancelada';
  guardarReservas(reservas);

  if (transporter) {
    const destino = process.env.RESTAURANT_EMAIL || process.env.GMAIL_USER;
    try {
      await transporter.sendMail({
        from: `"Web La Rueda" <${process.env.GMAIL_USER}>`,
        to: destino,
        subject: `Reserva cancelada por el cliente: ${reserva.nombre} - ${reserva.fecha} ${reserva.hora}`,
        text:
          `El cliente ha cancelado su reserva desde el email:\n\n` +
          `Nombre: ${reserva.nombre}\n` +
          `Fecha: ${reserva.fecha}\n` +
          `Turno: ${reserva.franjaNombre} (${reserva.hora})\n` +
          `Personas: ${reserva.personas}\n` +
          `Mesa: ${reserva.mesaNombre}\n`,
      });
    } catch (err) {
      console.error('No se pudo avisar de la cancelación por email:', err.message);
    }
  }

  res.json({ ok: true });
});

app.get('/api/reservas', requiereAdmin, (req, res) => {
  res.json(leerReservas());
});

app.patch('/api/reservas/:id', requiereAdmin, (req, res) => {
  const { estado } = req.body || {};
  const reservas = leerReservas();
  const reserva = reservas.find((r) => r.id === req.params.id);
  if (!reserva) return res.status(404).json({ error: 'Reserva no encontrada' });
  reserva.estado = estado;
  guardarReservas(reservas);
  res.json({ ok: true });
});

app.delete('/api/reservas/:id', requiereAdmin, (req, res) => {
  const reservas = leerReservas().filter((r) => r.id !== req.params.id);
  guardarReservas(reservas);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Servidor de La Rueda escuchando en http://localhost:${PORT}`);
});
