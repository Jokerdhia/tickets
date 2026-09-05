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
- Racer / Speed Unit
- Police / HMPD
- Réclamation
- Administration

Pour Racer / Speed Unit, ajouter dans Render :

```env
CATEGORY_RACER_ID=
ROLE_RACER_IDS=
```

`CATEGORY_RACER_ID` = catégorie Discord où les tickets Racer seront créés.  
`ROLE_RACER_IDS` = rôle(s) staff pouvant voir et gérer ces tickets, séparés par des virgules si nécessaire.


# V5 — Accès par rôle pour chaque bouton

Le panneau contient uniquement :

- 🔫 Demande de braquage
- 🏎️ Racer / Speed Unit
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
