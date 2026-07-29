# Web de Restaurante La Rueda (Chulilla)

Esta carpeta contiene la web completa: página pública + panel de gestión + sistema de reservas propio (sin depender de TheFork ni de ninguna plataforma externa de pago).

## Estructura

```
la-rueda-web/
  public/         -> la web que ve el cliente (index.html) y el panel (admin.html)
  server/         -> el "motor" que guarda reservas, envía emails y sirve la carta
    data/menu.json      -> la carta y los menús (se edita desde admin.html, no hace falta tocar este archivo a mano)
    data/config.json    -> vuestras mesas y los turnos de reserva (se edita desde admin.html)
    data/reservas.json  -> las reservas recibidas, con la mesa ya asignada (se crea solo)
    .env                 -> contraseñas y configuración (NUNCA se sube a internet)
```

## 1. Editar la carta día a día (desde el móvil)

1. Entra en `vuestrodominio.com/admin.html` desde el móvil o el ordenador.
2. Escribe la contraseña del panel (la que pongáis en `ADMIN_PASSWORD`, ver más abajo).
3. En la pestaña **"📋 Carta"**: puedes cambiar precios, borrar un plato que se haya acabado (🗑️), añadir uno nuevo ("+ Añadir plato") o incluso una categoría nueva.
4. En la pestaña **"🍽️ Menús"**: igual de fácil, pero para los menús cerrados (Menú Chulilla, Menú Brasa...). Puedes cambiar el precio, las condiciones, y añadir/quitar/editar cada línea de plato, o añadir un menú nuevo entero.
5. Pulsa **"Guardar cambios"** en la pestaña donde estés trabajando. Se actualiza al momento en la web, sin tocar código ni subir nada.
6. En la pestaña **"📅 Reservas"** veis todas las reservas recibidas, con la mesa que se le ha asignado sola, y podéis marcarlas como confirmadas/canceladas o borrarlas.

## 2. Cómo funciona el motor de reservas (mesas y turnos)

Esto es lo que hace que las reservas sean "profesionales": la web sabe cuántas mesas tenéis, cuánto dura una comida y cuánta gente cabe en cada turno, y con eso decide sola si puede aceptar una reserva y en qué mesa.

En la pestaña **"🪑 Mesas y turnos"** del panel configuráis:

- **Tiempo que ocupa una mesa**: cuántos minutos consideráis que dura un servicio (por defecto 120 = 2 horas). Mientras dure ese tiempo desde la hora del turno, esa mesa no se vuelve a ofrecer para otra reserva que se solape.
- **Mesas**: la lista real de vuestras mesas (ahora mismo: 10 en sala interior —4 de ellas de 6 personas, el resto de 4— y 10 en terraza, todas de 4). Podéis editar nombre, zona y capacidad de cada una, añadir mesas nuevas o borrar alguna.
- **Turnos de reserva**: tramos de 15 minutos en los que aceptáis reservas, cada uno con su propio aforo máximo (ahora mismo, 8 personas por turno de 15 min). Configurado así:
  - **Comidas** (13:00–15:30, cada 15 min): lunes, martes, viernes, sábado y domingo.
  - **Cenas** (20:30–22:30, cada 15 min): solo viernes y sábado.
  - **Miércoles y jueves**: cerrado, no aparece ningún turno y no se puede reservar.
  - Las letras L M X J V S D de cada turno marcan en qué días de la semana aplica ese turno — tocad una letra para activarla o desactivarla. Podéis añadir, cambiar o borrar turnos cuando cambiéis de horario (por temporada, por ejemplo).
- **Grupos de 8 o más personas**: la web no deja reservarlos online; les pide que llamen por teléfono, ya que para esos grupos trabajáis con menú a mesa completa.

Cuando alguien reserva desde la web:

1. Comprueba que ese turno existe ese día de la semana (si no, no aparece en la lista).
2. Comprueba que ese turno, ese día concreto, no ha llegado ya al aforo máximo que hayáis puesto.
3. Busca la mesa más pequeña que le venga bien a ese número de personas y que no esté ya ocupada en un horario que se solape (según el "tiempo que ocupa una mesa").
4. Si encuentra hueco y mesa, confirma la reserva y la asigna automáticamente. Si no, le avisa de que no queda sitio para que pruebe otro turno u os llame.

Todo esto lo veis reflejado al momento en la pestaña "Reservas": qué turno, qué mesa y cuántas plazas quedan libres. Si cancela una reserva, esa mesa y ese hueco de aforo quedan libres automáticamente para la siguiente persona que reserve.

## 3. Configurar el email de las reservas

Cuando alguien reserva desde la web, se guarda siempre en el sistema, y además se manda un email a `restaurantelaruedachulilla@gmail.com`. Para que el envío de email funcione hace falta una "contraseña de aplicación" de Gmail (no vuestra contraseña normal):

1. Entrad en esa cuenta de Gmail y activad la verificación en dos pasos (si no la tenéis ya): https://myaccount.google.com/security
2. Id a https://myaccount.google.com/apppasswords y generad una contraseña de aplicación (elige "Otra" y ponle un nombre como "Web La Rueda").
3. Copiad esa contraseña de 16 letras.
4. Abrid el archivo `server/.env` (si no existe, copiad `server/.env.example` y renombradlo a `.env`) y rellenad:
   ```
   GMAIL_USER=restaurantelaruedachulilla@gmail.com
   GMAIL_APP_PASSWORD=la contraseña de 16 letras que os ha dado Google
   ADMIN_PASSWORD=una contraseña vuestra para entrar al panel
   ```
