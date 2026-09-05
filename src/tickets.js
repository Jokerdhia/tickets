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
  robberyCooldownMinutes
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

function ticketControls(claimedBy = null, ticketType = null, arrived = false, decision = "pending") {
  if (ticketType !== "robbery") {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ticket_claim")
          .setLabel(claimedBy ? "Claimed" : "Claim")
          .setEmoji("🙋")
          .setStyle(ButtonStyle.Success)
          .setDisabled(Boolean(claimedBy)),
        new ButtonBuilder()
          .setCustomId("ticket_unclaim")
          .setLabel("Release")
          .setEmoji("↩️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!claimedBy),
        new ButtonBuilder()
          .setCustomId("ticket_transfer")
          .setLabel("Transfer")
          .setEmoji("🔁")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!claimedBy),
        new ButtonBuilder()
          .setCustomId("ticket_note")
          .setLabel("Add Note")
          .setEmoji("📝")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("ticket_close")
          .setLabel("Close")
          .setEmoji("🔒")
          .setStyle(ButtonStyle.Danger)
      )
    ];
  }

  const accepted = decision === "accepted";
  const refused = decision === "refused";

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_claim")
      .setLabel(claimedBy ? "Claimed" : "Claim")
      .setEmoji("🙋")
      .setStyle(ButtonStyle.Success)
      .setDisabled(Boolean(claimedBy) || refused),
    new ButtonBuilder()
      .setCustomId("ticket_unclaim")
      .setLabel("Release")
      .setEmoji("↩️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!claimedBy || accepted || refused)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("robbery_accept")
      .setLabel("Approve")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!claimedBy || accepted || refused),
    new ButtonBuilder()
      .setCustomId("robbery_refuse")
      .setLabel("Reject")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!claimedBy || accepted || refused),
    new ButtonBuilder()
      .setCustomId("robbery_arrived")
      .setLabel(arrived ? "Arrival Confirmed" : "All On Site")
      .setEmoji("📍")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!accepted || arrived),
    new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("Close")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_transfer")
      .setLabel("Transfer")
      .setEmoji("🔁")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!claimedBy || refused),
    new ButtonBuilder()
      .setCustomId("ticket_note")
      .setLabel("Add Note")
      .setEmoji("📝")
      .setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2, row3];
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

async function updateControlMessage(channel, claimedBy, ticketType = null, arrived = false, decision = "pending") {
  const messages = await channel.messages.fetch({ limit: 30 });
  const controlMessage = messages.find(m =>
    m.author.id === channel.client.user.id &&
    m.components.some(row =>
      row.components.some(c => c.customId === "ticket_claim")
    )
  );

  if (controlMessage) {
    await controlMessage.edit({ components: ticketControls(claimedBy, ticketType, arrived, decision) }).catch(() => {});
  }
}


