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
  robberyConfig,
  robberyCooldownMinutes,
  robberyOperationCooldownMinutes,
  robberyHistoryChannelId,
  robberyCooldownChannelId,
  supervisorRoleIds
} = require("./config");

const db = require("./db");
const { buildTranscript } = require("./transcript");

async function logTimeline(ticket, action, actorId = null, details = null) {
  if (!ticket?.id) return;
  await db.addTimelineEvent(ticket.id, action, actorId, details).catch(() => {});
}

function requesterMention(ticket) {
  return ticket?.owner_id ? `<@${ticket.owner_id}>` : "";
}

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

function ticketControls(claimedBy = null, ticketType = null, arrived = false, decision = "pending", arrivalRequested = false) {
  if (ticketType !== "robbery") {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket_claim").setLabel(claimedBy ? "Claimed" : "Claim").setEmoji("🙋").setStyle(ButtonStyle.Success).setDisabled(Boolean(claimedBy)),
        new ButtonBuilder().setCustomId("ticket_unclaim").setLabel("Release").setEmoji("↩️").setStyle(ButtonStyle.Secondary).setDisabled(!claimedBy),
        new ButtonBuilder().setCustomId("ticket_transfer").setLabel("Transfer").setEmoji("🔁").setStyle(ButtonStyle.Primary).setDisabled(!claimedBy),
        new ButtonBuilder().setCustomId("ticket_note").setLabel("Add Note").setEmoji("📝").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("ticket_close").setLabel("Close").setEmoji("🔒").setStyle(ButtonStyle.Danger)
      )
    ];
  }

  const accepted = decision === "accepted";
  const refused = decision === "refused";

  // V8.7 UX:
  // Discord cannot disable a button for one role while keeping it active for another on the same message.
  // So buttons are disabled according to WORKFLOW STATE, and labels clearly show who is allowed to use them.
  // Permission checks remain enforced server-side on every click.

  // Final / rejected state.
  if (arrived || refused) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("robbery_accept")
          .setLabel("STAFF • Approve")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("robbery_request_arrival")
          .setLabel("REQUESTER • Request Arrival")
          .setEmoji("📍")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("robbery_confirm_arrival")
          .setLabel("STAFF • Confirm Arrival")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("robbery_reject_arrival")
          .setLabel("STAFF • Reject Arrival")
          .setEmoji("❌")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ticket_close")
          .setLabel("Close")
          .setEmoji("🔒")
          .setStyle(ButtonStyle.Danger)
      )
    ];
  }

  // Step 1: waiting for staff claim.
  if (!claimedBy) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ticket_claim")
          .setLabel("STAFF • Claim")
          .setEmoji("🙋")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("robbery_accept")
          .setLabel("STAFF • Approve")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("robbery_request_arrival")
          .setLabel("REQUESTER • Request Arrival")
          .setEmoji("📍")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("robbery_confirm_arrival")
          .setLabel("STAFF • Confirm Arrival")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("robbery_reject_arrival")
          .setLabel("STAFF • Reject Arrival")
          .setEmoji("❌")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("ticket_close")
          .setLabel("Close")
          .setEmoji("🔒")
          .setStyle(ButtonStyle.Secondary)
      )
    ];
  }

  // Step 2: police review.
  if (decision === "pending") {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ticket_unclaim")
          .setLabel("STAFF • Release")
          .setEmoji("↩️")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("robbery_accept")
          .setLabel("STAFF • Approve")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("robbery_refuse")
          .setLabel("STAFF • Reject")
          .setEmoji("❌")
          .setStyle(ButtonStyle.Danger)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("robbery_request_arrival")
          .setLabel("REQUESTER • Request Arrival")
          .setEmoji("📍")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("robbery_confirm_arrival")
          .setLabel("STAFF • Confirm Arrival")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("robbery_reject_arrival")
          .setLabel("STAFF • Reject Arrival")
          .setEmoji("❌")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ticket_transfer")
          .setLabel("STAFF • Transfer")
          .setEmoji("🔁")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("ticket_note")
          .setLabel("STAFF • Add Note")
          .setEmoji("📝")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("ticket_takeover")
          .setLabel("HIGH GRADE • Take Over")
          .setEmoji("🛡️")
          .setStyle(ButtonStyle.Secondary)
      )
    ];
  }

  // Step 3: approved - requester action is active, police confirmation stays grey.
  if (accepted && !arrivalRequested) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("robbery_request_arrival")
          .setLabel("REQUESTER • Request Arrival")
          .setEmoji("📍")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("robbery_confirm_arrival")
          .setLabel("STAFF • Confirm Arrival")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("robbery_reject_arrival")
          .setLabel("STAFF • Reject Arrival")
          .setEmoji("❌")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ticket_transfer")
          .setLabel("STAFF • Transfer")
          .setEmoji("🔁")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("ticket_note")
          .setLabel("STAFF • Add Note")
          .setEmoji("📝")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("ticket_takeover")
          .setLabel("HIGH GRADE • Take Over")
          .setEmoji("🛡️")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("ticket_close")
          .setLabel("Close")
          .setEmoji("🔒")
          .setStyle(ButtonStyle.Secondary)
      )
    ];
  }

  // Step 4: requester has requested verification.
  // Request Arrival becomes grey; police Confirm/Reject become active.
  if (accepted && arrivalRequested) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("robbery_request_arrival")
          .setLabel("REQUESTER • Arrival Requested")
          .setEmoji("📍")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("robbery_confirm_arrival")
          .setLabel("STAFF • Confirm Arrival")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("robbery_reject_arrival")
          .setLabel("STAFF • Reject Arrival")
          .setEmoji("❌")
          .setStyle(ButtonStyle.Danger)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ticket_transfer")
          .setLabel("STAFF • Transfer")
          .setEmoji("🔁")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("ticket_note")
          .setLabel("STAFF • Add Note")
          .setEmoji("📝")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("ticket_takeover")
          .setLabel("HIGH GRADE • Take Over")
          .setEmoji("🛡️")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("ticket_close")
          .setLabel("Close")
          .setEmoji("🔒")
          .setStyle(ButtonStyle.Secondary)
      )
    ];
  }

  return [];
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

function canSuperviseTicket(member) {
  return Boolean(
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    supervisorRoleIds.some(id => member.roles.cache.has(id))
  );
}

function canCloseTicket(member, ticket) {
  return member.id === ticket.owner_id || canManageTicket(member, ticket);
}

async function renameTicketChannelForStage(channel, ticketType, claimedBy, arrived, decision, arrivalRequested, ticketCode = null) {
  if (ticketType !== "robbery") return;

  let prefix = "wait";
  if (arrived) prefix = "done";
  else if (decision === "refused") prefix = "rejected";
  else if (!claimedBy) prefix = "wait";
  else if (decision === "pending") prefix = "review";
  else if (decision === "accepted" && !arrivalRequested) prefix = "travel";
  else if (decision === "accepted" && arrivalRequested) prefix = "verify";

  const base = (ticketCode || channel.name || "robbery")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);

  const name = `${prefix}-${base}`.slice(0, 95);
  if (channel.name !== name) {
    await channel.setName(name, "HMPD ticket stage update").catch(() => {});
  }
}

