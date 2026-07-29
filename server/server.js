const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const MENU_PATH = path.join(__dirname, 'data', 'menu.json');
const RESERVAS_PATH = path.join(__dirname, 'data', 'reservas.json');
const CONFIG_PATH = path.join(__dirname, 'data', 'config.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'cambia-esta-contrasena';
const LIMITE_GRUPO_TELEFONO = 8;

if (!fs.existsSync(RESERVAS_PATH)) {
  fs.writeFileSync(RESERVAS_PATH, '[]', 'utf8');
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

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
  const disponibilidad = calcularDisponibilidad(config, fecha, reservas);
  res.json({ turnoMinutos: config.turnoMinutos, franjas: disponibilidad });
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

// ---------- Reservas ----------
function leerReservas() {
  return JSON.parse(fs.readFileSync(RESERVAS_PATH, 'utf8'));
}
function guardarReservas(lista) {
  fs.writeFileSync(RESERVAS_PATH, JSON.stringify(lista, null, 2), 'utf8');
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

// Franjas que aplican ese dia de la semana (si una franja no tiene "dias", aplica todos los dias)
function franjasDelDia(config, fecha) {
  const diaSemana = diaSemanaISO(fecha);
  return config.franjas.filter((f) => !Array.isArray(f.dias) || f.dias.includes(diaSemana));
}

// Calcula, para una fecha dada, cuantas plazas ya estan ocupadas en cada franja
// (sumando reservas activas -no canceladas- de esa fecha y esa franja).
function calcularDisponibilidad(config, fecha, reservas) {
  const reservasDelDia = reservas.filter((r) => r.fecha === fecha && r.estado !== 'cancelada');

  return franjasDelDia(config, fecha).map((franja) => {
    const ocupadas = reservasDelDia
      .filter((r) => r.franjaId === franja.id)
      .reduce((suma, r) => suma + Number(r.personas), 0);
    const disponibles = Math.max(0, franja.capacidadMaxima - ocupadas);
    return { ...franja, ocupadas, disponibles };
  });
}

// Busca la mesa mas pequeña que quepa al grupo y que no tenga ya otra reserva
// activa esa fecha cuyo turno (franja.inicio + turnoMinutos) se solape con el nuevo.
function asignarMesa(config, fecha, franja, personas, reservas) {
  const inicioNueva = minutosDesdeMedianoche(franja.inicio);
  const finNueva = inicioNueva + config.turnoMinutos;

  const reservasDelDia = reservas.filter((r) => r.fecha === fecha && r.estado !== 'cancelada' && r.mesaId);

  const mesasOrdenadas = [...config.mesas]
    .filter((m) => m.capacidad >= Number(personas))
    .sort((a, b) => a.capacidad - b.capacidad);

  for (const mesa of mesasOrdenadas) {
    const ocupadaEnSolape = reservasDelDia.some((r) => {
      if (r.mesaId !== mesa.id) return false;
      const otraFranja = config.franjas.find((f) => f.id === r.franjaId);
      if (!otraFranja) return false;
      const otroInicio = minutosDesdeMedianoche(otraFranja.inicio);
      const otroFin = otroInicio + config.turnoMinutos;
      return inicioNueva < otroFin && otroInicio < finNueva;
    });
    if (!ocupadaEnSolape) return mesa;
  }
  return null;
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
  const { nombre, telefono, email, fecha, franjaId, personas, comentarios } = req.body || {};

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
  const franja = franjasDelDia(config, fecha).find((f) => f.id === franjaId);
  if (!franja) {
    return res.status(400).json({ error: 'Ese turno no está disponible ese día. Elige uno de la lista.' });
  }

  const reservas = leerReservas();

  const disponibilidad = calcularDisponibilidad(config, fecha, reservas).find((f) => f.id === franjaId);
  if (disponibilidad.disponibles < numPersonas) {
    return res.status(409).json({
      error: `Lo sentimos, ya no quedan plazas para ese turno ese día (quedan ${disponibilidad.disponibles}).`,
    });
  }

  const mesa = asignarMesa(config, fecha, franja, numPersonas, reservas);
  if (!mesa) {
    return res.status(409).json({
      error: 'No tenemos ninguna mesa libre para ese número de personas en ese horario. Prueba otro turno.',
    });
  }

  const reserva = {
    id: crypto.randomUUID(),
    nombre,
    telefono,
    email: email || '',
    fecha,
    franjaId: franja.id,
    franjaNombre: franja.nombre,
    hora: franja.inicio,
    personas: numPersonas,
    mesaId: mesa.id,
    mesaNombre: mesa.nombre,
    mesaZona: mesa.zona || '',
    comentarios: comentarios || '',
    estado: 'pendiente',
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
          `Mesa asignada: ${mesa.nombre}${mesa.zona ? ' (' + mesa.zona + ')' : ''}\n` +
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

  res.json({ ok: true, id: reserva.id, mesa: mesa.nombre, turno: `${franja.nombre} (${franja.inicio})` });
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
