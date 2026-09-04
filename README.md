# HMPD Ticket Bot

Bot Discord de tickets personnalisé avec :

- panneau de création de tickets ;
- catégories Support / Police / Réclamation / Bug / Administration ;
- salon privé automatiquement créé ;
- un ticket ouvert maximum par utilisateur et par type ;
- bouton **Prendre** ;
- bouton **Libérer** ;
- ajout et retrait d'un membre ;
- fermeture avec motif obligatoire ;
- transcript HTML envoyé dans le salon de logs ;
- historique PostgreSQL dans Neon ;
- restauration des boutons après redémarrage ;
- commande `/ticket-panel` ;
- commande `/ticket-info` ;
- commande `/ticket-close` ;
- serveur HTTP `/health` compatible Render.

## 1. Créer le bot Discord

Dans le Discord Developer Portal :

1. Crée une application puis un bot.
2. Copie le token dans `DISCORD_TOKEN`.
3. Active les intents :
   - **Server Members Intent**
   - **Message Content Intent**
4. Invite le bot avec les permissions :
   - View Channels
   - Manage Channels
   - Manage Roles
   - Send Messages
   - Embed Links
   - Attach Files
   - Read Message History
   - Use Application Commands

Le rôle du bot doit se trouver au-dessus des rôles/salons qu'il doit gérer.

## 2. Préparer Discord

Crée :

- une catégorie pour chaque type de ticket, ou réutilise la même catégorie ;
- un salon de logs ;
- les rôles staff nécessaires.

Active le mode développeur Discord puis copie les IDs.

Exemple :

```env
CATEGORY_SUPPORT_ID=123456789012345678
ROLE_SUPPORT_IDS=111111111111111111,222222222222222222
```

## 3. Neon

Crée un projet Neon et copie la chaîne de connexion PostgreSQL dans :

```env
DATABASE_URL=postgresql://...
```

Le bot crée automatiquement ses tables au démarrage.

## 4. Variables d'environnement

Copie `.env.example` vers `.env` en local.

Sur Render, ajoute toutes les variables dans **Environment**.

Variables obligatoires :

- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`
- `DATABASE_URL`
- `TICKET_LOG_CHANNEL_ID`
- au moins une `CATEGORY_*_ID`
- les rôles correspondants `ROLE_*_IDS`

## 5. Installation locale

```bash
npm install
npm start
```

## 6. Déploiement Render

Pousse le projet sur GitHub puis crée un Web Service Render.

Tu peux aussi utiliser `render.yaml`.

Build command :

```bash
npm install
```

Start command :

```bash
npm start
```

Health check :

```text
/health
```

## 7. Créer le panneau

Une fois le bot connecté :

```text
/ticket-panel
```

Le bot publie le panneau dans le salon où la commande est utilisée.

## Commandes

### `/ticket-panel`
Publie le panneau. Réservé aux administrateurs Discord ou aux rôles configurés dans `PANEL_ADMIN_ROLE_IDS`.

### `/ticket-info`
Affiche les informations du ticket courant.

### `/ticket-close`
Ferme le ticket avec un motif.

## Boutons du ticket

- **Prendre** : assigne le ticket au membre du staff.
- **Libérer** : retire l'assignation.
- **Ajouter membre** : ajoute un utilisateur au ticket.
- **Retirer membre** : retire un utilisateur ajouté.
- **Fermer** : demande un motif, génère le transcript, log puis supprime le salon.

## Sécurité

Ne mets jamais ton token Discord ni `DATABASE_URL` dans GitHub. Utilise `.env` en local et les variables Render en production.


# V2 — Tickets Illegal / Braquages

La V2 ajoute un bouton **Demande de braquage** réservé au rôle `Illegal`.

Le joueur choisit ensuite son opération dans un menu :

| Opération | Maximum de tickets ouverts |
| --- | ---: |
| Bobcat | 3 |
| Train | 2 |
| Yacht | 2 |
| Labo | 2 |
| Banque centrale | 2 |
| Cargo | 2 |
| Submarine | 1 |

Le bot compte les tickets ouverts dans Neon avant chaque création.

Exemple : si Banque centrale est à **2/2**, une troisième demande est refusée avec un message indiquant de choisir une autre opération. Dès qu'un ticket Banque centrale est fermé, la capacité repasse automatiquement à **1/2**.

## Variables supplémentaires

```env
ROLE_ILLEGAL_ID=
CATEGORY_ROBBERY_ID=
ROLE_ROBBERY_STAFF_IDS=
```

`ROLE_ILLEGAL_ID` : rôle Discord obligatoire pour ouvrir un braquage.

`CATEGORY_ROBBERY_ID` : catégorie Discord qui contiendra les salons de braquage.

`ROLE_ROBBERY_STAFF_IDS` : rôle(s) staff autorisé(s) à voir, prendre et gérer ces tickets. Plusieurs IDs peuvent être séparés par des virgules.

## Important après mise à jour

La table Neon est migrée automatiquement : le bot ajoute la colonne `robbery_type` si elle n'existe pas.
