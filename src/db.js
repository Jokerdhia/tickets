const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL manquant.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT UNIQUE,
      owner_id TEXT NOT NULL,
      ticket_type TEXT NOT NULL,
      robbery_type TEXT,
      robbery_deadline TIMESTAMPTZ,
      robbery_arrived_at TIMESTAMPTZ,
      group_name TEXT,
      criminal_count INTEGER,
      guns TEXT,
      robbery_decision TEXT NOT NULL DEFAULT 'pending',
      accepted_by TEXT,
      accepted_at TIMESTAMPTZ,
      refused_by TEXT,
      refused_at TIMESTAMPTZ,
      refusal_reason TEXT,
      reminder_10_sent BOOLEAN NOT NULL DEFAULT FALSE,
      reminder_5_sent BOOLEAN NOT NULL DEFAULT FALSE,
      status TEXT NOT NULL DEFAULT 'open',
      claimed_by TEXT,
      close_reason TEXT,
      closed_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      claimed_at TIMESTAMPTZ,
      closed_at TIMESTAMPTZ,
      ticket_code TEXT,
      escalated_at TIMESTAMPTZ
    );
  `);

  await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS robbery_type TEXT;`);
  await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS robbery_deadline TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS robbery_arrived_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS group_name TEXT;`);
  await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS criminal_count INTEGER;`);
  await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS guns TEXT;`);
  await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS robbery_decision TEXT NOT NULL DEFAULT 'pending';`);
  await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS accepted_by TEXT;`);
  await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS refused_by TEXT;`);
  await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS refused_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS refusal_reason TEXT;`);
  await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS reminder_10_sent BOOLEAN NOT NULL DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS reminder_5_sent BOOLEAN NOT NULL DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ticket_code TEXT;`);
  await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;`);


  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tickets_owner_status
    ON tickets (guild_id, owner_id, ticket_type, status);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticket_members (
      ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      added_by TEXT NOT NULL,
      added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (ticket_id, user_id)
    );
  `);


await pool.query(`
  CREATE TABLE IF NOT EXISTS ticket_notes (
    id BIGSERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS ticket_blacklist (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    added_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (guild_id, user_id)
  );
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS ticket_warnings (
    id BIGSERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    added_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

  console.log("✅ Base Neon PostgreSQL prête.");
}

async function createTicket({ guildId, channelId, ownerId, ticketType, robberyType = null, groupName = null, criminalCount = null, guns = null }) {
  const { rows } = await pool.query(
    `INSERT INTO tickets (guild_id, channel_id, owner_id, ticket_type, robbery_type, group_name, criminal_count, guns)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [guildId, channelId, ownerId, ticketType, robberyType, groupName, criminalCount, guns]
  );
  const ticket = rows[0];
  const prefixes = { robbery: "RB", racer: "SH", police: "HP", complaint: "PC" };
  const code = `${prefixes[ticketType] || "TK"}-${String(ticket.id).padStart(6, "0")}`;
  const updated = await pool.query(
    `UPDATE tickets SET ticket_code = $2 WHERE id = $1 RETURNING *`,
    [ticket.id, code]
  );
  return updated.rows[0];
}

async function getTicketByChannel(channelId) {
  const { rows } = await pool.query(
    `SELECT * FROM tickets WHERE channel_id = $1 LIMIT 1`,
    [channelId]
  );
  return rows[0] || null;
}

async function getOpenTicketForUser(guildId, ownerId, ticketType) {
  const { rows } = await pool.query(
    `SELECT * FROM tickets
     WHERE guild_id = $1
       AND owner_id = $2
       AND ticket_type = $3
       AND status = 'open'
     ORDER BY created_at DESC
     LIMIT 1`,
    [guildId, ownerId, ticketType]
  );
  return rows[0] || null;
}

async function claimTicket(ticketId, userId) {
  const { rows } = await pool.query(
    `UPDATE tickets
     SET claimed_by = $2, claimed_at = NOW()
     WHERE id = $1 AND status = 'open'
     RETURNING *`,
    [ticketId, userId]
  );
  return rows[0] || null;
}

async function unclaimTicket(ticketId) {
  const { rows } = await pool.query(
    `UPDATE tickets
     SET claimed_by = NULL, claimed_at = NULL
     WHERE id = $1 AND status = 'open'
     RETURNING *`,
    [ticketId]
  );
  return rows[0] || null;
}