async function updateControlMessage(channel, claimedBy, ticketType = null, arrived = false, decision = "pending", arrivalRequested = false, ticketCode = null, sendStageMessage = true) {
  await renameTicketChannelForStage(channel, ticketType, claimedBy, arrived, decision, arrivalRequested, ticketCode);

  const messages = await channel.messages.fetch({ limit: 50 });

  const controlMessages = messages.filter(m =>
    m.author.id === channel.client.user.id &&
    m.components.some(row => row.components.length > 0)
  );

  // For normal tickets, keep the existing compact behavior.
  if (ticketType !== "robbery") {
    const controlMessage = controlMessages.find(m =>
      m.components.some(row => row.components.some(c => c.customId === "ticket_claim"))
    );
    if (controlMessage) {
      await controlMessage.edit({
        components: ticketControls(claimedBy, ticketType, arrived, decision, arrivalRequested)
      }).catch(() => {});
    }
    return;
  }

  // Remove buttons from previous robbery stage messages.
  for (const message of controlMessages.values()) {
    const hasTicketControl = message.components.some(row =>
      row.components.some(c =>
        c.customId && (
          c.customId.startsWith("ticket_") ||
          c.customId.startsWith("robbery_")
        )
      )
    );
    if (hasTicketControl) {
      await message.edit({ components: [] }).catch(() => {});
    }
  }

  // During a normal interaction, the next-step buttons are attached directly
  // to the action embed (Claim / Approved / Arrival Requested / Ready).
  // Recovery after a Render restart can still ask this function to recreate
  // a standalone workflow message.
  if (!sendStageMessage) return;

  let title = "🎫 Robbery Workflow";
  let description = "Follow the current step below.";

  if (arrived) {
    title = "🏁 Operation Finished";
    description = [
      "✅ Arrival has been confirmed by HMPD.",
      "",
      "The robbery workflow is complete.",
      "Use **Close** when the operation/ticket is finished."
    ].join("\n");
  } else if (decision === "refused") {
    title = "❌ Robbery Rejected";
    description = "The request has been rejected. The only remaining action is **Close**.";
  } else if (!claimedBy) {
    title = "🟡 Step 1 • Waiting for Staff";
    description = "A staff member must use **Claim** before the request can be reviewed.";
  } else if (decision === "pending") {
    title = "👮 Step 2 • Police Review";
    description = [
      "The ticket has been claimed.",
      "",
      "HMPD must now choose **Approve** or **Reject**."
    ].join("\n");
  } else if (decision === "accepted" && !arrivalRequested) {
    title = "⏱️ Step 3 • Travel to Robbery";
    description = [
      "✅ The robbery is approved.",
      "",
      "All criminals must reach the location within **30 minutes**.",
      "When everybody is on site, the requester uses **Request Arrival**."
    ].join("\n");
  } else if (decision === "accepted" && arrivalRequested) {
    title = "📍 Step 4 • Arrival Verification";
    description = [
      "The requester says everyone is on site.",
      "",
      "HMPD must use **Confirm Arrival** or **Reject Arrival**.",
      "Rejecting does not reset the 30-minute timer."
    ].join("\n");
  }

  const stageEmbed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "HMPD • Robbery Workflow" })
    .setTimestamp();

  try {
    await channel.send({
      embeds: [stageEmbed],
      components: ticketControls(claimedBy, ticketType, arrived, decision, arrivalRequested)
    });
  } catch (error) {
    console.error("Erreur envoi boutons workflow robbery:", error);
    throw error;
  }
}

async function ensureTicketControls(channel, ticket) {
  if (!channel?.isTextBased() || ticket.ticket_type !== "robbery") return;

  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!messages) return;

  const hasActiveControls = messages.some(m =>
    m.author.id === channel.client.user.id &&
    m.components.some(row => row.components.some(c => c.customId))
  );

  if (!hasActiveControls) {
    await updateControlMessage(
      channel,
      ticket.claimed_by,
      "robbery",
      Boolean(ticket.robbery_arrived_at),
      ticket.robbery_decision || "pending",
      Boolean(ticket.arrival_requested_at),
      ticket.ticket_code
    );
  } else {
    await renameTicketChannelForStage(
      channel,
      "robbery",
      ticket.claimed_by,
      Boolean(ticket.robbery_arrived_at),
      ticket.robbery_decision || "pending",
      Boolean(ticket.arrival_requested_at),
      ticket.ticket_code
    );
  }
}

function robberySelectMenu() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("robbery_select")
    .setPlaceholder("Select robbery operation")
    .setMinValues(1)
    .setMaxValues(1);

  for (const robbery of Object.values(robberyConfig.robberies)) {
    menu.addOptions({
      label: robbery.label,
      value: robbery.key,
      emoji: robbery.emoji,
      description: `Slots: ${robbery.maxOpen} • Max players: ${robbery.maxCriminals ?? "N/A"}`
    });
  }

  return new ActionRowBuilder().addComponents(menu);
}

async function showRobberyMenu(interaction) {
  if (!robberyConfig.illegalRoleId) {
    return interaction.reply({ content: "❌ ROLE_ILLEGAL_ID n'est pas configuré.", ephemeral: true });
  }
  if (!interaction.member.roles.cache.has(robberyConfig.illegalRoleId)) {
    return interaction.reply({ content: "❌ هذا القسم مخصص فقط لأعضاء **Illegal**.", ephemeral: true });
  }

  await db.clearExpiredRobberyOperationCooldowns().catch(() => {});
  const rows = [];

  for (const robbery of Object.values(robberyConfig.robberies)) {
    const current = await db.countOpenRobberyTickets(interaction.guildId, robbery.key);
    const cooldown = await db.getRobberyOperationCooldown(interaction.guildId, robbery.key);
    let statusEmoji = "🟢";
    let statusText = "Available";

    if (cooldown) {
      const unix = Math.floor(new Date(cooldown.expires_at).getTime() / 1000);
      statusEmoji = "🔵";
      statusText = `Cooldown <t:${unix}:R>`;
    } else if (current >= robbery.maxOpen) {
      statusEmoji = "🔴";
      statusText = "Full";
    } else if (Math.max(0, robbery.maxOpen - current) === 1) {
      statusEmoji = "🟠";
      statusText = "Limited";
    }

    rows.push(`${statusEmoji} **${robbery.label}**\n> Slots: \`${current}/${robbery.maxOpen}\`  •  Max Players: \`${robbery.maxCriminals ?? "N/A"}\`  •  ${statusText}`);
  }

  const embed = new EmbedBuilder()
    .setTitle("🔫 Robbery Request Center")
    .setDescription([
      "اختر العملية التي ترغب في طلبها من القائمة بالأسفل.", "", ...rows, "",
      "**Status**",
      "🟢 Available   •   🟠 Limited   •   🔴 Full   •   🔵 Cooldown", "",
      "**قواعد الطلب**",
      "• عملية واحدة نشطة لكل Gang / Mafia.",
      `• كل نوع Braquage يدخل Cooldown لمدة **${robberyOperationCooldownMinutes} دقيقة** بعد تأكيد الوصول.`,
      "• يجب احترام الحد الأقصى لعدد المشاركين.",
      "• بعد الموافقة لديك **30 دقيقة** للوصول إلى الموقع.",
      "• صاحب الطلب يستخدم **Request Arrival** والشرطة تؤكد عبر **Confirm Arrival**."
    ].join("\n"))
    .setFooter({ text: "HMPD • Illegal Operations" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], components: [robberySelectMenu()], ephemeral: true });
  deleteEphemeralReplyAfter(interaction, 60_000);
}

