# Clinique Élégance Esthétique

Site web professionnel moderne (frontend + backend) pour un cabinet de chirurgie esthétique à Hydra, Alger.

## Fonctionnalités

- Design premium, minimaliste, responsive.
- Pages: Accueil, Services, À propos, Prendre rendez-vous, Mentions légales.
- SEO de base (meta descriptions, structure HTML sémantique).
- Accessibilité (labels, `aria-*`, contraste lisible).
- Réservation connectée à Google Calendar:
  - récupération des créneaux disponibles en temps réel (`/api/slots`),
  - blocage des créneaux déjà occupés,
  - protection anti double-réservation (verrou applicatif + vérification finale),
  - insertion automatique de l'événement dans l'agenda du cabinet,
  - envoi d'email de confirmation client + notification cabinet.

## Installation

```bash
npm install
cp .env.example .env
npm start
```

Puis ouvrir `http://localhost:3000`.

## Configuration Google Calendar API

1. Créer un projet Google Cloud.
2. Activer l'API Google Calendar.
3. Créer un **Service Account** et générer une clé JSON.
4. Partager le calendrier du cabinet avec l'email du service account (droits d'édition).
5. Renseigner les variables `.env`:
   - `CALENDAR_ID`
   - `GOOGLE_CLIENT_EMAIL`
   - `GOOGLE_PRIVATE_KEY`

## Configuration emails

Configurer SMTP via:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `CABINET_EMAIL`

## Horaires gérés

- Lundi à Samedi: 09:00 - 18:00
- Dimanche: fermé

## Sécurité

- Variables sensibles via `.env`.
- Validation backend des champs requis.
- Vérification de disponibilité juste avant l'insertion dans Google Calendar.
