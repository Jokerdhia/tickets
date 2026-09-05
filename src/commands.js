const {
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");

const {
  panelAdminRoleIds,
  ticketTypes,
  robberyConfig
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
].map(command => command.toJSON());

function canPublishPanel(member) {
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    panelAdminRoleIds.some(id => member.roles.cache.has(id))
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
      .setTitle(`🎫 التذكرة #${ticket.id}`)
      .addFields(
        { name: "Type", value: ticket.ticket_type === "robbery"
          ? `Braquage — ${robberyConfig.robberies[ticket.robbery_type]?.label || ticket.robbery_type}`
          : (type?.label || ticket.ticket_type), inline: true },
        { name: "الحالة", value: ticket.status, inline: true },
        { name: "صاحب التذكرة", value: `<@${ticket.owner_id}>`, inline: true },
        { name: "تم استلامها بواسطة", value: ticket.claimed_by ? `<@${ticket.claimed_by}>` : "Non assigné", inline: true },
        { name: "تاريخ الإنشاء", value: `<t:${Math.floor(new Date(ticket.created_at).getTime() / 1000)}:R>`, inline: true }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
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
