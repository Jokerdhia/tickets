const {
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  ChannelType
} = require("discord.js");

const {
  panelAdminRoleIds,
  ticketTypes,
  robberyConfig,
  supervisorRoleIds,
  warningAutoBlockThreshold,
  warningAutoBlockMinutes
} = require("./config");

const db = require("./db");
const {
  createPanelEmbed,
  createPanelRows,
  executeClose
} = require("./tickets");

const commands = [
  new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("نشر لوحة إنشاء التذاكر"),

  new SlashCommandBuilder()
    .setName("ticket-info")
    .setDescription("عرض معلومات التذكرة الحالية"),

  new SlashCommandBuilder()
    .setName("ticket-close")
    .setDescription("إغلاق التذكرة الحالية")
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("سبب الإغلاق")
        .setRequired(true)
        .setMaxLength(500)
    )
,
  new SlashCommandBuilder()
    .setName("ticket-history")
    .setDescription("عرض آخر تذاكر مستخدم")
    .addUserOption(option =>
      option.setName("user").setDescription("المستخدم").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ticket-notes")
    .setDescription("عرض الملاحظات الداخلية للتذكرة الحالية"),

  new SlashCommandBuilder()
    .setName("ticket-stats")
    .setDescription("إحصائيات التذاكر")
    .addSubcommand(sub => sub.setName("overview").setDescription("إحصائيات عامة"))
    .addSubcommand(sub => sub.setName("staff").setDescription("إحصائيات فريق التذاكر"))
    .addSubcommand(sub => sub.setName("robbery").setDescription("إحصائيات عمليات السطو")),

  new SlashCommandBuilder()
    .setName("ticket-timeline")
    .setDescription("عرض التسلسل الزمني للتذكرة الحالية"),

  new SlashCommandBuilder()
    .setName("ticket-blacklist")
    .setDescription("إدارة منع استخدام نظام التذاكر")
    .addSubcommand(sub =>
      sub.setName("add").setDescription("إضافة مستخدم للقائمة السوداء")
        .addUserOption(o => o.setName("user").setDescription("المستخدم").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("السبب").setRequired(true).setMaxLength(500))
        .addIntegerOption(o => o.setName("minutes").setDescription("مدة المنع بالدقائق (اتركها فارغة لمنع دائم)").setMinValue(1).setMaxValue(43200))
    )
    .addSubcommand(sub =>
      sub.setName("remove").setDescription("إزالة مستخدم من القائمة السوداء")
        .addUserOption(o => o.setName("user").setDescription("المستخدم").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("check").setDescription("التحقق من مستخدم")
        .addUserOption(o => o.setName("user").setDescription("المستخدم").setRequired(true))
    ),

  new SlashCommandBuilder()
    .setName("reset-server")
    .setDescription("⚠️ Supprime tous les salons et catégories du serveur")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option
        .setName("confirmation")
        .setDescription("Écris exactement RESET pour confirmer")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ticket-warning")
    .setDescription("إدارة تحذيرات نظام التذاكر")
    .addSubcommand(sub =>
      sub.setName("add").setDescription("إضافة تحذير")
        .addUserOption(o => o.setName("user").setDescription("المستخدم").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("السبب").setRequired(true).setMaxLength(500))
    )
    .addSubcommand(sub =>
      sub.setName("list").setDescription("عرض التحذيرات")
        .addUserOption(o => o.setName("user").setDescription("المستخدم").setRequired(true))
    )

].map(command => command.toJSON());

function canPublishPanel(member) {
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    panelAdminRoleIds.some(id => member.roles.cache.has(id))
  );
}

function canSupervise(member) {
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    supervisorRoleIds.some(id => member.roles.cache.has(id))
  );
}

