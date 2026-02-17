const form = document.getElementById('booking-form');
const serviceSelect = document.getElementById('service');
const dateInput = document.getElementById('date');
const timeSelect = document.getElementById('time');
const notice = document.getElementById('form-notice');

const params = new URLSearchParams(window.location.search);
const preselectedService = params.get('service');

async function loadServices() {
  const res = await fetch('/api/services');
  const services = await res.json();

  serviceSelect.innerHTML = '<option value="">Choisir une prestation</option>';
  services.forEach((service) => {
    const option = document.createElement('option');
    option.value = service.id;
    option.textContent = `${service.name} — ${service.price.toLocaleString('fr-FR')} DZD`;
    serviceSelect.appendChild(option);
  });

  if (preselectedService) {
    serviceSelect.value = preselectedService;
  }
}

async function loadSlots() {
  const date = dateInput.value;
  if (!date) return;

  timeSelect.innerHTML = '<option value="">Chargement...</option>';
  const response = await fetch(`/api/slots?date=${encodeURIComponent(date)}`);
  const payload = await response.json();

  if (!response.ok) {
    timeSelect.innerHTML = '<option value="">Indisponible</option>';
    notice.textContent = payload.message || 'Erreur de chargement des créneaux.';
    notice.style.color = '#b00020';
    return;
  }

  if (!payload.slots.length) {
    timeSelect.innerHTML = '<option value="">Aucun créneau disponible</option>';
    return;
  }

  timeSelect.innerHTML = '<option value="">Choisissez un créneau</option>';
  payload.slots.forEach((slot) => {
    const option = document.createElement('option');
    option.value = slot;
    option.textContent = slot;
    timeSelect.appendChild(option);
  });
}

function getMinDate() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

dateInput.min = getMinDate();
dateInput.addEventListener('change', loadSlots);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  notice.textContent = 'Réservation en cours...';
  notice.style.color = '#7b6a4a';

  const data = Object.fromEntries(new FormData(form).entries());

  const response = await fetch('/api/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  const payload = await response.json();
  if (!response.ok) {
    notice.textContent = payload.message || 'Erreur lors de la réservation.';
    notice.style.color = '#b00020';
    await loadSlots();
    return;
  }

  notice.textContent = payload.message;
  notice.style.color = '#1b5e20';
  form.reset();
  timeSelect.innerHTML = '<option value="">Sélectionnez d\'abord une date</option>';
});

loadServices();
