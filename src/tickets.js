const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

const {
  ticketTypes,
  logChannelId,
  robberyConfig
} = require("./config");

const db = require("./db");
const { buildTranscript } = require("./transcript");

function safeName(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "user";
}

function ticketControls(claimedBy = null) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_claim")
        .setLabel(claimedBy ? "Déjà pris" : "Prendre")
        .setEmoji("🙋")
        .setStyle(ButtonStyle.Success)
        .setDisabled(Boolean(claimedBy)),
      new ButtonBuilder()
        .setCustomId("ticket_unclaim")
        .setLabel("Libérer")
        .setEmoji("↩️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!claimedBy),
      new ButtonBuilder()
        .setCustomId("ticket_add_member")
        .setLabel("Ajouter membre")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("ticket_remove_member")
        .setLabel("Retirer membre")
        .setEmoji("➖")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("Fermer")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

function memberHasAnyRole(member, roleIds) {
  if (!member || !roleIds.length) return false;
  return roleIds.some(id => member.roles.cache.has(id));
}

function canManageTicket(member, ticket) {
  const roleIds = ticket.ticket_type === "robbery"
    ? robberyConfig.staffRoleIds
    : (ticketTypes[ticket.ticket_type]?.staffRoleIds || []);

  return Boolean(
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    memberHasAnyRole(member, roleIds)
  );
}

function canCloseTicket(member, ticket) {
  return member.id === ticket.owner_id || canManageTicket(member, ticket);
}

async function updateControlMessage(channel, claimedBy) {
  const messages = await channel.messages.fetch({ limit: 30 });
  const controlMessage = messages.find(m =>
    m.author.id === channel.client.user.id &&
    m.components.some(row =>
      row.components.some(c => c.customId === "ticket_claim")
    )
  );

  if (controlMessage) {
    await controlMessage.edit({ components: ticketControls(claimedBy) }).catch(() => {});
  }
}


function robberySelectMenu() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("robbery_select")
    .setPlaceholder("Choisis l'opération à demander")
    .setMinValues(1)
    .setMaxValues(1);

  for (const robbery of Object.values(robberyConfig.robberies)) {
    menu.addOptions({
      label: robbery.label,
      value: robbery.key,
      emoji: robbery.emoji,
      description: `Maximum ${robbery.maxOpen} demande(s) ouverte(s)`
    });
  }

  return new ActionRowBuilder().addComponents(menu);
}

async function showRobberyMenu(interaction) {
  if (!robberyConfig.illegalRoleId) {
    return interaction.reply({
      content: "❌ ROLE_ILLEGAL_ID n'est pas configuré.",
      ephemeral: true
    });
  }

  if (!interaction.member.roles.cache.has(robberyConfig.illegalRoleId)) {
    return interaction.reply({
      content: "❌ Ce menu est réservé aux membres ayant le rôle **Illegal**.",
      ephemeral: true
    });
  }

  const lines = [];
  for (const robbery of Object.values(robberyConfig.robberies)) {
    const current = await db.countOpenRobberyTickets(interaction.guildId, robbery.key);
    const icon = current >= robbery.maxOpen ? "🔴" : current === 0 ? "🟢" : "🟠";
    lines.push(`${icon} **${robbery.label}** — ${current}/${robbery.maxOpen}`);
  }

  const embed = new EmbedBuilder()
    .setTitle("🔫 Demande de braquage")
    .setDescription([
      "Choisis l'opération que tu veux demander.",
      "",
      ...lines,
      "",
      "🔴 = complet • 🟠 = places restantes • 🟢 = disponible"
    ].join("\n"))
    .setFooter({ text: "HMPD • Illegal Operations" })
    .setTimestamp();

  return interaction.reply({
    embeds: [embed],
    components: [robberySelectMenu()],
    ephemeral: true
  });
}