function robberySelectMenu() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("robbery_select")
    .setPlaceholder("اختر العملية المطلوبة")
    .setMinValues(1)
    .setMaxValues(1);

  for (const robbery of Object.values(robberyConfig.robberies)) {
    menu.addOptions({
      label: robbery.label,
      value: robbery.key,
      emoji: robbery.emoji,
      description: `الحد الأقصى: ${robbery.maxOpen} طلب مفتوح`
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
      content: "❌ هذا القسم مخصص فقط لأعضاء **Illegal**.",
      ephemeral: true
    });
  }

  const lines = [];
  for (const robbery of Object.values(robberyConfig.robberies)) {
    const current = await db.countOpenRobberyTickets(interaction.guildId, robbery.key);
    const icon = current >= robbery.maxOpen ? "🔴" : current === 0 ? "🟢" : "🟠";
    lines.push(`${icon} **${robbery.label}** — ${current}/${robbery.maxOpen}` +
      (robbery.maxCriminals ? ` • الحد الأقصى للأفراد: ${robbery.maxCriminals}` : ""));
  }

  const embed = new EmbedBuilder()
    .setTitle("🔫 طلب عملية سطو")
    .setDescription([
      "اختر العملية التي ترغب في طلبها.",
      "",
      ...lines,
      "",
      "🔴 = مكتمل • 🟠 = أماكن متبقية • 🟢 = متاح"
    ].join("\n"))
    .addFields({ name: "سياسة الطلب", value: "• عملية واحدة نشطة لكل عصابة / مافيا\n• الالتزام بالعدد الأقصى للمشاركين\n• بعد الموافقة: 20 دقيقة للوصول إلى الموقع", inline: false })
    .setFooter({ text: "HMPD • Illegal Operations" })
    .setTimestamp();

  return interaction.reply({
    embeds: [embed],
    components: [robberySelectMenu()],
    ephemeral: true
  });
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
  await updateControlMessage(
    interaction.channel,
    updated.claimed_by,
    ticket.ticket_type,
    Boolean(ticket.robbery_arrived_at),
    ticket.robbery_decision || "pending"
  );

  const embed = new EmbedBuilder()
    .setTitle("🙋 تم استلام التذكرة")
    .setDescription(`${interaction.user} أصبح المسؤول عن متابعة هذا الطلب.`)
    .setFooter({ text: "HMPD • Ticket Management" })
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
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

  const deadline = new Date(Date.now() + 20 * 60 * 1000);
  const updated = await db.acceptRobbery(ticket.id, interaction.user.id, deadline);
  if (!updated) {
    return interaction.reply({ content: "❌ تعذر قبول العملية أو تم اتخاذ قرار مسبقاً.", ephemeral: true });
  }

  await updateControlMessage(interaction.channel, ticket.claimed_by, "robbery", false, "accepted");

  const unix = Math.floor(deadline.getTime() / 1000);
  const embed = new EmbedBuilder()
    .setTitle("✅ Robbery Approved")
    .setDescription([
      `تم قبول العملية بواسطة ${interaction.user}.`,
      "",
      "⏱️ **يجب على جميع أفراد العصابة / المافيا التواجد في موقع العملية خلال 20 دقيقة كحد أقصى.**",
      `المهلة المتبقية: <t:${unix}:R> — الموعد النهائي: <t:${unix}:t>.`,
      "",
      "📍 عند وصول الجميع، يضغط المسؤول على زر **الجميع في الموقع**.",
      "🔔 سيقوم النظام بإرسال تنبيه عند بقاء 10 دقائق و5 دقائق.",
      "",
      "❌ إذا انتهت المهلة دون تأكيد الوصول، سيتم إلغاء العملية وإغلاق التذكرة تلقائياً."
    ].join("\n"))
    .setFooter({ text: "HMPD • Robbery Authorization" })
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
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
  if (!updated) {
    return interaction.reply({ content: "❌ تعذر رفض العملية أو تم اتخاذ قرار مسبقاً.", ephemeral: true });
  }

  await updateControlMessage(interaction.channel, ticket.claimed_by, "robbery", false, "refused");

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

  await interaction.reply({ embeds: [embed] });

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

async function confirmRobberyArrived(interaction, ticket) {
  if (ticket.ticket_type !== "robbery") {
    return interaction.reply({ content: "❌ Ce ticket n'est pas un braquage.", ephemeral: true });
  }

  if (!canManageTicket(interaction.member, ticket)) {
    return interaction.reply({
      content: "❌ Seul le staff autorisé peut confirmer l'arrivée.",
      ephemeral: true
    });
  }

  if ((ticket.robbery_decision || "pending") !== "accepted") {
    return interaction.reply({
      content: "❌ يجب قبول العملية أولاً بواسطة زر **قبول العملية**.",
      ephemeral: true
    });
  }

  if (ticket.robbery_arrived_at) {
    return interaction.reply({
      content: "✅ L'arrivée a déjà été confirmée.",
      ephemeral: true
    });
  }

  if (ticket.robbery_deadline && new Date(ticket.robbery_deadline).getTime() < Date.now()) {
    return interaction.reply({
      content: "❌ Le délai de 20 minutes est déjà dépassé.",
      ephemeral: true
    });
  }

  const updated = await db.markRobberyArrived(ticket.id);
  await updateControlMessage(interaction.channel, ticket.claimed_by, "robbery", true, "accepted");

  const embed = new EmbedBuilder()
    .setTitle("✅ Arrival Confirmed")
    .setDescription([
      `${interaction.user} أكد أن جميع الأعضاء متواجدون في موقع العملية.`,
      "",
      "تم احترام مهلة الـ 20 دقيقة. يمكن متابعة العملية وفقاً للتعليمات."
    ].join("\n"))
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
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
  await updateControlMessage(
    interaction.channel,
    updated.claimed_by,
    ticket.ticket_type,
    Boolean(ticket.robbery_arrived_at),
    ticket.robbery_decision || "pending"
  );

  return interaction.reply({
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
  confirmRobberyArrived,
  acceptRobbery,
  refuseRobbery,
  robberyRefuseModal,
  transferModal,
  noteModal,
  transferTicket,
  addInternalNote
};