async function handleCommand(interaction) {
  if (interaction.commandName === "ticket-panel") {
    if (!canPublishPanel(interaction.member)) {
      return interaction.reply({
        content: "❌ ليست لديك صلاحية نشر لوحة التذاكر.",
        ephemeral: true
      });
    }

    await interaction.channel.send({
      embeds: [createPanelEmbed()],
      components: createPanelRows()
    });

    return interaction.reply({
      content: "✅ تم نشر لوحة التذاكر بنجاح.",
      ephemeral: true
    });
  }

  if (interaction.commandName === "ticket-info") {
    const ticket = await db.getTicketByChannel(interaction.channelId);
    if (!ticket) {
      return interaction.reply({
        content: "❌ هذه القناة ليست تذكرة.",
        ephemeral: true
      });
    }

    const type = ticket.ticket_type === "robbery" ? null : ticketTypes[ticket.ticket_type];
    const embed = new EmbedBuilder()
      .setTitle(`🎫 ${ticket.ticket_code || `TK-${ticket.id}`}`)
      .addFields(
        { name: "Type", value: ticket.ticket_type === "robbery"
          ? `Braquage — ${robberyConfig.robberies[ticket.robbery_type]?.label || ticket.robbery_type}`
          : (type?.label || ticket.ticket_type), inline: true },
        { name: "الحالة", value: ticket.status, inline: true },
        { name: "صاحب التذكرة", value: `<@${ticket.owner_id}>`, inline: true },
        { name: "تم استلامها بواسطة", value: ticket.claimed_by ? `<@${ticket.claimed_by}>` : "Non assigné", inline: true },
        { name: "تاريخ الإنشاء", value: `<t:${Math.floor(new Date(ticket.created_at).getTime() / 1000)}:R>`, inline: true },
        ...(ticket.ticket_type === "robbery" ? [
          { name: "Decision", value: ticket.robbery_decision || "pending", inline: true },
          { name: "Gang / Mafia", value: ticket.group_name || "—", inline: true },
          { name: "Participants", value: String(ticket.criminal_count || "—"), inline: true }
        ] : [])
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }


if (interaction.commandName === "ticket-history") {
  if (!canSupervise(interaction.member)) {
    return interaction.reply({ content: "❌ ليست لديك صلاحية.", ephemeral: true });
  }
  const user = interaction.options.getUser("user", true);
  const history = await db.getTicketHistory(interaction.guildId, user.id, 10);
  const text = history.length
    ? history.map(t => `• **${t.ticket_code || `TK-${t.id}`}** — ${t.ticket_type} — ${t.status} — <t:${Math.floor(new Date(t.created_at).getTime()/1000)}:d>`).join("\n")
    : "لا توجد تذاكر مسجلة.";
  return interaction.reply({
    embeds: [new EmbedBuilder().setTitle(`📚 Ticket History • ${user.username}`).setDescription(text).setTimestamp()],
    ephemeral: true
  });
}

if (interaction.commandName === "ticket-notes") {
  const ticket = await db.getTicketByChannel(interaction.channelId);
  if (!ticket) return interaction.reply({ content: "❌ هذه القناة ليست تذكرة.", ephemeral: true });
  if (!canSupervise(interaction.member) && !ticketTypes[ticket.ticket_type]?.staffRoleIds?.some(id => interaction.member.roles.cache.has(id)) && ticket.ticket_type !== "robbery") {
    return interaction.reply({ content: "❌ ليست لديك صلاحية.", ephemeral: true });
  }
  const notes = await db.getTicketNotes(ticket.id);
  const body = notes.length
    ? notes.map(n => `• <@${n.author_id}> — <t:${Math.floor(new Date(n.created_at).getTime()/1000)}:R>\n${n.note}`).join("\n\n").slice(0, 3900)
    : "لا توجد ملاحظات داخلية.";
  return interaction.reply({
    embeds: [new EmbedBuilder().setTitle(`📝 Internal Notes • ${ticket.ticket_code || `TK-${ticket.id}`}`).setDescription(body).setTimestamp()],
    ephemeral: true
  });
}

if (interaction.commandName === "ticket-stats") {
  if (!canSupervise(interaction.member)) return interaction.reply({ content: "❌ ليست لديك صلاحية.", ephemeral: true });

  const sub = interaction.options.getSubcommand();
  if (sub === "staff") {
    const rows = await db.getStaffStats(interaction.guildId);
    const body = rows.length
      ? rows.slice(0, 20).map(r => `• <@${r.staff_id}> — Claimed: **${r.claimed}** • Closed: **${r.closed}** • Avg claim: **${r.avg_claim_minutes || "—"} min**`).join("\n")
      : "No staff data.";
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle("👮 Staff Ticket Statistics").setDescription(body).setTimestamp()], ephemeral: true });
  }

  if (sub === "robbery") {
    const rows = await db.getRobberyStats(interaction.guildId);
    const body = rows.length
      ? rows.map(r => `• **${robberyConfig.robberies[r.robbery_type]?.label || r.robbery_type}** — Total: **${r.total}** • Approved: **${r.accepted}** • Rejected: **${r.refused}** • Ready: **${r.ready}**`).join("\n")
      : "No robbery data.";
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle("🔫 Robbery Statistics").setDescription(body).setTimestamp()], ephemeral: true });
  }

  const rows = await db.getGuildStats(interaction.guildId);
  const body = rows.length ? rows.map(r => `• **${r.ticket_type} / ${r.status}:** ${r.count}`).join("\n") : "لا توجد بيانات.";
  return interaction.reply({
    embeds: [new EmbedBuilder().setTitle("📊 Ticket Statistics").setDescription(body).setTimestamp()],
    ephemeral: true
  });
}