async function createRobberyTicket(interaction, robberyKey) {
  const robbery = robberyConfig.robberies[robberyKey];

  if (!robbery) {
    return interaction.reply({ content: "❌ Opération inconnue.", ephemeral: true });
  }

  if (!robberyConfig.illegalRoleId || !interaction.member.roles.cache.has(robberyConfig.illegalRoleId)) {
    return interaction.reply({
      content: "❌ Tu dois avoir le rôle **Illegal** pour ouvrir une demande de braquage.",
      ephemeral: true
    });
  }

  if (!robberyConfig.categoryId) {
    return interaction.reply({
      content: "❌ CATEGORY_ROBBERY_ID n'est pas configuré.",
      ephemeral: true
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const existingUserTicket = await db.getOpenRobberyTicketForUser(
    interaction.guildId,
    interaction.user.id
  );

  if (existingUserTicket) {
    const existingChannel = interaction.guild.channels.cache.get(existingUserTicket.channel_id);
    if (existingChannel) {
      return interaction.editReply(
        `❌ Tu as déjà une demande de braquage ouverte : ${existingChannel}`
      );
    }
    await db.closeTicket(existingUserTicket.id, interaction.client.user.id, "Salon Discord introuvable.");
  }

  // Recompte juste avant création pour éviter de dépasser le quota.
  const currentOpen = await db.countOpenRobberyTickets(interaction.guildId, robbery.key);

  if (currentOpen >= robbery.maxOpen) {
    return interaction.editReply(
      `❌ **${robbery.label} est actuellement complet.**\n` +
      `Il y a déjà **${currentOpen}/${robbery.maxOpen}** demandes en cours.\n` +
      `Choisis une autre opération.`
    );
  }

  const overwrites = [
    {
      id: interaction.guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    },
    {
      id: interaction.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    }
  ];

  for (const roleId of robberyConfig.staffRoleIds) {
    overwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    });
  }

  const channel = await interaction.guild.channels.create({
    name: `braquage-${robbery.key}-${safeName(interaction.user.username)}`.slice(0, 90),
    type: ChannelType.GuildText,
    parent: robberyConfig.categoryId,
    topic: `HMPD Robbery | owner=${interaction.user.id} | robbery=${robbery.key}`,
    permissionOverwrites: overwrites
  });

  let ticket;
  try {
    ticket = await db.createTicket({
      guildId: interaction.guildId,
      channelId: channel.id,
      ownerId: interaction.user.id,
      ticketType: "robbery",
      robberyType: robbery.key
    });
  } catch (error) {
    await channel.delete("Erreur création ticket braquage en DB").catch(() => {});
    throw error;
  }

  const staffMentions = robberyConfig.staffRoleIds.map(id => `<@&${id}>`).join(" ");

  const embed = new EmbedBuilder()
    .setTitle(`${robbery.emoji} Braquage #${ticket.id} — ${robbery.label}`)
    .setDescription([
      `Demande créée par ${interaction.user}.`,
      "",
      "Merci d'indiquer :",
      "• le nombre de criminels ;",
      "• les membres participants ;",
      "• l'heure prévue ;",
      "• toute information utile.",
      "",
      "**Statut :** 🟢 Ouvert",
      "**Staff :** Non assigné"
    ].join("\n"))
    .addFields(
      { name: "Opération", value: robbery.label, inline: true },
      { name: "Capacité", value: `${currentOpen + 1}/${robbery.maxOpen}`, inline: true },
      { name: "Ticket", value: `#${ticket.id}`, inline: true }
    )
    .setFooter({ text: "HMPD • Illegal Operations" })
    .setTimestamp();

  await channel.send({
    content: `${interaction.user}${staffMentions ? ` ${staffMentions}` : ""}`,
    embeds: [embed],
    components: ticketControls()
  });

  await interaction.editReply(
    `✅ Ta demande **${robbery.label}** a été créée : ${channel}\n` +
    `Occupation actuelle : **${currentOpen + 1}/${robbery.maxOpen}**`
  );
}

function createPanelEmbed() {
  return new EmbedBuilder()
    .setTitle("🎫 HMPD SUPPORT")
    .setDescription(
      [
        "Besoin d'aide ? Sélectionne le type de ticket correspondant à ta demande.",
        "",
        "🔫 **Braquage / Illegal** — Demander une opération",
        "🛠️ **Support** — Aide générale",
        "🚓 **Police / HMPD** — Demande liée à la police",
        "⚠️ **Réclamation** — Signaler une situation",
        "🐛 **Bug** — Problème technique",
        "🛡️ **Administration** — Demande administrative",
        "",
        "Un salon privé sera créé automatiquement."
      ].join("\n")
    )
    .setFooter({ text: "HMPD • Système de tickets" })
    .setTimestamp();
}

function createPanelRows() {
  const types = Object.values(ticketTypes);
  const first = new ActionRowBuilder();
  const second = new ActionRowBuilder();

  types.forEach((type, index) => {
    const button = new ButtonBuilder()
      .setCustomId(`ticket_create:${type.key}`)
      .setLabel(type.label)
      .setEmoji(type.emoji)
      .setStyle(index === 2 ? ButtonStyle.Danger : ButtonStyle.Primary);

    if (index < 3) first.addComponents(button);
    else second.addComponents(button);
  });

  const robberyRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_robbery")
      .setLabel("Demande de braquage")
      .setEmoji("🔫")
      .setStyle(ButtonStyle.Danger)
  );

  return [robberyRow, first, second];
}