function robberyRequestModal(robberyKey) {
  const robbery = robberyConfig.robberies[robberyKey];

  const modal = new ModalBuilder()
    .setCustomId(`robbery_request_modal:${robberyKey}`)
    .setTitle(`طلب — ${robbery?.label || "سطو"}`);

  const groupName = new TextInputBuilder()
    .setCustomId("group_name")
    .setLabel("اسم العصابة أو المافيا")
    .setPlaceholder("مثال: Los Santos Cartel")
    .setStyle(TextInputStyle.Short)
    .setMinLength(2)
    .setMaxLength(80)
    .setRequired(true);

  const criminalCount = new TextInputBuilder()
    .setCustomId("criminal_count")
    .setLabel("عدد المشاركين")
    .setPlaceholder("مثال: 4")
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(2)
    .setRequired(true);

  const guns = new TextInputBuilder()
    .setCustomId("guns")
    .setLabel("نوع / موديل السلاح")
    .setPlaceholder("مثال: AP Pistol, Micro SMG")
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(2)
    .setMaxLength(300)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(groupName),
    new ActionRowBuilder().addComponents(criminalCount),
    new ActionRowBuilder().addComponents(guns)
  );

  return modal;
}

async function createRobberyTicket(interaction, robberyKey, formData) {
  const blacklist = await db.getBlacklistEntry(interaction.guildId, interaction.user.id);
  if (blacklist) {
    return interaction.reply({
      content: `⛔ لا يمكنك فتح تذكرة حالياً. السبب: **${blacklist.reason}**`,
      ephemeral: true
    });
  }

  const robbery = robberyConfig.robberies[robberyKey];

  if (!robbery) {
    return interaction.reply({ content: "❌ العملية غير معروفة.", ephemeral: true });
  }

  const groupName = formData?.groupName?.trim();
  const criminalCountRaw = formData?.criminalCount?.trim();
  const guns = formData?.guns?.trim();
  const criminalCount = Number(criminalCountRaw);

  if (!groupName || !guns || !Number.isInteger(criminalCount) || criminalCount < 1 || criminalCount > 30) {
    return interaction.reply({
      content: "❌ البيانات غير صحيحة. يجب أن يكون عدد المشاركين بين 1 و30.",
      ephemeral: true
    });
  }

  if (robbery.maxCriminals && criminalCount > robbery.maxCriminals) {
    return interaction.reply({
      content: `❌ الحد الأقصى لعملية **${robbery.label}** هو **${robbery.maxCriminals}** مشارك. أنت أدخلت **${criminalCount}**.`,
      ephemeral: true
    });
  }

  if (!robberyConfig.illegalRoleId || !interaction.member.roles.cache.has(robberyConfig.illegalRoleId)) {
    return interaction.reply({
      content: "❌ يجب أن تكون لديك رتبة **Illegal** لفتح طلب سطو.",
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

  const existingGroupTicket = await db.getOpenRobberyTicketForGroup(interaction.guildId, groupName);
  if (existingGroupTicket) {
    const groupChannel = interaction.guild.channels.cache.get(existingGroupTicket.channel_id);
    if (groupChannel) {
      return interaction.editReply(
        `❌ العصابة / المافيا **${groupName}** لديها بالفعل عملية نشطة: ${groupChannel}\n` +
        "يجب إنهاء العملية الحالية قبل فتح طلب جديد."
      );
    }
  }

if (robberyCooldownMinutes > 0) {
  const previous = await db.getRecentClosedRobberyForGroup(interaction.guildId, groupName);
  if (previous?.closed_at) {
    const nextAllowed = new Date(previous.closed_at).getTime() + robberyCooldownMinutes * 60_000;
    if (Date.now() < nextAllowed) {
      const unix = Math.floor(nextAllowed / 1000);
      return interaction.editReply(
        `⏳ العصابة / المافيا **${groupName}** في فترة انتظار.\n` +
        `يمكن فتح عملية جديدة <t:${unix}:R>.`
      );
    }
  }
}

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
  const operationCooldown = await db.getRobberyOperationCooldown(interaction.guildId, robbery.key);
  if (operationCooldown) {
    const cooldownUnix = Math.floor(new Date(operationCooldown.expires_at).getTime() / 1000);
    return interaction.editReply(
      `🔵 **${robbery.label}** is currently on cooldown.\n` +
      `Available again <t:${cooldownUnix}:R>.`
    );
  }

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
      robberyType: robbery.key,
      groupName,
      criminalCount,
      guns
    });
  } catch (error) {
    await channel.delete("Erreur création ticket braquage en DB").catch(() => {});
    throw error;
  }

  const staffMentions = robberyConfig.staffRoleIds.map(id => `<@&${id}>`).join(" ");

  const embed = new EmbedBuilder()
    .setTitle(`${robbery.emoji} Robbery Request #${ticket.id} — ${robbery.label}`)
    .setDescription([
      `تم إنشاء الطلب بواسطة ${interaction.user}.`,
      "",
      "**Statut :** 🟢 Ouvert",
      "**Staff :** Non assigné"
    ].join("\n"))
    .addFields(
      { name: "العصابة / المافيا", value: groupName, inline: false },
      { name: "عدد المشاركين", value: String(criminalCount), inline: true },
      { name: "نوع / موديل السلاح", value: guns, inline: false },
      { name: "العملية", value: robbery.label, inline: true },
      { name: "السعة", value: `${currentOpen + 1}/${robbery.maxOpen}`, inline: true },
      { name: "الحد الأقصى للمشاركين", value: robbery.maxCriminals ? String(robbery.maxCriminals) : "غير محدد", inline: true },
      { name: "التذكرة", value: `#${ticket.id}`, inline: true }
    )
    .setFooter({ text: "HMPD • Illegal Operations" })
    .setTimestamp();

  await channel.send({
    content: `${interaction.user}${staffMentions ? ` ${staffMentions}` : ""}`,
    embeds: [embed],
    components: ticketControls(null, "robbery", false, "pending")
  });

  await interaction.editReply(
    `✅ تم إنشاء طلب **${robbery.label}** بنجاح: ${channel}\n` +
    `الإشغال الحالي: **${currentOpen + 1}/${robbery.maxOpen}**`
  );

  // Supprime automatiquement la confirmation privée après 1 minute.
  deleteEphemeralReplyAfter(interaction, 60_000);
}