async function closeTicket(ticketId, closedBy, reason) {
  const { rows } = await pool.query(
    `UPDATE tickets
     SET status = 'closed',
         closed_by = $2,
         close_reason = $3,
         closed_at = NOW()
     WHERE id = $1 AND status = 'open'
     RETURNING *`,
    [ticketId, closedBy, reason]
  );
  return rows[0] || null;
}

async function addTicketMember(ticketId, userId, addedBy) {
  await pool.query(
    `INSERT INTO ticket_members (ticket_id, user_id, added_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (ticket_id, user_id) DO NOTHING`,
    [ticketId, userId, addedBy]
  );
}

async function removeTicketMember(ticketId, userId) {
  await pool.query(
    `DELETE FROM ticket_members
     WHERE ticket_id = $1 AND user_id = $2`,
    [ticketId, userId]
  );
}


async function countOpenRobberyTickets(guildId, robberyType) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM tickets
     WHERE guild_id = $1
       AND ticket_type = 'robbery'
       AND robbery_type = $2
       AND status = 'open'`,
    [guildId, robberyType]
  );
  return rows[0]?.count || 0;
}

async function getOpenRobberyTicketForUser(guildId, ownerId) {
  const { rows } = await pool.query(
    `SELECT * FROM tickets
     WHERE guild_id = $1
       AND owner_id = $2
       AND ticket_type = 'robbery'
       AND status = 'open'
     ORDER BY created_at DESC
     LIMIT 1`,
    [guildId, ownerId]
  );
  return rows[0] || null;
}


async function setRobberyDeadline(ticketId, deadline) {
  const { rows } = await pool.query(
    `UPDATE tickets
     SET robbery_deadline = $2
     WHERE id = $1 AND status = 'open'
     RETURNING *`,
    [ticketId, deadline]
  );
  return rows[0] || null;
}

async function markRobberyArrived(ticketId) {
  const { rows } = await pool.query(
    `UPDATE tickets
     SET robbery_arrived_at = NOW()
     WHERE id = $1 AND status = 'open'
     RETURNING *`,
    [ticketId]
  );
  return rows[0] || null;
}

async function getExpiredRobberyTickets() {
  const { rows } = await pool.query(
    `SELECT *
     FROM tickets
     WHERE ticket_type = 'robbery'
       AND status = 'open'
       AND robbery_decision = 'accepted'
       AND robbery_deadline IS NOT NULL
       AND robbery_arrived_at IS NULL
       AND robbery_deadline <= NOW()`
  );
  return rows;
}


async function getOpenRobberyTicketForGroup(guildId, groupName) {
  const { rows } = await pool.query(
    `SELECT * FROM tickets
     WHERE guild_id = $1
       AND ticket_type = 'robbery'
       AND status = 'open'
       AND LOWER(TRIM(group_name)) = LOWER(TRIM($2))
     ORDER BY created_at DESC
     LIMIT 1`,
    [guildId, groupName]
  );
  return rows[0] || null;
}

async function acceptRobbery(ticketId, acceptedBy, deadline) {
  const { rows } = await pool.query(
    `UPDATE tickets
     SET robbery_decision = 'accepted',
         accepted_by = $2,
         accepted_at = NOW(),
         robbery_deadline = $3,
         reminder_10_sent = FALSE,
         reminder_5_sent = FALSE
     WHERE id = $1 AND status = 'open' AND robbery_decision = 'pending'
     RETURNING *`,
    [ticketId, acceptedBy, deadline]
  );
  return rows[0] || null;
}

async function refuseRobbery(ticketId, refusedBy, reason) {
  const { rows } = await pool.query(
    `UPDATE tickets
     SET robbery_decision = 'refused',
         refused_by = $2,
         refused_at = NOW(),
         refusal_reason = $3
     WHERE id = $1 AND status = 'open' AND robbery_decision = 'pending'
     RETURNING *`,
    [ticketId, refusedBy, reason]
  );
  return rows[0] || null;
}

async function getRobberiesNeedingReminders() {
  const { rows } = await pool.query(
    `SELECT *
     FROM tickets
     WHERE ticket_type = 'robbery'
       AND status = 'open'
       AND robbery_decision = 'accepted'
       AND robbery_deadline IS NOT NULL
       AND robbery_arrived_at IS NULL`
  );
  return rows;
}

async function markReminderSent(ticketId, kind) {
  const column = kind === 10 ? "reminder_10_sent" : "reminder_5_sent";
  await pool.query(`UPDATE tickets SET ${column} = TRUE WHERE id = $1`, [ticketId]);
}


async function transferTicket(ticketId, userId) {
  const { rows } = await pool.query(
    `UPDATE tickets SET claimed_by = $2, claimed_at = NOW()
     WHERE id = $1 AND status = 'open' RETURNING *`,
    [ticketId, userId]
  );
  return rows[0] || null;
}

async function addTicketNote(ticketId, authorId, note) {
  const { rows } = await pool.query(
    `INSERT INTO ticket_notes (ticket_id, author_id, note)
     VALUES ($1, $2, $3) RETURNING *`,
    [ticketId, authorId, note]
  );
  return rows[0];
}

async function getTicketNotes(ticketId) {
  const { rows } = await pool.query(
    `SELECT * FROM ticket_notes WHERE ticket_id = $1 ORDER BY created_at ASC`,
    [ticketId]
  );
  return rows;
}

async function blacklistUser(guildId, userId, reason, addedBy) {
  await pool.query(
    `INSERT INTO ticket_blacklist (guild_id, user_id, reason, added_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (guild_id, user_id)
     DO UPDATE SET reason = EXCLUDED.reason, added_by = EXCLUDED.added_by, created_at = NOW()`,
    [guildId, userId, reason, addedBy]
  );
}

async function unblacklistUser(guildId, userId) {
  await pool.query(`DELETE FROM ticket_blacklist WHERE guild_id = $1 AND user_id = $2`, [guildId, userId]);
}

async function getBlacklistEntry(guildId, userId) {
  const { rows } = await pool.query(
    `SELECT * FROM ticket_blacklist WHERE guild_id = $1 AND user_id = $2 LIMIT 1`,
    [guildId, userId]
  );
  return rows[0] || null;
}

async function addWarning(guildId, userId, reason, addedBy) {
  const { rows } = await pool.query(
    `INSERT INTO ticket_warnings (guild_id, user_id, reason, added_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [guildId, userId, reason, addedBy]
  );
  return rows[0];
}

