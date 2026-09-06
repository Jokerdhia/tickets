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


# V3 — Formulaire braquage

Après le choix de l'opération, le bot ouvre un formulaire obligatoire avec uniquement :

- Nom du gang ou de la mafia
- Nombre de criminels
- Modèle(s) d'arme

Le ticket est créé après validation et affiche ces trois informations directement dans l'embed.


# V4 — Acceptation police et délai de 20 minutes

Pour les tickets de braquage :

- les boutons **Ajouter membre** et **Retirer membre** ont été supprimés ;
- quand un membre du staff clique sur **Prendre**, le braquage est considéré comme accepté ;
- un délai de **20 minutes** démarre immédiatement ;
- tous les membres doivent être au point du braquage avant la fin du délai ;
- le staff clique sur **Tout le monde sur place** pour confirmer l'arrivée ;
- si personne ne confirme avant la date limite, le bot ferme automatiquement le ticket et annule le braquage.

Le contrôle d'arrivée est une confirmation Discord par le staff. Le bot ne peut pas vérifier automatiquement
les positions FiveM sans intégration supplémentaire avec le serveur de jeu.


# V4.2 — Panneau simplifié + Racer

Le panneau principal n'affiche plus les boutons **Support** et **Bug**.

Boutons affichés :
- Demande de braquage
- Speed Hunters
- Police / HMPD
- Réclamation
- Administration

Pour Speed Hunters, ajouter dans Render :

```env
CATEGORY_RACER_ID=
ROLE_RACER_IDS=
```

`CATEGORY_RACER_ID` = catégorie Discord où les tickets Racer seront créés.  
`ROLE_RACER_IDS` = rôle(s) staff pouvant voir et gérer ces tickets, séparés par des virgules si nécessaire.


# V5 — Accès par rôle pour chaque bouton

Le panneau contient uniquement :

- 🔫 Demande de braquage
- 🏎️ Speed Hunters
- 🚓 Police / HMPD
- ⚠️ Réclamation Police

Le bouton Braquage reste contrôlé par `ROLE_ILLEGAL_ID`.

Les trois autres boutons ont maintenant des rôles d'accès séparés des rôles staff :

```env
ROLE_RACER_ACCESS_IDS=
ROLE_POLICE_ACCESS_IDS=
ROLE_COMPLAINT_ACCESS_IDS=
```

Les variables `*_ACCESS_IDS` indiquent **qui peut ouvrir** le ticket.

Les variables existantes `ROLE_RACER_IDS`, `ROLE_POLICE_IDS` et `ROLE_COMPLAINT_IDS` indiquent **quel staff peut voir et gérer** le ticket.

Plusieurs rôles peuvent être fournis avec des virgules :

```env
ROLE_POLICE_ACCESS_IDS=111111111111111111,222222222222222222
```

Un administrateur Discord peut toujours ouvrir les tickets pour les tests.

Si un utilisateur n'a pas le rôle requis, aucun salon n'est créé et le bot lui répond avec un message privé.


# V5.1 — واجهة عربية احترافية

تم تحويل واجهة المستخدم الأساسية إلى العربية بصياغة أكثر احترافية، بما في ذلك:

- لوحة التذاكر
- رسائل منع الوصول حسب الرتبة
- تذاكر Racer / Police / Complaint
- نموذج السطو
- قبول السطو
- مهلة 20 دقيقة
- تأكيد وصول جميع الأعضاء
- إلغاء السطو تلقائياً عند انتهاء المهلة
- أزرار الاستلام والإغلاق


# V6 — Professional Robbery Workflow

Améliorations principales :

- workflow séparé **Prendre → Accepter / Refuser** ;
- le timer de 20 minutes démarre uniquement quand la police clique sur **Accepter** ;
- refus avec motif obligatoire et log automatique ;
- rappels automatiques à 10 minutes puis 5 minutes ;
- annulation automatique à l'expiration ;
- une seule opération active par gang/mafia ;
- stockage en base du gang/mafia, nombre de participants et armes ;
- logs enrichis lors de la fermeture ;
- contrôle du nombre maximal de participants par opération.