if (interaction.commandName === "ticket-timeline") {
  const ticket = await db.getTicketByChannel(interaction.channelId);
  if (!ticket) return interaction.reply({ content: "❌ هذه القناة ليست تذكرة.", ephemeral: true });
  if (!canSupervise(interaction.member)) return interaction.reply({ content: "❌ ليست لديك صلاحية.", ephemeral: true });

  const events = await db.getTicketTimeline(ticket.id);
  const body = events.length
    ? events.map(e => `• **${e.action}** — ${e.actor_id ? `<@${e.actor_id}>` : "SYSTEM"} — <t:${Math.floor(new Date(e.created_at).getTime()/1000)}:T>${e.details ? `\n> ${e.details}` : ""}`).join("\n").slice(0, 3900)
    : "No timeline events.";

  return interaction.reply({
    embeds: [new EmbedBuilder().setTitle(`🕒 Timeline • ${ticket.ticket_code || `TK-${ticket.id}`}`).setDescription(body).setTimestamp()],
    ephemeral: true
  });
}

if (interaction.commandName === "reset-server") {
  // Sécurité : tous les membres ayant la permission Administrateur peuvent lancer le reset.
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: "❌ Seuls les administrateurs peuvent utiliser cette commande.",
      ephemeral: true
    });
  }

  const confirmation = interaction.options.getString("confirmation", true);
  if (confirmation !== "RESET") {
    return interaction.reply({
      content: "❌ Reset annulé. Pour confirmer, écris exactement `RESET`.",
      ephemeral: true
    });
  }

  await interaction.reply({
    content: "⚠️ Reset confirmé. Expulsion des membres puis suppression des rôles, salons et catégories…",
    ephemeral: true
  });

  // Expulser tous les membres expulsables avant de supprimer les rôles.
  // Le propriétaire du serveur, le bot lui-même et les membres non-kickable sont conservés.
  await interaction.guild.members.fetch();

  const membersToKick = interaction.guild.members.cache.filter(member =>
    member.id !== interaction.guild.ownerId &&
    member.id !== interaction.client.user.id &&
    !member.user.bot &&
    member.kickable
  );

  for (const member of membersToKick.values()) {
    try {
      await member.kick(`Reset serveur demandé par ${interaction.user.tag}`);
      console.log(`👢 Membre expulsé : ${member.user.tag}`);
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`❌ Impossible d'expulser ${member.user.tag}:`, error.message);
    }
  }

  // Supprimer tous les rôles que Discord autorise le bot à supprimer.
  // @everyone, les rôles gérés par Discord/bots/intégrations et les rôles
  // placés au-dessus du rôle du bot ne peuvent pas être supprimés.
  await interaction.guild.roles.fetch();

  // Suppression robuste des rôles. Discord interdit toujours la suppression de
  // @everyone, des rôles gérés par une intégration/bot et des rôles placés
  // au même niveau ou au-dessus du rôle le plus haut de ce bot.
  const me = interaction.guild.members.me || await interaction.guild.members.fetchMe();
  const botTopRole = me.roles.highest;

  const rolesToProcess = [...interaction.guild.roles.cache.values()]
    .filter(role => role.id !== interaction.guild.id) // jamais @everyone
    .sort((a, b) => b.position - a.position);

  for (const role of rolesToProcess) {
    if (role.managed) {
      console.log(`⏭️ Rôle géré par Discord/intégration conservé : ${role.name}`);
      continue;
    }

    if (role.position >= botTopRole.position || !role.editable) {
      console.log(`⏭️ Rôle trop haut pour le bot : ${role.name} (position ${role.position}, bot ${botTopRole.position})`);
      continue;
    }

    try {
      await role.delete(`Reset serveur demandé par ${interaction.user.tag}`);
      console.log(`🗑️ Rôle supprimé : ${role.name}`);
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`❌ Impossible de supprimer le rôle ${role.name}: ${error.code || ""} ${error.message}`);
    }
  }

  await interaction.guild.channels.fetch();

  // Supprimer d'abord tous les salons, puis les catégories.
  const normalChannels = interaction.guild.channels.cache.filter(
    channel => channel.type !== ChannelType.GuildCategory
  );

  for (const channel of normalChannels.values()) {
    try {
      await channel.delete(`Reset serveur demandé par ${interaction.user.tag}`);
      await new Promise(resolve => setTimeout(resolve, 350));
    } catch (error) {
      console.error(`❌ Impossible de supprimer le salon ${channel.name}:`, error.message);
    }
  }

  const categories = interaction.guild.channels.cache.filter(
    channel => channel.type === ChannelType.GuildCategory
  );

  for (const category of categories.values()) {
    try {
      await category.delete(`Reset serveur demandé par ${interaction.user.tag}`);
      await new Promise(resolve => setTimeout(resolve, 350));
    } catch (error) {
      console.error(`❌ Impossible de supprimer la catégorie ${category.name}:`, error.message);
    }
  }

  console.log(`✅ Reset complet (membres + rôles + salons + catégories) terminé par ${interaction.user.tag} (${interaction.user.id}).`);
  return;
}