async function createTicket(interaction, typeKey) {
  const type = ticketTypes[typeKey];

  if (!type) {
    return interaction.reply({ content: "❌ Type de ticket inconnu.", ephemeral: true });
  }

  if (!type.categoryId) {
    return interaction.reply({
      content: `❌ La catégorie Discord pour **${type.label}** n'est pas configurée.`,
      ephemeral: true
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const existing = await db.getOpenTicketForUser(
    interaction.guildId,
    interaction.user.id,
    typeKey
  );

  if (existing) {
    const existingChannel = interaction.guild.channels.cache.get(existing.channel_id);
    if (existingChannel) {
      return interaction.editReply(
        `❌ Tu as déjà un ticket **${type.label}** ouvert : ${existingChannel}`
      );
    }

    await db.closeTicket(existing.id, interaction.client.user.id, "Salon Discord introuvable.");
  }

  const overwrites = [
    {
      id: interaction.guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    },
    {
      id: interaction.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    }
  ];

  for (const roleId of type.staffRoleIds) {
    overwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    });
  }

  const channel = await interaction.guild.channels.create({
    name: `${type.key}-${safeName(interaction.user.username)}`,
    type: ChannelType.GuildText,
    parent: type.categoryId,
    topic: `HMPD Ticket | owner=${interaction.user.id} | type=${type.key}`,
    permissionOverwrites: overwrites
  });

  let ticket;
  try {
    ticket = await db.createTicket({
      guildId: interaction.guildId,
      channelId: channel.id,
      ownerId: interaction.user.id,
      ticketType: type.key
    });
  } catch (error) {
    await channel.delete("Erreur création ticket DB").catch(() => {});
    throw error;
  }

  const staffMentions = type.staffRoleIds.map(id => `<@&${id}>`).join(" ");

  const embed = new EmbedBuilder()
    .setTitle(`${type.emoji} Ticket #${ticket.id} — ${type.label}`)
    .setDescription(
      [
        `Bienvenue ${interaction.user}.`,
        "",
        "Explique ta demande avec le maximum de détails.",
        "Un membre du staff pourra prendre en charge ton ticket.",
        "",
        `**Statut :** 🟢 Ouvert`,
        `**Staff :** Non assigné`
      ].join("\n")
    )
    .addFields(
      { name: "Créé par", value: `${interaction.user}`, inline: true },
      { name: "Type", value: type.label, inline: true },
      { name: "Ticket", value: `#${ticket.id}`, inline: true }
    )
    .setFooter({ text: "HMPD • Ticket System" })
    .setTimestamp();

  await channel.send({
    content: `${interaction.user}${staffMentions ? ` ${staffMentions}` : ""}`,
    embeds: [embed],
    components: ticketControls()
  });

  await interaction.editReply(`✅ Ton ticket a été créé : ${channel}`);
}

async function claimTicket(interaction, ticket) {
  if (!canManageTicket(interaction.member, ticket)) {
    return interaction.reply({
      content: "❌ Tu n'as pas la permission de prendre ce ticket.",
      ephemeral: true
    });
  }

  if (ticket.claimed_by) {
    return interaction.reply({
      content: `❌ Ce ticket est déjà pris par <@${ticket.claimed_by}>.`,
      ephemeral: true
    });
  }

  const updated = await db.claimTicket(ticket.id, interaction.user.id);
  await updateControlMessage(interaction.channel, updated.claimed_by);

  const embed = new EmbedBuilder()
    .setDescription(`🙋 Ticket pris en charge par ${interaction.user}.`)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function unclaimTicket(interaction, ticket) {
  if (!canManageTicket(interaction.member, ticket)) {
    return interaction.reply({
      content: "❌ Tu n'as pas la permission de libérer ce ticket.",
      ephemeral: true
    });
  }

  if (!ticket.claimed_by) {
    return interaction.reply({
      content: "❌ Ce ticket n'est actuellement assigné à personne.",
      ephemeral: true
    });
  }

  if (
    ticket.claimed_by !== interaction.user.id &&
    !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
  ) {
    return interaction.reply({
      content: `❌ Ce ticket est pris par <@${ticket.claimed_by}>.`,
      ephemeral: true
    });
  }

  await db.unclaimTicket(ticket.id);
  await updateControlMessage(interaction.channel, null);
  await interaction.reply(`↩️ ${interaction.user} a libéré le ticket.`);
}

function memberModal(action) {
  const isAdd = action === "add";
  const modal = new ModalBuilder()
    .setCustomId(`ticket_member_modal:${action}`)
    .setTitle(isAdd ? "Ajouter un membre" : "Retirer un membre");

  const input = new TextInputBuilder()
    .setCustomId("user_id")
    .setLabel("ID Discord de l'utilisateur")
    .setPlaceholder("123456789012345678")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function closeModal() {
  const modal = new ModalBuilder()
    .setCustomId("ticket_close_modal")
    .setTitle("Fermer le ticket");

  const reason = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("Motif de fermeture")
    .setPlaceholder("Exemple : problème résolu")
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(2)
    .setMaxLength(500)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(reason));
  return modal;
}

async function handleMemberModal(interaction, action, ticket) {
  if (!canManageTicket(interaction.member, ticket)) {
    return interaction.reply({
      content: "❌ Tu n'as pas la permission de gérer les membres du ticket.",
      ephemeral: true
    });
  }

  const userId = interaction.fields.getTextInputValue("user_id").trim();

  if (!/^\d{15,22}$/.test(userId)) {
    return interaction.reply({ content: "❌ ID Discord invalide.", ephemeral: true });
  }

  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  if (!member) {
    return interaction.reply({
      content: "❌ Cet utilisateur n'est pas présent sur le serveur.",
      ephemeral: true
    });
  }

  if (action === "add") {
    await interaction.channel.permissionOverwrites.edit(userId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
      EmbedLinks: true
    });
    await db.addTicketMember(ticket.id, userId, interaction.user.id);
    return interaction.reply(`➕ ${member} a été ajouté au ticket.`);
  }

  if (userId === ticket.owner_id) {
    return interaction.reply({
      content: "❌ Tu ne peux pas retirer le propriétaire du ticket.",
      ephemeral: true
    });
  }

  await interaction.channel.permissionOverwrites.delete(userId).catch(() => {});
  await db.removeTicketMember(ticket.id, userId);
  return interaction.reply(`➖ ${member} a été retiré du ticket.`);
}

async function executeClose(interaction, ticket, reason) {
  if (!canCloseTicket(interaction.member, ticket)) {
    return interaction.reply({
      content: "❌ Tu n'as pas la permission de fermer ce ticket.",
      ephemeral: true
    });
  }

  await interaction.deferReply();

  const transcript = await buildTranscript(interaction.channel, ticket).catch(error => {
    console.error("Erreur transcript:", error);
    return null;
  });

  const closed = await db.closeTicket(ticket.id, interaction.user.id, reason);
  if (!closed) {
    return interaction.editReply("❌ Ce ticket est déjà fermé.");
  }

  const logChannel = logChannelId
    ? interaction.guild.channels.cache.get(logChannelId)
    : null;

  if (logChannel?.isTextBased()) {
    const logEmbed = new EmbedBuilder()
      .setTitle(`🔒 Ticket #${ticket.id} fermé`)
      .addFields(
        { name: "Propriétaire", value: `<@${ticket.owner_id}>`, inline: true },
        { name: "Type", value: ticket.ticket_type === "robbery"
          ? `Braquage — ${robberyConfig.robberies[ticket.robbery_type]?.label || ticket.robbery_type}`
          : (ticketTypes[ticket.ticket_type]?.label || ticket.ticket_type), inline: true },
        { name: "Fermé par", value: `${interaction.user}`, inline: true },
        { name: "Pris par", value: ticket.claimed_by ? `<@${ticket.claimed_by}>` : "Non assigné", inline: true },
        { name: "Salon", value: `#${interaction.channel.name}`, inline: true },
        { name: "Motif", value: reason.slice(0, 1024) }
      )
      .setTimestamp();

    const payload = { embeds: [logEmbed] };
    if (transcript) payload.files = [transcript];

    await logChannel.send(payload).catch(error => {
      console.error("Erreur envoi logs:", error);
    });
  }

  await interaction.editReply("🔒 Ticket fermé. Suppression du salon...");
  setTimeout(() => {
    interaction.channel.delete(`Ticket fermé par ${interaction.user.tag}: ${reason}`).catch(console.error);
  }, 2500);
}

async function getCurrentTicket(interaction) {
  if (!interaction.channelId) return null;
  return db.getTicketByChannel(interaction.channelId);
}

module.exports = {
  createPanelEmbed,
  createPanelRows,
  createTicket,
  claimTicket,
  unclaimTicket,
  memberModal,
  closeModal,
  handleMemberModal,
  executeClose,
  getCurrentTicket,
  canManageTicket,
  canCloseTicket,
  ticketControls,
  showRobberyMenu,
  createRobberyTicket
};