function deleteEphemeralReplyAfter(interaction, delayMs = 60_000) {
  setTimeout(async () => {
    try {
      await interaction.deleteReply();
    } catch (_) {
      // La réponse a déjà été supprimée ou n'est plus accessible.
    }
  }, delayMs);
}

function createPanelEmbed() {
  return new EmbedBuilder()
    .setTitle("🎫 HMPD • نظام التذاكر الرسمي")
    .setDescription(
      [
        "مرحباً بك في نظام التذاكر الرسمي لـ **HMPD**.",
        "اختر القسم المناسب لطلبك من الأزرار أدناه.",
        "",
        "🔫 **Robbery Request** — طلب عملية لأعضاء Illegal المصرح لهم",
        "🏎️ **Speed Hunters** — طلبات Speed Hunters",
        "🚓 **Police / HMPD** — الطلبات الداخلية الخاصة بالشرطة",
        "⚠️ **Police Complaint** — شكاوى المواطنين ضد الشرطة",
        "",
        "🔐 يتم التحقق من صلاحيات الرتبة تلقائياً.",
        "📌 يمنع فتح تذاكر مكررة أو غير ضرورية."
      ].join("\n")
    )
    .setFooter({ text: "HMPD • Official Ticket System" })
    .setTimestamp();
}

function createPanelRows() {
  const robberyRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_robbery")
      .setLabel("Robbery Request")
      .setEmoji("🔫")
      .setStyle(ButtonStyle.Danger)
  );

  const mainRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_create:racer")
      .setLabel("Speed Hunters")
      .setEmoji("🏎️")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("ticket_create:police")
      .setLabel("Police / HMPD")
      .setEmoji("🚓")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("ticket_create:complaint")
      .setLabel("Police Complaint")
      .setEmoji("⚠️")
      .setStyle(ButtonStyle.Danger)
  );

  return [robberyRow, mainRow];
}


function getMissingAccessMessage(type) {
  if (!type?.accessRoleIds?.length) {
    return `❌ لم يتم إعداد صلاحية فتح **${type?.label || "هذه التذكرة"}** بعد. يرجى التواصل مع الإدارة.`;
  }

  return [
    `❌ لا تملك الرتبة المطلوبة لفتح **${type.label}**.`,
    "",
    "إذا كنت تعتقد أن هذا خطأ، يرجى التواصل مع مسؤول."
  ].join("\n");
}

function canOpenTicket(member, type) {
  if (!member || !type) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return memberHasAnyRole(member, type.accessRoleIds || []);
}

async function createTicket(interaction, typeKey) {
  const blacklist = await db.getBlacklistEntry(interaction.guildId, interaction.user.id);
  if (blacklist) {
    return interaction.reply({
      content: `⛔ لا يمكنك فتح تذكرة حالياً. السبب: **${blacklist.reason}**`,
      ephemeral: true
    });
  }

  const type = ticketTypes[typeKey];

  if (!type) {
    return interaction.reply({ content: "❌ نوع التذكرة غير معروف.", ephemeral: true });
  }

  if (!canOpenTicket(interaction.member, type)) {
    return interaction.reply({
      content: getMissingAccessMessage(type),
      ephemeral: true
    });
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
        "يرجى شرح طلبك بوضوح وبأكبر قدر ممكن من التفاصيل.",
        "سيقوم أحد أعضاء الطاقم المختص باستلام التذكرة في أقرب وقت.",
        "",
        `**الحالة:** 🟡 بانتظار مراجعة الشرطة`,
        `**المسؤول:** لم يتم الاستلام بعد`
      ].join("\n")
    )
    .addFields(
      { name: "تم الإنشاء بواسطة", value: `${interaction.user}`, inline: true },
      { name: "النوع", value: type.label, inline: true },
      { name: "التذكرة", value: `#${ticket.id}`, inline: true }
    )
    .setFooter({ text: "HMPD • Ticket System" })
    .setTimestamp();

  await channel.send({
    content: `${interaction.user}${staffMentions ? ` ${staffMentions}` : ""}`,
    embeds: [embed],
    components: ticketControls(null, "robbery", false, "pending")
  });

  await interaction.editReply(`✅ Ton ticket a été créé : ${channel}`);
}

async function claimTicket(interaction, ticket) {
  if (!canManageTicket(interaction.member, ticket)) {
    return interaction.reply({
      content: "❌ ليست لديك صلاحية استلام هذه التذكرة.",
      ephemeral: true
    });
  }

  if (ticket.claimed_by) {
    return interaction.reply({
      content: `❌ تم استلام هذه التذكرة مسبقاً بواسطة <@${ticket.claimed_by}>.`,
      ephemeral: true
    });
  }

  const updated = await db.claimTicket(ticket.id, interaction.user.id);
  await logTimeline(ticket, "CLAIMED", interaction.user.id);
  await updateControlMessage(
    interaction.channel,
    updated.claimed_by,
    ticket.ticket_type,
    Boolean(ticket.robbery_arrived_at),
    ticket.robbery_decision || "pending",
    Boolean(ticket.arrival_requested_at),
    ticket.ticket_code,
    false
  );

  const embed = new EmbedBuilder()
    .setTitle("🙋 تم استلام التذكرة")
    .setDescription(`${interaction.user} أصبح المسؤول عن متابعة هذا الطلب.`)
    .setFooter({ text: "HMPD • Ticket Management" })
    .setTimestamp();

  return interaction.reply({
    content: requesterMention(ticket),
    embeds: [embed],
    components: ticketControls(updated.claimed_by, ticket.ticket_type, Boolean(ticket.robbery_arrived_at), ticket.robbery_decision || "pending", Boolean(ticket.arrival_requested_at)),
    allowedMentions: { users: [ticket.owner_id] }
  });
}