Limites configurées :

| Opération | Maximum participants |
| --- | ---: |
| Train | 6 |
| Yacht | 6 |
| Labo | 6 |
| Pacific Bank | 8 |
| Cargo | 12 |
| Submarine | 15 |
| Bobcat | non défini |

Les quotas de tickets simultanés restent ceux de la version précédente.


# V6.1 — Professional UI

Changes:

- Bobcat maximum participants: **4**
- All Discord **button labels are in English**
- Main messages and instructions remain professional Arabic
- Robbery workflow remains:
  - Claim
  - Approve / Reject
  - 20-minute arrival deadline
  - 10-minute and 5-minute reminders
  - All On Site confirmation
  - Auto-cancel on timeout
- One active robbery maximum per gang / mafia
- Participant limits enforced automatically

Participant limits:

| Operation | Max participants |
| --- | ---: |
| Bobcat | 4 |
| Train | 6 |
| Yacht | 6 |
| Labo | 6 |
| Pacific Bank | 8 |
| Cargo | 12 |
| Submarine | 15 |


# V6.3 — Complete Ticket Logs

Closing a ticket now logs all ticket metadata and attaches a full HTML transcript containing messages, embeds, attachments, reactions, reply references and timestamps.


# V7 — Command Center (Discord only)

No web dashboard is included.

## Added
- Permanent ticket codes: `RB-000001`, `SH-000001`, `HP-000001`, `PC-000001`
- Transfer button for staff ownership
- Internal staff notes stored in Neon and included in closing logs
- `/ticket-notes`
- `/ticket-history`
- `/ticket-stats`
- `/ticket-blacklist add|remove|check`
- `/ticket-warning add|list`
- Automatic blacklist check before ticket creation
- Gang/Mafia cooldown after a closed robbery
- Automatic escalation for unclaimed tickets
- Detailed closing logs and HTML transcripts from V6.3
- Existing robbery workflow retained: Claim → Approve/Reject → 20 min → reminders → All On Site / timeout
- English-only button labels retained

## Optional environment variables
- `TICKET_SUPERVISOR_ROLE_IDS` — comma-separated role IDs allowed to use blacklist/history/stats/warnings.
- `ROBBERY_COOLDOWN_MINUTES` — default `30`.
- `TICKET_ESCALATION_MINUTES` — default `10`.

# V7.1 — Robbery UI Refresh

- Cleaner robbery selection panel
- Bidi-safe formatting for Arabic + English
- English dropdown placeholder
- Clear Slots / Max Players / Status layout
- Professional status legend
- Cleaner robbery rules section
- Ephemeral panel auto-deletes after 60 seconds

# V7.2 — Cargo Capacity

- Cargo: maximum **1 active request** at a time.
- Cargo max participants remains **12**.

# V7.3 — Requester Mentions

The requester is automatically tagged on:
- Claim
- Approval
- Rejection
- Transfer
- Arrival confirmation
- 10-minute reminder
- 5-minute reminder
- Automatic cancellation / expiration
- Unclaimed ticket escalation

# V7.4 — Requester All On Site

- The requester who opened the robbery ticket can now use **All On Site**.
- Authorized HMPD staff can still use the button.
- Other users remain blocked.
- The confirmation records/displays who confirmed the arrival.

# V7.5 — Police-Verified Arrival

New robbery arrival workflow:

1. HMPD uses **Approve**.
2. A strict **30-minute** timer starts.
3. The requester uses **Request Arrival** when all criminals are on site.
4. HMPD uses **Confirm Arrival** or **Reject Arrival**.
5. Rejecting arrival does **not** reset or extend the timer.
6. The requester may submit **Request Arrival** again before the deadline.
7. Automatic reminders are sent after 20 minutes, 25 minutes and 28 minutes.
8. At 30 minutes without police confirmation, the robbery is automatically cancelled.
9. **Robbery Ready** displays operation, gang, participants, approval officer, confirmation officer and arrival time.

