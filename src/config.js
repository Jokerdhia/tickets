function csv(value) {
  return (value || "")
    .split(",")
    .map(v => v.trim())
    .filter(Boolean);
}

const ticketTypes = {
  support: {
    key: "support",
    label: "Support",
    emoji: "🛠️",
    description: "Aide générale ou problème avec le serveur",
    categoryId: process.env.CATEGORY_SUPPORT_ID,
    staffRoleIds: csv(process.env.ROLE_SUPPORT_IDS)
  },
  police: {
    key: "police",
    label: "Police / HMPD",
    emoji: "🚓",
    description: "Demande liée à la police ou au HMPD",
    categoryId: process.env.CATEGORY_POLICE_ID,
    staffRoleIds: csv(process.env.ROLE_POLICE_IDS)
  },
  complaint: {
    key: "complaint",
    label: "Réclamation",
    emoji: "⚠️",
    description: "Réclamation concernant une situation ou un membre",
    categoryId: process.env.CATEGORY_COMPLAINT_ID,
    staffRoleIds: csv(process.env.ROLE_COMPLAINT_IDS)
  },
  bug: {
    key: "bug",
    label: "Bug",
    emoji: "🐛",
    description: "Signaler un bug ou un problème technique",
    categoryId: process.env.CATEGORY_BUG_ID,
    staffRoleIds: csv(process.env.ROLE_BUG_IDS)
  },
  admin: {
    key: "admin",
    label: "Administration",
    emoji: "🛡️",
    description: "Demande nécessitant l'administration",
    categoryId: process.env.CATEGORY_ADMIN_ID,
    staffRoleIds: csv(process.env.ROLE_ADMIN_IDS)
  }
};

module.exports = {
  ticketTypes,
  panelAdminRoleIds: csv(process.env.PANEL_ADMIN_ROLE_IDS),
  logChannelId: process.env.TICKET_LOG_CHANNEL_ID
};