async function unclaimTicket(interaction, ticket) {
  if (!canManageTicket(interaction.member, ticket)) {
    return interaction.reply({
      content: "❌ ليست لديك صلاحية إلغاء استلام هذه التذكرة.",
      ephemeral: true
    });
  }

  if (!ticket.claimed_by) {
    return interaction.reply({
      content: "❌ هذه التذكرة غير مستلمة حالياً.",
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
  await logTimeline(ticket, "RELEASED", interaction.user.id);
  await updateControlMessage(interaction.channel, null, ticket.ticket_type, Boolean(ticket.robbery_arrived_at), ticket.robbery_decision || "pending");
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



function robberyRefuseModal() {
  const modal = new ModalBuilder()
    .setCustomId("robbery_refuse_modal")
    .setTitle("Reject Robbery Request");

  const reason = new TextInputBuilder()
    .setCustomId("refusal_reason")
    .setLabel("سبب الرفض")
    .setPlaceholder("مثال: عدد الشرطة غير كافٍ / العملية غير متاحة")
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(3)
    .setMaxLength(500)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(reason));
  return modal;
}

async function acceptRobbery(interaction, ticket) {
  if (ticket.ticket_type !== "robbery") {
    return interaction.reply({ content: "❌ هذه التذكرة ليست طلب سطو.", ephemeral: true });
  }
  if (!canManageTicket(interaction.member, ticket)) {
    return interaction.reply({ content: "❌ ليست لديك صلاحية قبول العملية.", ephemeral: true });
  }
  if (!ticket.claimed_by) {
    return interaction.reply({ content: "❌ يجب استلام التذكرة أولاً.", ephemeral: true });
  }
  if (ticket.claimed_by !== interaction.user.id && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: `❌ التذكرة مستلمة بواسطة <@${ticket.claimed_by}>.`, ephemeral: true });
  }
  if ((ticket.robbery_decision || "pending") !== "pending") {
    return interaction.reply({ content: "❌ تم اتخاذ قرار بشأن هذه العملية مسبقاً.", ephemeral: true });
  }

  const deadline = new Date(Date.now() + 30 * 60 * 1000);
  const updated = await db.acceptRobbery(ticket.id, interaction.user.id, deadline);
  await logTimeline(ticket, "APPROVED", interaction.user.id, "30-minute arrival timer started");
  if (!updated) {
    return interaction.reply({ content: "❌ تعذر قبول العملية أو تم اتخاذ قرار مسبقاً.", ephemeral: true });
  }

  await updateControlMessage(interaction.channel, ticket.claimed_by, "robbery", false, "accepted", false, ticket.ticket_code, false);

  const unix = Math.floor(deadline.getTime() / 1000);
  const embed = new EmbedBuilder()
    .setTitle("✅ Robbery Approved")
    .setDescription([
      `تم قبول العملية بواسطة ${interaction.user}.`,
      "",
      "⏱️ **يجب على جميع أفراد العصابة / المافيا التواجد في موقع العملية خلال 30 دقيقة كحد أقصى.**",
      `المهلة المتبقية: <t:${unix}:R> — الموعد النهائي: <t:${unix}:t>.`,
      "",
      "📍 عند وصول الجميع، يضغط صاحب الطلب على **Request Arrival**، ثم تقوم الشرطة بتأكيد الوصول عبر **Confirm Arrival**.",
      "🔔 سيقوم النظام بإرسال تنبيهات عند بقاء 10 دقائق و5 دقائق ودقيقتين.",
      "",
      "❌ إذا انتهت المهلة دون تأكيد الوصول، سيتم إلغاء العملية وإغلاق التذكرة تلقائياً."
    ].join("\n"))
    .setFooter({ text: "HMPD • Robbery Authorization" })
    .setTimestamp();

  return interaction.reply({
    content: requesterMention(ticket),
    embeds: [embed],
    components: ticketControls(ticket.claimed_by, "robbery", false, "accepted", false),
    allowedMentions: { users: [ticket.owner_id] }
  });
}

async function refuseRobbery(interaction, ticket, reason) {
  if (ticket.ticket_type !== "robbery") {
    return interaction.reply({ content: "❌ هذه التذكرة ليست طلب سطو.", ephemeral: true });
  }
  if (!canManageTicket(interaction.member, ticket)) {
    return interaction.reply({ content: "❌ ليست لديك صلاحية رفض العملية.", ephemeral: true });
  }
  if (!ticket.claimed_by) {
    return interaction.reply({ content: "❌ يجب استلام التذكرة أولاً.", ephemeral: true });
  }
  if ((ticket.robbery_decision || "pending") !== "pending") {
    return interaction.reply({ content: "❌ تم اتخاذ قرار بشأن هذه العملية مسبقاً.", ephemeral: true });
  }

  const updated = await db.refuseRobbery(ticket.id, interaction.user.id, reason);
  await logTimeline(ticket, "REJECTED", interaction.user.id, reason);
  if (!updated) {
    return interaction.reply({ content: "❌ تعذر رفض العملية أو تم اتخاذ قرار مسبقاً.", ephemeral: true });
  }

  await updateControlMessage(interaction.channel, ticket.claimed_by, "robbery", false, "refused", false, ticket.ticket_code, false);

  const embed = new EmbedBuilder()
    .setTitle("❌ Robbery Rejected")
    .setDescription([
      `تم رفض الطلب بواسطة ${interaction.user}.`,
      "",
      `**سبب الرفض:** ${reason}`,
      "",
      "سيتم إغلاق التذكرة تلقائياً."
    ].join("\n"))
    .setFooter({ text: "HMPD • Robbery Decision" })
    .setTimestamp();

  await interaction.reply({
    content: requesterMention(ticket),
    embeds: [embed],
    allowedMentions: { users: [ticket.owner_id] }
  });

  // Log the refusal before closing.
  const logChannel = logChannelId ? interaction.guild.channels.cache.get(logChannelId) : null;
  if (logChannel?.isTextBased()) {
    const logEmbed = new EmbedBuilder()
      .setTitle(`❌ رفض عملية #${ticket.id}`)
      .addFields(
        { name: "العملية", value: robberyConfig.robberies[ticket.robbery_type]?.label || ticket.robbery_type, inline: true },
        { name: "العصابة / المافيا", value: ticket.group_name || "غير مسجل", inline: true },
        { name: "عدد المشاركين", value: String(ticket.criminal_count || "غير مسجل"), inline: true },
        { name: "تم الرفض بواسطة", value: `${interaction.user}`, inline: true },
        { name: "السبب", value: reason.slice(0, 1024) }
      )
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  }

  await db.closeTicket(ticket.id, interaction.user.id, `رفض العملية: ${reason}`);
  setTimeout(() => {
    interaction.channel.delete(`Robbery refused: ${reason}`).catch(() => {});
  }, 5000);
}

async function requestRobberyArrival(interaction, ticket) {
  if (ticket.ticket_type !== "robbery") {
    return interaction.reply({ content: "❌ This ticket is not a robbery request.", ephemeral: true });
  }
  if (interaction.user.id !== ticket.owner_id) {
    return interaction.reply({ content: "❌ Only the ticket requester can use **Request Arrival**.", ephemeral: true });
  }
  if ((ticket.robbery_decision || "pending") !== "accepted") {
    return interaction.reply({ content: "❌ The robbery must be approved first.", ephemeral: true });
  }
  if (ticket.robbery_arrived_at) {
    return interaction.reply({ content: "✅ Arrival is already confirmed.", ephemeral: true });
  }
  if (ticket.arrival_requested_at) {
    return interaction.reply({ content: "⏳ An arrival confirmation is already waiting for police review.", ephemeral: true });
  }
  if (ticket.robbery_deadline && new Date(ticket.robbery_deadline).getTime() <= Date.now()) {
    return interaction.reply({ content: "❌ The 30-minute arrival deadline has expired.", ephemeral: true });
  }

  const updated = await db.requestRobberyArrival(ticket.id, interaction.user.id);
  await logTimeline(ticket, "ARRIVAL_REQUESTED", interaction.user.id);
  if (!updated) {
    return interaction.reply({ content: "❌ Arrival request could not be submitted.", ephemeral: true });
  }

  const deadline = new Date(ticket.robbery_deadline).getTime();
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(ticket.accepted_at).getTime()) / 1000));
  const remainingSeconds = Math.max(0, Math.floor((deadline - Date.now()) / 1000));

  const embed = new EmbedBuilder()
    .setTitle("📍 Arrival Confirmation Requested")
    .setDescription([
      `${interaction.user} يعلن أن جميع المشاركين وصلوا إلى موقع العملية.`,
      "",
      `⏱️ الوقت المستخدم: **${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s**`,
      `⌛ الوقت المتبقي: **${Math.floor(remainingSeconds / 60)}m ${remainingSeconds % 60}s**`,
      "",
      "🚓 يجب على الشرطة التحقق من وجود جميع المشاركين في الموقع.",
      "استخدم **Confirm Arrival** إذا كان الجميع موجوداً، أو **Reject Arrival** إذا لم يكتمل الوصول."
    ].join("\n"))
    .setFooter({ text: ticket.ticket_code || `Ticket #${ticket.id}` })
    .setTimestamp();

  const staffMentions = robberyConfig.staffRoleIds.map(id => `<@&${id}>`).join(" ");

  await interaction.update({
    content: `${staffMentions} <@${ticket.owner_id}>`.trim(),
    embeds: [embed],
    components: ticketControls(ticket.claimed_by, "robbery", false, "accepted", true),
    allowedMentions: { roles: robberyConfig.staffRoleIds, users: [ticket.owner_id] }
  });

  await renameTicketChannelForStage(
    interaction.channel,
    "robbery",
    ticket.claimed_by,
    false,
    "accepted",
    true,
    ticket.ticket_code
  );
}