async function getWarnings(guildId, userId) {
  const { rows } = await pool.query(
    `SELECT * FROM ticket_warnings WHERE guild_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 20`,
    [guildId, userId]
  );
  return rows;
}

async function getTicketHistory(guildId, ownerId, limit = 10) {
  const { rows } = await pool.query(
    `SELECT * FROM tickets WHERE guild_id = $1 AND owner_id = $2 ORDER BY created_at DESC LIMIT $3`,
    [guildId, ownerId, limit]
  );
  return rows;
}

async function getGuildStats(guildId) {
  const { rows } = await pool.query(
    `SELECT ticket_type, status, COUNT(*)::int AS count
     FROM tickets WHERE guild_id = $1
     GROUP BY ticket_type, status`,
    [guildId]
  );
  return rows;
}

async function getRecentClosedRobberyForGroup(guildId, groupName) {
  const { rows } = await pool.query(
    `SELECT * FROM tickets
     WHERE guild_id = $1
       AND ticket_type = 'robbery'
       AND status = 'closed'
       AND LOWER(TRIM(group_name)) = LOWER(TRIM($2))
     ORDER BY closed_at DESC NULLS LAST
     LIMIT 1`,
    [guildId, groupName]
  );
  return rows[0] || null;
}

async function getTicketsForEscalation(minutes) {
  const { rows } = await pool.query(
    `SELECT * FROM tickets
     WHERE status = 'open'
       AND claimed_by IS NULL
       AND escalated_at IS NULL
       AND created_at <= NOW() - ($1::text || ' minutes')::interval`,
    [String(minutes)]
  );
  return rows;
}

async function markEscalated(ticketId) {
  await pool.query(`UPDATE tickets SET escalated_at = NOW() WHERE id = $1`, [ticketId]);
}

module.exports = {
  pool,
  initDb,
  createTicket,
  getTicketByChannel,
  getOpenTicketForUser,
  claimTicket,
  unclaimTicket,
  closeTicket,
  addTicketMember,
  removeTicketMember,
  countOpenRobberyTickets,
  getOpenRobberyTicketForUser,
  setRobberyDeadline,
  markRobberyArrived,
  getExpiredRobberyTickets,
  getOpenRobberyTicketForGroup,
  acceptRobbery,
  refuseRobbery,
  getRobberiesNeedingReminders,
  markReminderSent,
  transferTicket,
  addTicketNote,
  getTicketNotes,
  blacklistUser,
  unblacklistUser,
  getBlacklistEntry,
  addWarning,
  getWarnings,
  getTicketHistory,
  getGuildStats,
  getRecentClosedRobberyForGroup,
  getTicketsForEscalation,
  markEscalated
};
