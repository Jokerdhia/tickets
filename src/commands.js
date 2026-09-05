const {
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");

const {
  panelAdminRoleIds,
  ticketTypes,
  robberyConfig,
  supervisorRoleIds
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
    .setDescription("إحصائيات التذاكر"),

  new SlashCommandBuilder()
    .setName("ticket-blacklist")
    .setDescription("إدارة منع استخدام نظام التذاكر")
    .addSubcommand(sub =>
      sub.setName("add").setDescription("إضافة مستخدم للقائمة السوداء")
        .addUserOption(o => o.setName("user").setDescription("المستخدم").setRequired(true))
        .addStringOption(o => o.setName("reason").setDescription("السبب").setRequired(true).setMaxLength(500))
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
  return member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    supervisorRoleIds.some(id => member.roles.cache.has(id));
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
  const rows = await db.getGuildStats(interaction.guildId);
  const body = rows.length ? rows.map(r => `• **${r.ticket_type} / ${r.status}:** ${r.count}`).join("\n") : "لا توجد بيانات.";
  return interaction.reply({
    embeds: [new EmbedBuilder().setTitle("📊 Ticket Statistics").setDescription(body).setTimestamp()],
    ephemeral: true
  });
}

if (interaction.commandName === "ticket-blacklist") {
  if (!canSupervise(interaction.member)) return interaction.reply({ content: "❌ ليست لديك صلاحية.", ephemeral: true });
  const sub = interaction.options.getSubcommand();
  const user = interaction.options.getUser("user", true);

  if (sub === "add") {
    const reason = interaction.options.getString("reason", true);
    await db.blacklistUser(interaction.guildId, user.id, reason, interaction.user.id);
    return interaction.reply({ content: `⛔ ${user} تم منعه من فتح التذاكر.\n**Reason:** ${reason}`, ephemeral: true });
  }
  if (sub === "remove") {
    await db.unblacklistUser(interaction.guildId, user.id);
    return interaction.reply({ content: `✅ تم رفع المنع عن ${user}.`, ephemeral: true });
  }
  const entry = await db.getBlacklistEntry(interaction.guildId, user.id);
  return interaction.reply({
    content: entry ? `⛔ ${user} ممنوع.\n**Reason:** ${entry.reason}\n**By:** <@${entry.added_by}>` : `✅ ${user} غير موجود في القائمة السوداء.`,
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
