const {
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");

const {
  panelAdminRoleIds,
  ticketTypes
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
    .setDescription("Publier le panneau de création de tickets"),

  new SlashCommandBuilder()
    .setName("ticket-info")
    .setDescription("Afficher les informations du ticket courant"),

  new SlashCommandBuilder()
    .setName("ticket-close")
    .setDescription("Fermer le ticket courant")
    .addStringOption(option =>
      option
        .setName("motif")
        .setDescription("Motif de fermeture")
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
        content: "❌ Tu n'as pas la permission de publier le panneau.",
        ephemeral: true
      });
    }

    await interaction.channel.send({
      embeds: [createPanelEmbed()],
      components: createPanelRows()
    });

    return interaction.reply({
      content: "✅ Panneau de tickets publié.",
      ephemeral: true
    });
  }

  if (interaction.commandName === "ticket-info") {
    const ticket = await db.getTicketByChannel(interaction.channelId);
    if (!ticket) {
      return interaction.reply({
        content: "❌ Ce salon n'est pas un ticket.",
        ephemeral: true
      });
    }

    const type = ticketTypes[ticket.ticket_type];
    const embed = new EmbedBuilder()
      .setTitle(`🎫 Ticket #${ticket.id}`)
      .addFields(
        { name: "Type", value: type?.label || ticket.ticket_type, inline: true },
        { name: "Statut", value: ticket.status, inline: true },
        { name: "Propriétaire", value: `<@${ticket.owner_id}>`, inline: true },
        { name: "Pris par", value: ticket.claimed_by ? `<@${ticket.claimed_by}>` : "Non assigné", inline: true },
        { name: "Créé", value: `<t:${Math.floor(new Date(ticket.created_at).getTime() / 1000)}:R>`, inline: true }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (interaction.commandName === "ticket-close") {
    const ticket = await db.getTicketByChannel(interaction.channelId);
    if (!ticket) {
      return interaction.reply({
        content: "❌ Ce salon n'est pas un ticket.",
        ephemeral: true
      });
    }

    const reason = interaction.options.getString("motif", true);
    return executeClose(interaction, ticket, reason);
  }
}

module.exports = { commands, handleCommand };