async function resolveRobberyCooldownChannel(guild) {
  const channelId = robberyCooldownChannelId || robberyHistoryChannelId;
  if (!channelId) {
    console.error("❌ Aucun salon cooldown configuré. Ajoute ROBBERY_COOLDOWN_CHANNEL_ID dans Render.");
    return null;
  }

  let channel = guild.channels.cache.get(channelId) || null;

  if (!channel) {
    channel = await guild.channels.fetch(channelId).catch(error => {
      console.error(`❌ Impossible de récupérer le salon cooldown ${channelId}:`, error);
      return null;
    });
  }

  if (!channel) {
    console.error(`❌ Salon cooldown introuvable: ${channelId}`);
    return null;
  }

  if (!channel.isTextBased()) {
    console.error(`❌ Le salon cooldown ${channelId} n'est pas un salon texte.`);
    return null;
  }

  return channel;
}

async function sendRobberyCooldownNotice(guild, ticket, confirmedById = null) {
  if (!ticket || ticket.ticket_type !== "robbery" || !ticket.robbery_arrived_at) return false;
  if (ticket.cooldown_notice_sent_at) return true;

  const channel = await resolveRobberyCooldownChannel(guild);
  if (!channel) {
    console.error(`❌ Cooldown room unavailable for ${ticket.ticket_code || ticket.id}.`);
    return false;
  }

  let cooldown = null;
  try {
    cooldown = await db.getRobberyOperationCooldown(ticket.guild_id, ticket.robbery_type);
    if (!cooldown) {
      cooldown = await db.setRobberyOperationCooldown(
        ticket.guild_id,
        ticket.robbery_type,
        ticket.id,
        ticket.group_name,
        robberyOperationCooldownMinutes
      );
    }
  } catch (error) {
    console.error("❌ Cooldown DB error:", error);
  }

  const robbery = robberyConfig.robberies[ticket.robbery_type];
  const confirmedAt = new Date(ticket.robbery_arrived_at);
  const acceptedAt = ticket.accepted_at ? new Date(ticket.accepted_at) : confirmedAt;
  const elapsedSeconds = Math.max(0, Math.floor((confirmedAt - acceptedAt) / 1000));
  const confirmer = confirmedById || ticket.robbery_arrived_by;

  const embed = new EmbedBuilder()
    .setTitle("⏳ Robbery Cooldown Started")
    .addFields(
      { name: "Operation", value: robbery?.label || ticket.robbery_type || "Unknown", inline: true },
      { name: "Gang / Mafia", value: ticket.group_name || "—", inline: true },
      { name: "Participants", value: String(ticket.criminal_count || "—"), inline: true },
      { name: "Requester", value: `<@${ticket.owner_id}>`, inline: true },
      { name: "Arrival Confirmed By", value: confirmer ? `<@${confirmer}>` : "HMPD", inline: true },
      { name: "Cooldown", value: cooldown?.expires_at
        ? `🔵 ${robberyOperationCooldownMinutes} min • ends <t:${Math.floor(new Date(cooldown.expires_at).getTime()/1000)}:R>`
        : `🔵 ${robberyOperationCooldownMinutes} min`, inline: true },
      { name: "Status", value: "🔵 COOLDOWN ACTIVE", inline: true }
    )
    .setFooter({ text: ticket.ticket_code || `Ticket #${ticket.id}` })
    .setTimestamp(confirmedAt);

  try {
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    await db.markCooldownNoticeSent(ticket.id).catch(() => {});
    console.log(`✅ Cooldown sent to #${channel.name} (${channel.id})`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send cooldown to ${channel.id}:`, error);
    return false;
  }
}

function buildRobberyReadyEmbed(ticket, confirmedById = null) {
  const robbery = robberyConfig.robberies[ticket.robbery_type];
  const confirmedAt = ticket.robbery_arrived_at ? new Date(ticket.robbery_arrived_at) : new Date();
  const acceptedAt = ticket.accepted_at ? new Date(ticket.accepted_at) : confirmedAt;
  const elapsedSeconds = Math.max(0, Math.floor((confirmedAt.getTime() - acceptedAt.getTime()) / 1000));
  const confirmer = confirmedById || ticket.robbery_arrived_by;

  return new EmbedBuilder()
    .setTitle("✅ Robbery Ready")
    .addFields(
      { name: "Operation", value: robbery?.label || ticket.robbery_type || "Unknown", inline: true },
      { name: "Gang / Mafia", value: ticket.group_name || "—", inline: true },
      { name: "Participants", value: String(ticket.criminal_count || "—"), inline: true },
      { name: "Approved By", value: ticket.accepted_by ? `<@${ticket.accepted_by}>` : "—", inline: true },
      { name: "Arrival Confirmed By", value: confirmer ? `<@${confirmer}>` : "HMPD", inline: true },
      { name: "Arrival Time", value: `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`, inline: true },
      { name: "Status", value: "🟢 READY", inline: true }
    )
    .setFooter({ text: ticket.ticket_code || `Ticket #${ticket.id}` })
    .setTimestamp(confirmedAt);
}

async function confirmRobberyArrival(interaction, ticket) {
  if (!canManageTicket(interaction.member, ticket)) {
    return interaction.reply({ content: "❌ Only authorized HMPD staff can confirm arrival.", ephemeral: true });
  }
  if ((ticket.robbery_decision || "pending") !== "accepted") {
    return interaction.reply({ content: "❌ The robbery is not approved.", ephemeral: true });
  }
  if (!ticket.arrival_requested_at) {
    return interaction.reply({ content: "❌ The requester has not submitted **Request Arrival** yet.", ephemeral: true });
  }

  // Self-heal: DB already says READY but Discord still shows old buttons.
  if (ticket.robbery_arrived_at) {
    const readyEmbed = buildRobberyReadyEmbed(ticket);

    await interaction.update({
      content: `<@${ticket.owner_id}>`,
      embeds: [readyEmbed],
      components: ticketControls(ticket.claimed_by, "robbery", true, "accepted", true),
      allowedMentions: { users: [ticket.owner_id] }
    }).catch(async () => {
      await interaction.message.edit({
        content: `<@${ticket.owner_id}>`,
        embeds: [readyEmbed],
        components: ticketControls(ticket.claimed_by, "robbery", true, "accepted", true),
        allowedMentions: { users: [ticket.owner_id] }
      }).catch(() => {});
    });

    await renameTicketChannelForStage(
      interaction.channel,
      "robbery",
      ticket.claimed_by,
      true,
      "accepted",
      true,
      ticket.ticket_code
    );

    await sendRobberyCooldownNotice(interaction.guild, ticket, ticket.robbery_arrived_by || interaction.user.id);
    return;
  }

  if (ticket.robbery_deadline && new Date(ticket.robbery_deadline).getTime() <= Date.now()) {
    return interaction.reply({ content: "❌ The 30-minute arrival deadline has expired.", ephemeral: true });
  }

  const updated = await db.confirmRobberyArrival(ticket.id, interaction.user.id);

  // If another click/process confirmed it milliseconds earlier, fetch the fresh DB state and self-heal.
  if (!updated) {
    const fresh = await db.getTicketByChannel(interaction.channelId);
    if (fresh?.robbery_arrived_at) {
      const readyEmbed = buildRobberyReadyEmbed(fresh);

      await interaction.update({
        content: `<@${fresh.owner_id}>`,
        embeds: [readyEmbed],
        components: ticketControls(fresh.claimed_by, "robbery", true, "accepted", true),
        allowedMentions: { users: [fresh.owner_id] }
      }).catch(async () => {
        await interaction.message.edit({
          content: `<@${fresh.owner_id}>`,
          embeds: [readyEmbed],
          components: ticketControls(fresh.claimed_by, "robbery", true, "accepted", true),
          allowedMentions: { users: [fresh.owner_id] }
        }).catch(() => {});
      });

      await renameTicketChannelForStage(
        interaction.channel,
        "robbery",
        fresh.claimed_by,
        true,
        "accepted",
        true,
        fresh.ticket_code
      );

      return;
    }

    return interaction.reply({ content: "❌ Arrival could not be confirmed.", ephemeral: true });
  }

  await logTimeline(updated, "ARRIVAL_CONFIRMED", interaction.user.id);

  // IMPORTANT: update Discord first. Non-critical DB/log actions happen afterwards.
  const readyEmbed = buildRobberyReadyEmbed(updated, interaction.user.id);

  await interaction.update({
    content: `<@${updated.owner_id}>`,
    embeds: [readyEmbed],
    components: ticketControls(updated.claimed_by, "robbery", true, "accepted", true),
    allowedMentions: { users: [updated.owner_id] }
  });

  await renameTicketChannelForStage(
    interaction.channel,
    "robbery",
    updated.claimed_by,
    true,
    "accepted",
    true,
    updated.ticket_code
  );

  const freshConfirmed = await db.getTicketByChannel(interaction.channelId).catch(() => updated);
  await sendRobberyCooldownNotice(interaction.guild, freshConfirmed || updated, interaction.user.id);

}

async function rejectRobberyArrival(interaction, ticket) {
  if (!canManageTicket(interaction.member, ticket)) {
    return interaction.reply({ content: "❌ Only authorized HMPD staff can reject arrival.", ephemeral: true });
  }
  if ((ticket.robbery_decision || "pending") !== "accepted") {
    return interaction.reply({ content: "❌ The robbery is not approved.", ephemeral: true });
  }
  if (!ticket.arrival_requested_at) {
    return interaction.reply({ content: "❌ There is no pending arrival request.", ephemeral: true });
  }
  if (ticket.robbery_arrived_at) {
    return interaction.reply({ content: "✅ Arrival is already confirmed.", ephemeral: true });
  }

  const updated = await db.rejectRobberyArrival(ticket.id, interaction.user.id);
  await logTimeline(ticket, "ARRIVAL_REJECTED", interaction.user.id);
  if (!updated) {
    return interaction.reply({ content: "❌ Arrival request could not be rejected.", ephemeral: true });
  }

  await renameTicketChannelForStage(interaction.channel, "robbery", ticket.claimed_by, false, "accepted", false, ticket.ticket_code);

  const deadlineUnix = ticket.robbery_deadline
    ? Math.floor(new Date(ticket.robbery_deadline).getTime() / 1000)
    : null;

  const embed = new EmbedBuilder()
    .setTitle("❌ Arrival Request Rejected")
    .setDescription([
      `تم رفض تأكيد الوصول بواسطة ${interaction.user}.`,
      "",
      "المؤقت **يستمر** ولا يتم تمديده.",
      "يمكن لصاحب الطلب الضغط على **Request Arrival** مرة أخرى عندما يكون جميع المشاركين في الموقع.",
      deadlineUnix ? `⏱️ الموعد النهائي: <t:${deadlineUnix}:R>.` : ""
    ].filter(Boolean).join("\n"))
    .setFooter({ text: ticket.ticket_code || `Ticket #${ticket.id}` })
    .setTimestamp();

  return interaction.update({
    content: `<@${ticket.owner_id}>`,
    embeds: [embed],
    components: ticketControls(ticket.claimed_by, "robbery", false, "accepted", false),
    allowedMentions: { users: [ticket.owner_id] }
  });
}

async function takeOverTicket(interaction, ticket) {
  if (!canSuperviseTicket(interaction.member)) {
    return interaction.reply({ content: "❌ Only Supervisor / High Grade can use **Take Over**.", ephemeral: true });
  }
  if (!ticket.claimed_by) {
    return interaction.reply({ content: "❌ This ticket is not currently claimed.", ephemeral: true });
  }
  if (ticket.claimed_by === interaction.user.id) {
    return interaction.reply({ content: "✅ You already own this ticket.", ephemeral: true });
  }

  const previous = ticket.claimed_by;
  const updated = await db.transferTicket(ticket.id, interaction.user.id);
  await logTimeline(ticket, "TAKE_OVER", interaction.user.id, `Previous staff: ${previous}`);

  await updateControlMessage(
    interaction.channel,
    updated.claimed_by,
    ticket.ticket_type,
    Boolean(ticket.robbery_arrived_at),
    ticket.robbery_decision || "pending",
    Boolean(ticket.arrival_requested_at),
    ticket.ticket_code,
    false
  );

  return interaction.reply({
    content: `<@${ticket.owner_id}>`,
    embeds: [new EmbedBuilder()
      .setTitle("🛡️ Ticket Taken Over")
      .setDescription(`${interaction.user} took over this ticket from <@${previous}>.`)
      .setFooter({ text: ticket.ticket_code || `Ticket #${ticket.id}` })
      .setTimestamp()],
    components: ticketControls(
      updated.claimed_by,
      ticket.ticket_type,
      Boolean(ticket.robbery_arrived_at),
      ticket.robbery_decision || "pending",
      Boolean(ticket.arrival_requested_at)
    ),
    allowedMentions: { users: [ticket.owner_id, previous] }
  });
}

function transferModal() {
  const modal = new ModalBuilder()
    .setCustomId("ticket_transfer_modal")
    .setTitle("Transfer Ticket");

  const userId = new TextInputBuilder()
    .setCustomId("user_id")
    .setLabel("New staff Discord ID")
    .setPlaceholder("123456789012345678")
    .setStyle(TextInputStyle.Short)
    .setMinLength(15)
    .setMaxLength(22)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(userId));
  return modal;
}

function noteModal() {
  const modal = new ModalBuilder()
    .setCustomId("ticket_note_modal")
    .setTitle("Add Internal Note");

  const note = new TextInputBuilder()
    .setCustomId("note")
    .setLabel("Internal staff note")
    .setPlaceholder("Visible only through staff tools and ticket logs")
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(2)
    .setMaxLength(1000)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(note));
  return modal;
}