5. Reiniciad el servidor. Ya deberían llegar los emails.

Si en algún momento el email fallara por lo que sea, la reserva **nunca se pierde**: siempre queda guardada y visible en la pestaña "Reservas" del panel.

## 4. Aviso de reservas por WhatsApp

Además del email, cada reserva nueva puede avisaros también por WhatsApp al momento. Usamos **CallMeBot**, un servicio gratuito muy sencillo (no hace falta cuenta de empresa ni tarjeta):

1. Abrid WhatsApp en el móvil del restaurante y seguid los pasos de activación de aquí: https://www.callmebot.com/blog/free-api-whatsapp-messages/ (básicamente: añadir un contacto y enviarle un mensaje concreto de activación).
2. CallMeBot os responderá por WhatsApp con vuestra "API Key" (un número).
3. Rellenad en `server/.env`:
   ```
   CALLMEBOT_PHONE=34613727680
   CALLMEBOT_APIKEY=la clave que os haya dado CallMeBot
   ```
4. Reiniciad el servidor. A partir de ahí, cada reserva nueva os llega por WhatsApp además de por email.

Si algún día CallMeBot dejara de funcionar o preferís algo más "oficial" (WhatsApp Business API vía Twilio, con coste por mensaje), avisadme y lo cambiamos sin tocar el resto de la web.

## 5. Fotos

De momento la web usa colores en vez de fotos para no depender de nada externo. Para poneros las vuestras:

- Descargad 4-6 fotos buenas del Instagram [@restaurante.larueda](https://www.instagram.com/restaurante.larueda/) (fachada, un par de platos, la sala) o haced fotos nuevas.
- Guardad la foto de portada como `public/images/hero-fachada.jpg` (horizontal, ancha).
- Si queréis más fotos en otras secciones, decídmelo y os preparo los huecos.

## 6. Cómo poner la web en internet (hosting)

Recomiendo **Render.com**: es sencillo, tiene un plan gratuito/muy barato, y soporta bien esto (a diferencia de un hosting solo-PHP, aquí necesitamos Node.js corriendo todo el rato para las reservas).

El código ya está subido en: `https://github.com/restaurantelaruedachulilla-bot/larueda`

Pasos:

1. Entrad en https://render.com y creaos una cuenta (lo más fácil es "Sign up with GitHub").
2. Una vez dentro, **"New +"** → **"Web Service"**.
3. Conectad el repositorio `larueda` (Render os pedirá autorizar el acceso a GitHub la primera vez).
4. Configuración del servicio:
   - **Name**: `la-rueda-web` (o el que queráis)
   - **Region**: la más cercana a España (normalmente Frankfurt)
   - **Branch**: `main`
   - **Root Directory**: `server`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. En **"Environment Variables"** añadid:
   ```
   ADMIN_PASSWORD=roble-rio-9641
   RESTAURANT_EMAIL=restaurantelaruedachulilla@gmail.com
   GMAIL_USER=restaurantelaruedachulilla@gmail.com
   GMAIL_APP_PASSWORD=(la contraseña de aplicación del punto 3)
   CALLMEBOT_PHONE=34613727680
   CALLMEBOT_APIKEY=(la clave del punto 4)
   DATA_DIR=/var/data
   ```
   (podéis dejar vacías las de email/WhatsApp de momento y añadirlas más adelante)
6. **Importante — que los datos no se borren**: en la pestaña **"Disks"** del servicio, añadid un disco persistente con **Mount Path** = `/var/data` (el mismo valor que pusisteis en `DATA_DIR`). Esto es lo que hace que la carta, las mesas y las reservas sobrevivan cada vez que se actualiza la web. **Los discos persistentes requieren un plan de pago** (el más básico suele bastar); en el plan gratuito el servicio funciona pero cualquier cambio guardado se perderá la próxima vez que Render reinicie el servicio.
7. Guardad y desplegad. Render os dará una URL tipo `la-rueda-web.onrender.com` — esa ya es vuestra web funcionando.
8. Cuando compréis un dominio (p. ej. en Namecheap o similar), en Render vais a **"Settings" → "Custom Domain"** y os indica los registros DNS que hay que añadir en vuestro proveedor de dominio.

Si preferís otro hosting (uno que ya tengáis, o uno con cPanel), avisadme del proveedor y os digo cómo adaptar estos pasos.

## 7. Perfil de Negocio de Google (más adelante)

Cuando queráis, se puede enlazar esta web desde vuestro Perfil de Negocio de Google (el que aparece en Google Maps y en la búsqueda):

- En el apartado "Menú" del perfil se puede poner el enlace a `vuestrodominio.com/#carta`.
- En "Reservar" (o como botón de sitio web) se puede enlazar `vuestrodominio.com/#reservas`, que lleva directo al formulario.

Esto ya funcionará solo con tener la web publicada; avisadme cuando queráis hacerlo y os ayudo con los pasos exactos dentro de Google Business Profile.

## 8. Seguridad

- Cambiad `ADMIN_PASSWORD` por una contraseña vuestra antes de publicar la web (no dejéis "cambia-esta-contrasena").
- El archivo `.env` nunca debe subirse a GitHub (ya está excluido en `.gitignore`).
