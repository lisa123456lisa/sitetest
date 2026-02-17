const express = require('express');
const path = require('path');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const CALENDAR_ID = process.env.CALENDAR_ID;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SERVICES = [
  { id: 'hydrafacial', name: 'Hydrafacial', price: 18000 },
  { id: 'peeling-chimique', name: 'Peeling chimique', price: 22000 },
  { id: 'sculptra', name: 'Sculptra', price: 45000 },
  { id: 'nez', name: 'Filler Nez', price: 35000 },
  { id: 'levres', name: 'Filler Lèvres', price: 30000 },
  { id: 'menton', name: 'Filler Menton', price: 28000 },
  { id: 'jawline', name: 'Jawline', price: 40000 }
];

const slotLocks = new Set();

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/calendar']
});

const calendar = google.calendar({ version: 'v3', auth });

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

function formatDateTime(date, time) {
  return new Date(`${date}T${time}:00+01:00`);
}

function buildDailySlots(date) {
  const targetDate = new Date(`${date}T09:00:00+01:00`);
  if (Number.isNaN(targetDate.getTime())) return [];

  const day = targetDate.getDay();
  if (day === 0) return [];

  const slots = [];
  for (let hour = 9; hour < 18; hour += 1) {
    slots.push(`${String(hour).padStart(2, '0')}:00`);
  }
  return slots;
}

async function getBusyTimes(date) {
  const start = new Date(`${date}T09:00:00+01:00`).toISOString();
  const end = new Date(`${date}T18:00:00+01:00`).toISOString();

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: start,
      timeMax: end,
      items: [{ id: CALENDAR_ID }]
    }
  });

  return response.data.calendars?.[CALENDAR_ID]?.busy || [];
}

function isSlotBusy(slot, busyRanges, date) {
  const slotStart = formatDateTime(date, slot);
  const slotEnd = new Date(slotStart);
  slotEnd.setHours(slotEnd.getHours() + 1);

  return busyRanges.some((range) => {
    const busyStart = new Date(range.start);
    const busyEnd = new Date(range.end);
    return slotStart < busyEnd && slotEnd > busyStart;
  });
}

app.get('/api/services', (_req, res) => {
  res.json(SERVICES);
});

app.get('/api/slots', async (req, res) => {
  try {
    if (!CALENDAR_ID) {
      return res.status(500).json({ message: 'Configuration calendrier manquante.' });
    }

    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ message: 'Date requise.' });
    }

    const slots = buildDailySlots(date);
    if (!slots.length) return res.json({ date, slots: [] });

    const busyRanges = await getBusyTimes(date);
    const availableSlots = slots.filter((slot) => !isSlotBusy(slot, busyRanges, date));

    return res.json({ date, slots: availableSlots });
  } catch (error) {
    console.error('Erreur récupération créneaux:', error);
    return res.status(500).json({ message: 'Impossible de récupérer les créneaux.' });
  }
});

app.post('/api/book', async (req, res) => {
  const { service, date, time, firstName, lastName, phone, email, message } = req.body;

  if (!service || !date || !time || !firstName || !lastName || !phone || !email) {
    return res.status(400).json({ message: 'Veuillez compléter tous les champs obligatoires.' });
  }

  const lockKey = `${date}-${time}`;
  if (slotLocks.has(lockKey)) {
    return res.status(409).json({ message: 'Créneau en cours de réservation. Réessayez dans un instant.' });
  }

  slotLocks.add(lockKey);

  try {
    const serviceData = SERVICES.find((s) => s.id === service);
    if (!serviceData) {
      return res.status(400).json({ message: 'Prestation invalide.' });
    }

    const startDate = formatDateTime(date, time);
    const endDate = new Date(startDate);
    endDate.setHours(endDate.getHours() + 1);

    if (startDate.getDay() === 0 || startDate.getHours() < 9 || startDate.getHours() >= 18) {
      return res.status(400).json({ message: 'Créneau hors horaires d\'ouverture.' });
    }

    const existing = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      maxResults: 1
    });

    if ((existing.data.items || []).length > 0) {
      return res.status(409).json({ message: 'Ce créneau vient d\'être réservé. Veuillez en choisir un autre.' });
    }

    const event = {
      summary: `RDV ${serviceData.name} - ${firstName} ${lastName}`,
      description: [
        `Patient: ${firstName} ${lastName}`,
        `Téléphone: ${phone}`,
        `Email: ${email}`,
        `Prestation: ${serviceData.name}`,
        `Prix: ${serviceData.price} DZD`,
        `Message: ${message || 'Aucun message'}`
      ].join('\n'),
      start: { dateTime: startDate.toISOString(), timeZone: 'Africa/Algiers' },
      end: { dateTime: endDate.toISOString(), timeZone: 'Africa/Algiers' },
      location: 'Hydra, Alger'
    };

    const inserted = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: event
    });

    const transporter = getTransporter();
    if (transporter) {
      const cabinetEmail = process.env.CABINET_EMAIL || process.env.SMTP_USER;
      const subject = 'Confirmation de rendez-vous - Clinique Élégance Esthétique';
      const datePretty = new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: 'Africa/Algiers'
      }).format(startDate);

      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: email,
        subject,
        text: `Bonjour ${firstName},\n\nVotre rendez-vous pour ${serviceData.name} est confirmé le ${datePretty}.\n\nClinique Élégance Esthétique\nHydra, Alger\n+213 555 00 00 00`
      });

      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: cabinetEmail,
        subject: `Nouveau rendez-vous: ${serviceData.name}`,
        text: `Nouveau rendez-vous confirmé.\n\nPatient: ${firstName} ${lastName}\nTéléphone: ${phone}\nEmail: ${email}\nDate: ${date} ${time}\nPrestation: ${serviceData.name}\nMessage: ${message || 'Aucun message'}\n\nÉvénement: ${inserted.data.htmlLink}`
      });
    }

    return res.json({
      message: 'Votre rendez-vous est confirmé. Un email de confirmation a été envoyé.',
      eventLink: inserted.data.htmlLink
    });
  } catch (error) {
    console.error('Erreur réservation:', error);
    return res.status(500).json({ message: 'Échec de la réservation. Veuillez réessayer.' });
  } finally {
    slotLocks.delete(lockKey);
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Serveur lancé sur http://localhost:${PORT}`);
});