async function transferTicket(interaction, ticket, userId) {
  if (!canManageTicket(interaction.member, ticket)) {
    return interaction.reply({ content: "❌ ليست لديك صلاحية نقل التذكرة.", ephemeral: true });
  }
  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  if (!member || !canManageTicket(member, ticket)) {
    return interaction.reply({ content: "❌ يجب أن يكون المستخدم عضواً مخولاً بإدارة هذا النوع من التذاكر.", ephemeral: true });
  }

  const updated = await db.transferTicket(ticket.id, userId);
  await logTimeline(ticket, "TRANSFERRED", interaction.user.id, `New staff: ${userId}`);
  await updateControlMessage(
    interaction.channel,
    updated.claimed_by,
    ticket.ticket_type,
    Boolean(ticket.robbery_arrived_at),
    ticket.robbery_decision || "pending"
  );

  return interaction.reply({
    content: requesterMention(ticket),
    allowedMentions: { users: [ticket.owner_id] },
    embeds: [new EmbedBuilder()
      .setTitle("🔁 Ticket Transferred")
      .setDescription(`${interaction.user} نقل التذكرة إلى ${member}.`)
      .setFooter({ text: ticket.ticket_code || `Ticket #${ticket.id}` })
      .setTimestamp()]
  });
}

async function addInternalNote(interaction, ticket, note) {
  if (!canManageTicket(interaction.member, ticket)) {
    return interaction.reply({ content: "❌ ليست لديك صلاحية إضافة ملاحظة داخلية.", ephemeral: true });
  }

  await db.addTicketNote(ticket.id, interaction.user.id, note);
  await logTimeline(ticket, "NOTE_ADDED", interaction.user.id, note.slice(0, 250));

  const logChannel = logChannelId ? interaction.guild.channels.cache.get(logChannelId) : null;
  if (logChannel?.isTextBased()) {
    await logChannel.send({
      embeds: [new EmbedBuilder()
        .setTitle(`📝 Internal Note • ${ticket.ticket_code || `Ticket #${ticket.id}`}`)
        .addFields(
          { name: "Staff", value: `${interaction.user}`, inline: true },
          { name: "Channel", value: `${interaction.channel}`, inline: true },
          { name: "Note", value: note.slice(0, 1024) }
        )
        .setTimestamp()]
    }).catch(() => {});
  }

  return interaction.reply({ content: "✅ Internal note saved.", ephemeral: true });
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
      content: "❌ ليست لديك صلاحية إغلاق هذه التذكرة.",
      ephemeral: true
    });
  }

  await interaction.deferReply();

  const internalNotes = await db.getTicketNotes(ticket.id).catch(() => []);
  await logTimeline(ticket, "CLOSE_REQUESTED", interaction.user.id, reason);
  const timeline = await db.getTicketTimeline(ticket.id).catch(() => []);

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
      .setTitle(`🔒 ${ticket.ticket_code || `TK-${ticket.id}`} • Closed`)
      .addFields(
        { name: "Propriétaire", value: `<@${ticket.owner_id}>`, inline: true },
        { name: "النوع", value: ticket.ticket_type === "robbery"
          ? `Braquage — ${robberyConfig.robberies[ticket.robbery_type]?.label || ticket.robbery_type}`
          : (ticketTypes[ticket.ticket_type]?.label || ticket.ticket_type), inline: true },
        { name: "Fermé par", value: `${interaction.user}`, inline: true },
        { name: "Pris par", value: ticket.claimed_by ? `<@${ticket.claimed_by}>` : "Non assigné", inline: true },
        { name: "Salon", value: `#${interaction.channel.name}`, inline: true },
        { name: "Motif", value: reason.slice(0, 1024) },
        ...(ticket.ticket_type === "robbery" ? [
          { name: "Gang / Mafia", value: ticket.group_name || "غير مسجل", inline: true },
          { name: "Participants", value: String(ticket.criminal_count || "غير مسجل"), inline: true },
          { name: "Weapons", value: ticket.guns || "غير مسجل", inline: false },
          { name: "Decision", value: ticket.robbery_decision || "pending", inline: true },
          { name: "Approved By", value: ticket.accepted_by ? `<@${ticket.accepted_by}>` : "—", inline: true },
          { name: "Rejected By", value: ticket.refused_by ? `<@${ticket.refused_by}>` : "—", inline: true },
          { name: "Rejection Reason", value: (ticket.refusal_reason || "—").slice(0, 1024), inline: false },
          { name: "Arrival Confirmed", value: ticket.robbery_arrived_at ? `<t:${Math.floor(new Date(ticket.robbery_arrived_at).getTime()/1000)}:F>` : "No", inline: true }
        ] : []),
        { name: "Created", value: ticket.created_at ? `<t:${Math.floor(new Date(ticket.created_at).getTime()/1000)}:F>` : "—", inline: true },
        { name: "Closed", value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true },
        { name: "Timeline", value: timeline.length
          ? timeline.map(e => `• ${e.action} — ${e.actor_id ? `<@${e.actor_id}>` : "SYSTEM"} — <t:${Math.floor(new Date(e.created_at).getTime()/1000)}:T>${e.details ? ` — ${e.details}` : ""}`).join("\n").slice(0, 1024)
          : "None", inline: false },
        { name: "Internal Notes", value: internalNotes.length
          ? internalNotes.map(n => `• <@${n.author_id}>: ${n.note}`).join("\n").slice(0, 1024)
          : "None", inline: false },
        { name: "Transcript", value: "📄 Full message history is attached as an HTML transcript, including text, embeds, attachments, reactions and timestamps.", inline: false }
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
  createRobberyTicket,
  robberyRequestModal,
  requestRobberyArrival,
  confirmRobberyArrival,
  rejectRobberyArrival,
  acceptRobbery,
  refuseRobbery,
  robberyRefuseModal,
  transferModal,
  noteModal,
  transferTicket,
  addInternalNote,
  takeOverTicket,
  ensureTicketControls,
  canSuperviseTicket,
  sendRobberyCooldownNotice
};
