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
      status TEXT NOT NULL DEFAULT 'open',
      claimed_by TEXT,
      close_reason TEXT,
      closed_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      claimed_at TIMESTAMPTZ,
      closed_at TIMESTAMPTZ
    );
  `);

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

  console.log("✅ Base Neon PostgreSQL prête.");
}

async function createTicket({ guildId, channelId, ownerId, ticketType }) {
  const { rows } = await pool.query(
    `INSERT INTO tickets (guild_id, channel_id, owner_id, ticket_type)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [guildId, channelId, ownerId, ticketType]
  );
  return rows[0];
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
  removeTicketMember
};
