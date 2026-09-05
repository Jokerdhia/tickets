function csv(value) {
  return (value || "")
    .split(",")
    .map(v => v.trim())
    .filter(Boolean);
}

const ticketTypes = {
  racer: {
    key: "racer",
    label: "Speed Hunters",
    emoji: "🏎️",
    description: "Demande liée aux racers ou à la Speed Unit",
    categoryId: process.env.CATEGORY_RACER_ID,
    staffRoleIds: csv(process.env.ROLE_RACER_IDS),
    accessRoleIds: csv(process.env.ROLE_RACER_ACCESS_IDS)
  },
  police: {
    key: "police",
    label: "Police / HMPD",
    emoji: "🚓",
    description: "Demande interne liée à la police",
    categoryId: process.env.CATEGORY_POLICE_ID,
    staffRoleIds: csv(process.env.ROLE_POLICE_IDS),
    accessRoleIds: csv(process.env.ROLE_POLICE_ACCESS_IDS)
  },
  complaint: {
    key: "complaint",
    label: "Réclamation Police",
    emoji: "⚠️",
    description: "Réclamation d'un citoyen concernant la police",
    categoryId: process.env.CATEGORY_COMPLAINT_ID,
    staffRoleIds: csv(process.env.ROLE_COMPLAINT_IDS),
    accessRoleIds: csv(process.env.ROLE_COMPLAINT_ACCESS_IDS)
  }
};

const robberies = {
  bobcat: {
    key: "bobcat",
    label: "Bobcat",
    emoji: "🏗️",
    maxOpen: 3,
    maxCriminals: 4
  },
  train: {
    key: "train",
    label: "Train",
    emoji: "🚂",
    maxOpen: 2,
    maxCriminals: 6
  },
  yacht: {
    key: "yacht",
    label: "Yacht",
    emoji: "🛥️",
    maxOpen: 2,
    maxCriminals: 6
  },
  labo: {
    key: "labo",
    label: "Labo",
    emoji: "🧪",
    maxOpen: 2,
    maxCriminals: 6
  },
  central_bank: {
    key: "central_bank",
    label: "Pacific Bank",
    emoji: "🏛️",
    maxOpen: 2,
    maxCriminals: 8
  },
  cargo: {
    key: "cargo",
    label: "Cargo",
    emoji: "✈️",
    maxOpen: 2,
    maxCriminals: 12
  },
  submarine: {
    key: "submarine",
    label: "Submarine",
    emoji: "🌊",
    maxOpen: 1,
    maxCriminals: 15
  }
};

const robberyConfig = {
  illegalRoleId: process.env.ROLE_ILLEGAL_ID || "",
  categoryId: process.env.CATEGORY_ROBBERY_ID || "",
  staffRoleIds: csv(process.env.ROLE_ROBBERY_STAFF_IDS),
  robberies
};

module.exports = {
  ticketTypes,
  panelAdminRoleIds: csv(process.env.PANEL_ADMIN_ROLE_IDS),
  logChannelId: process.env.TICKET_LOG_CHANNEL_ID,
  robberyConfig
};