if (interaction.commandName === "ticket-blacklist") {
  if (!canSupervise(interaction.member)) return interaction.reply({ content: "❌ ليست لديك صلاحية.", ephemeral: true });
  const sub = interaction.options.getSubcommand();
  const user = interaction.options.getUser("user", true);

  if (sub === "add") {
    const reason = interaction.options.getString("reason", true);
    const minutes = interaction.options.getInteger("minutes");
    const entry = await db.blacklistUser(interaction.guildId, user.id, reason, interaction.user.id, minutes);
    const expiry = entry?.expires_at
      ? `<t:${Math.floor(new Date(entry.expires_at).getTime()/1000)}:R>`
      : "Permanent";
    return interaction.reply({ content: `⛔ ${user} تم منعه من فتح التذاكر.\n**Reason:** ${reason}\n**Expires:** ${expiry}`, ephemeral: true });
  }
  if (sub === "remove") {
    await db.unblacklistUser(interaction.guildId, user.id);
    return interaction.reply({ content: `✅ تم رفع المنع عن ${user}.`, ephemeral: true });
  }
  const entry = await db.getBlacklistEntry(interaction.guildId, user.id);
  return interaction.reply({
    content: entry ? `⛔ ${user} ممنوع.\n**Reason:** ${entry.reason}\n**By:** <@${entry.added_by}>\n**Expires:** ${entry.expires_at ? `<t:${Math.floor(new Date(entry.expires_at).getTime()/1000)}:R>` : "Permanent"}` : `✅ ${user} غير موجود في القائمة السوداء.`,
    ephemeral: true
  });
}

if (interaction.commandName === "ticket-warning") {
  if (!canSupervise(interaction.member)) return interaction.reply({ content: "❌ ليست لديك صلاحية.", ephemeral: true });
  const sub = interaction.options.getSubcommand();
  const user = interaction.options.getUser("user", true);

  if (sub === "add") {
    const reason = interaction.options.getString("reason", true);
    await db.addWarning(interaction.guildId, user.id, reason, interaction.user.id);
    const warnings = await db.getWarnings(interaction.guildId, user.id);

    if (warningAutoBlockThreshold > 0 && warnings.length >= warningAutoBlockThreshold) {
      await db.blacklistUser(
        interaction.guildId,
        user.id,
        `Automatic block: ${warnings.length} ticket warnings`,
        interaction.user.id,
        warningAutoBlockMinutes
      );
      return interaction.reply({
        content: `⚠️ Warning added to ${user}: **${reason}**\n⛔ Automatic ticket block applied for **${warningAutoBlockMinutes} minutes** (${warnings.length} warnings).`,
        ephemeral: true
      });
    }

    return interaction.reply({ content: `⚠️ Warning added to ${user}: **${reason}**`, ephemeral: true });
  }
  const warnings = await db.getWarnings(interaction.guildId, user.id);
  const body = warnings.length
    ? warnings.map((w, i) => `**${i+1}.** ${w.reason} — <@${w.added_by}> — <t:${Math.floor(new Date(w.created_at).getTime()/1000)}:d>`).join("\n").slice(0, 3900)
    : "No warnings.";
  return interaction.reply({
    embeds: [new EmbedBuilder().setTitle(`⚠️ Ticket Warnings • ${user.username}`).setDescription(body).setTimestamp()],
    ephemeral: true
  });
}

  if (interaction.commandName === "ticket-close") {
    const ticket = await db.getTicketByChannel(interaction.channelId);
    if (!ticket) {
      return interaction.reply({
        content: "❌ هذه القناة ليست تذكرة.",
        ephemeral: true
      });
    }

    const reason = interaction.options.getString("reason", true);
    return executeClose(interaction, ticket, reason);
  }
}

module.exports = { commands, handleCommand };