Button labels remain English.

# V7.6 — Robbery Activity & Per-Operation Cooldown

- Dedicated robbery activity room via `ROBBERY_HISTORY_CHANNEL_ID`.
- On **Confirm Arrival**, it posts Operation, Gang/Mafia, Requester, Participants, Approved By, Arrival Confirmed By, Arrival Time, Cooldown and Status.
- Every robbery type has its own persistent **30-minute cooldown** after successful arrival confirmation.
- Example: Bobcat cooldown does not block Train, Yacht, Cargo, etc.
- Cooldowns are stored in Neon and survive Render restarts.
- `ROBBERY_OPERATION_COOLDOWN_MINUTES=30` controls the duration.
- If `ROBBERY_HISTORY_CHANNEL_ID` is missing, the normal ticket log room is used.

# V7.7 — Stage-Based Robbery Workflow

The robbery ticket now shows only the buttons relevant to the current stage.

Stages:
1. **Waiting for Staff** → Claim / Close
2. **Police Review** → Release / Approve / Reject / Transfer / Add Note
3. **Travel to Robbery** → Request Arrival / Transfer / Add Note / Close
4. **Arrival Verification** → Confirm Arrival / Reject Arrival / Transfer / Add Note / Close
5. **Operation Finished** → Close only

Every stage change removes the old buttons and sends a new professional embed with the buttons for that step.


# V8 Pro — Reliability & Command Workflow

V8 focuses on reliability, staff control and auditing without a web dashboard.

## New
- Full ticket timeline stored in Neon:
  - Created
  - Claimed / Released
  - Approved / Rejected
  - Arrival Requested / Confirmed / Rejected
  - Transferred
  - Take Over
  - Internal Note
  - Auto Release
  - Close
- `/ticket-timeline`
- Professional robbery channel status names:
  - `wait-*`
  - `review-*`
  - `travel-*`
  - `verify-*`
  - `done-*`
- **Take Over** button for Supervisor / High Grade.
- Automatic release of inactive claimed tickets.
- Restart recovery: open robbery tickets recover their active control buttons after Render restarts.
- Temporary blacklist support with optional duration.
- Automatic warning threshold block.
- Advanced `/ticket-stats overview|staff|robbery`.
- Existing V7.7 step-by-step embeds/buttons remain active.
- Existing 30-minute robbery arrival deadline and per-operation cooldown remain active.
- Existing full HTML transcripts and detailed closing logs remain active.

## Optional environment variables
- `TICKET_CLAIM_AUTO_RELEASE_MINUTES=10`
- `TICKET_WARNING_BLOCK_THRESHOLD=3`
- `TICKET_WARNING_BLOCK_MINUTES=1440`
- Existing `TICKET_SUPERVISOR_ROLE_IDS` controls Take Over and supervisor commands.

# V8.1 Fix
- Fixed robbery workflow buttons disappearing after Claim.
- Discord allows a maximum of 5 buttons per ActionRow.
- V8 accidentally created a 6-button row after adding Take Over.
- Police Review and Arrival Verification now use two valid ActionRows.
- Workflow send errors are now logged instead of being silently ignored.

# V8.2 — Buttons on the latest embed
Robbery workflow buttons are now attached directly to the latest action message:
- Claim embed -> Approve / Reject / Release / Transfer / Add Note / Take Over
- Robbery Approved embed -> Request Arrival / Transfer / Add Note / Take Over / Close
- Arrival Confirmation Requested embed -> Confirm Arrival / Reject Arrival + staff controls
- Arrival Rejected embed -> Request Arrival becomes available again
- Robbery Ready embed -> Close only

Old workflow buttons are removed before the new action message is sent.
A standalone workflow embed is used only for recovery after a Render restart.

# V8.3
- Request Arrival now changes the SAME Discord message immediately to the police review stage.
- Confirm Arrival / Reject Arrival appear immediately.
- Reject Arrival returns the same message to Request Arrival.
- Confirm Arrival changes the same message to Robbery Ready with Close only.
