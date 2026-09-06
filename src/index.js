require("dotenv").config();

const http = require("http");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes
} = require("discord.js");

const db = require("./db");
const { initDb } = db;
const { commands, handleCommand } = require("./commands");
const {
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
  addInternalNote
} = require("./tickets");

const requiredEnv = [
  "DISCORD_TOKEN",
  "CLIENT_ID",
  "GUILD_ID",
  "DATABASE_URL"
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`❌ Variable manquante : ${key}`);
    process.exit(1);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );

  console.log(`✅ ${commands.length} commandes slash synchronisées.`);
}




async function escalateUnclaimedTickets() {
  try {
    const { unclaimedEscalationMinutes, ticketTypes, robberyConfig } = require("./config");
    if (!unclaimedEscalationMinutes || unclaimedEscalationMinutes <= 0) return;

    const pending = await db.getTicketsForEscalation(unclaimedEscalationMinutes);
    for (const ticket of pending) {
      const guild = client.guilds.cache.get(ticket.guild_id);
      const channel = guild?.channels.cache.get(ticket.channel_id);
      if (!channel?.isTextBased()) continue;

      const roleIds = ticket.ticket_type === "robbery"
        ? robberyConfig.staffRoleIds
        : (ticketTypes[ticket.ticket_type]?.staffRoleIds || []);

      const mentions = roleIds.map(id => `<@&${id}>`).join(" ");
      await channel.send({
        content: `${mentions} <@${ticket.owner_id}>`.trim(),
        embeds: [{
          title: "🚨 Ticket Escalation",
          description: `هذه التذكرة لم يتم استلامها منذ أكثر من **${unclaimedEscalationMinutes} دقيقة**.`,
          timestamp: new Date().toISOString()
        }],
        allowedMentions: { roles: roleIds, users: [ticket.owner_id] }
      }).catch(() => {});
      await db.markEscalated(ticket.id);
    }
  } catch (error) {
    console.error("Erreur escalation tickets:", error);
  }
}

async function sendRobberyReminders() {
  try {
    const tickets = await db.getRobberiesNeedingReminders();
    const now = Date.now();

    for (const ticket of tickets) {
      const deadline = new Date(ticket.robbery_deadline).getTime();
      const remainingMin = (deadline - now) / 60000;
      const guild = client.guilds.cache.get(ticket.guild_id);
      const channel = guild?.channels.cache.get(ticket.channel_id);
      if (!channel?.isTextBased()) continue;

      if (!ticket.reminder_10_sent && remainingMin <= 10 && remainingMin > 5) {
        await channel.send({
          content: `<@${ticket.owner_id}>`,
          allowedMentions: { users: [ticket.owner_id] },
          embeds: [{
            title: "⏰ 20 Minutes Used — 10 Minutes Left",
            description: "تبقى **10 دقائق** فقط لإرسال **Request Arrival** والحصول على تأكيد الشرطة.",
            timestamp: new Date().toISOString()
          }]
        }).catch(() => {});
        await db.markReminderSent(ticket.id, 10);
      }

      if (!ticket.reminder_5_sent && remainingMin <= 5 && remainingMin > 2) {
        await channel.send({
          content: `<@${ticket.owner_id}>`,
          allowedMentions: { users: [ticket.owner_id] },
          embeds: [{
            title: "🚨 25 Minutes Used — 5 Minutes Left",
            description: "تبقى **5 دقائق** فقط. يجب أن يكون جميع المشاركين في الموقع وأن تؤكد الشرطة الوصول قبل انتهاء المهلة.",
            timestamp: new Date().toISOString()
          }]
        }).catch(() => {});
        await db.markReminderSent(ticket.id, 5);
      }

      if (!ticket.reminder_2_sent && remainingMin <= 2 && remainingMin > 0) {
        await channel.send({
          content: `<@${ticket.owner_id}>`,
          allowedMentions: { users: [ticket.owner_id] },
          embeds: [{
            title: "🚨 FINAL WARNING — 2 Minutes Left",
            description: "تبقت **دقيقتان فقط**. بدون **Confirm Arrival** من الشرطة قبل انتهاء 30 دقيقة سيتم إلغاء العملية تلقائياً.",
            timestamp: new Date().toISOString()
          }]
        }).catch(() => {});
        await db.markReminderSent(ticket.id, 2);
      }
    }
  } catch (error) {
    console.error("Erreur rappels braquages:", error);
  }
}

async function expireRobberyTickets() {
  try {
    const expired = await db.getExpiredRobberyTickets();

    for (const ticket of expired) {
      const guild = client.guilds.cache.get(ticket.guild_id);
      if (!guild) continue;

      const channel = guild.channels.cache.get(ticket.channel_id);
      if (!channel?.isTextBased()) {
        await db.closeTicket(ticket.id, client.user.id, "Délai de 30 minutes dépassé.");
        continue;
      }

      await channel.send({
        content: `<@${ticket.owner_id}>`,
        allowedMentions: { users: [ticket.owner_id] },
        embeds: [{
          title: "❌ Braquage annulé",
          description:
            "Le délai de **30 minutes** après l'acceptation par la police est dépassé.\n\n" +
            "L'arrivée de tous les participants n'a pas été confirmée par la police à temps.\n" +
            "**Le braquage est annulé et ce ticket va être fermé automatiquement.**",
          timestamp: new Date().toISOString()
        }]
      }).catch(() => {});

      await db.closeTicket(ticket.id, client.user.id, "Délai de 30 minutes dépassé — braquage annulé.");

      setTimeout(() => {
        channel.delete("Braquage annulé : délai de 30 minutes dépassé").catch(() => {});
      }, 5000);
    }
  } catch (error) {
    console.error("Erreur expiration braquages:", error);
  }
}

client.once("ready", async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  console.log(`✅ Serveurs : ${client.guilds.cache.size}`);
  await expireRobberyTickets();
  await sendRobberyReminders();
  await escalateUnclaimedTickets();
  setInterval(expireRobberyTickets, 60 * 1000);
  setInterval(sendRobberyReminders, 60 * 1000);
  setInterval(escalateUnclaimedTickets, 60 * 1000);
});

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      return await handleCommand(interaction);
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith("ticket_create:")) {
        const typeKey = interaction.customId.split(":")[1];
        return await createTicket(interaction, typeKey);
      }

      if (interaction.customId === "ticket_robbery") {
        return await showRobberyMenu(interaction);
      }

      const ticket = await getCurrentTicket(interaction);

      if (!ticket || ticket.status !== "open") {
        return interaction.reply({
          content: "❌ Ce salon n'est pas un ticket ouvert.",
          ephemeral: true
        });
      }

      if (interaction.customId === "ticket_claim") {
        return await claimTicket(interaction, ticket);
      }

      if (interaction.customId === "ticket_unclaim") {
        return await unclaimTicket(interaction, ticket);
      }

      if (interaction.customId === "ticket_add_member") {
        if (!canManageTicket(interaction.member, ticket)) {
          return interaction.reply({
            content: "❌ Tu n'as pas la permission de gérer les membres.",
            ephemeral: true
          });
        }
        return interaction.showModal(memberModal("add"));
      }

      if (interaction.customId === "ticket_remove_member") {
        if (!canManageTicket(interaction.member, ticket)) {
          return interaction.reply({
            content: "❌ Tu n'as pas la permission de gérer les membres.",
            ephemeral: true
          });
        }
        return interaction.showModal(memberModal("remove"));
      }

      if (interaction.customId === "ticket_transfer") {
        if (!canManageTicket(interaction.member, ticket)) {
          return interaction.reply({ content: "❌ ليست لديك صلاحية نقل التذكرة.", ephemeral: true });
        }
        return interaction.showModal(transferModal());
      }

      if (interaction.customId === "ticket_note") {
        if (!canManageTicket(interaction.member, ticket)) {
          return interaction.reply({ content: "❌ ليست لديك صلاحية إضافة ملاحظة.", ephemeral: true });
        }
        return interaction.showModal(noteModal());
      }

      if (interaction.customId === "robbery_accept") {
        return await acceptRobbery(interaction, ticket);
      }

      if (interaction.customId === "robbery_refuse") {
        if (!canManageTicket(interaction.member, ticket)) {
          return interaction.reply({
            content: "❌ ليست لديك صلاحية رفض العملية.",
            ephemeral: true
          });
        }
        return interaction.showModal(robberyRefuseModal());
      }

      if (interaction.customId === "robbery_request_arrival") {
        return await requestRobberyArrival(interaction, ticket);
      }

      if (interaction.customId === "robbery_confirm_arrival") {
        return await confirmRobberyArrival(interaction, ticket);
      }

      if (interaction.customId === "robbery_reject_arrival") {
        return await rejectRobberyArrival(interaction, ticket);
      }

      if (interaction.customId === "ticket_close") {
        if (!canCloseTicket(interaction.member, ticket)) {
          return interaction.reply({
            content: "❌ Tu n'as pas la permission de fermer ce ticket.",
            ephemeral: true
          });
        }
        return interaction.showModal(closeModal());
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "robbery_select") {
        return interaction.showModal(robberyRequestModal(interaction.values[0]));
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === "ticket_transfer_modal") {
        const ticket = await getCurrentTicket(interaction);
        if (!ticket || ticket.status !== "open") {
          return interaction.reply({ content: "❌ هذه التذكرة ليست مفتوحة.", ephemeral: true });
        }
        const userId = interaction.fields.getTextInputValue("user_id").trim();
        return await transferTicket(interaction, ticket, userId);
      }

      if (interaction.customId === "ticket_note_modal") {
        const ticket = await getCurrentTicket(interaction);
        if (!ticket || ticket.status !== "open") {
          return interaction.reply({ content: "❌ هذه التذكرة ليست مفتوحة.", ephemeral: true });
        }
        const note = interaction.fields.getTextInputValue("note").trim();
        return await addInternalNote(interaction, ticket, note);
      }

      if (interaction.customId === "robbery_refuse_modal") {
        const ticket = await getCurrentTicket(interaction);
        if (!ticket || ticket.status !== "open") {
          return interaction.reply({ content: "❌ هذه التذكرة ليست مفتوحة.", ephemeral: true });
        }
        const reason = interaction.fields.getTextInputValue("refusal_reason");
        return await refuseRobbery(interaction, ticket, reason);
      }

      if (interaction.customId.startsWith("robbery_request_modal:")) {
        const robberyKey = interaction.customId.split(":")[1];

        return await createRobberyTicket(interaction, robberyKey, {
          groupName: interaction.fields.getTextInputValue("group_name"),
          criminalCount: interaction.fields.getTextInputValue("criminal_count"),
          guns: interaction.fields.getTextInputValue("guns")
        });
      }

      const ticket = await getCurrentTicket(interaction);

      if (!ticket || ticket.status !== "open") {
        return interaction.reply({
          content: "❌ Ce salon n'est pas un ticket ouvert.",
          ephemeral: true
        });
      }

      if (interaction.customId.startsWith("ticket_member_modal:")) {
        const action = interaction.customId.split(":")[1];
        return await handleMemberModal(interaction, action, ticket);
      }

      if (interaction.customId === "ticket_close_modal") {
        const reason = interaction.fields.getTextInputValue("reason");
        return await executeClose(interaction, ticket, reason);
      }
    }
  } catch (error) {
    console.error("Erreur interaction:", error);

    const payload = {
      content: "❌ Une erreur interne est survenue. Vérifie les logs du bot.",
      ephemeral: true
    };

    if (interaction.deferred) {
      await interaction.editReply(payload).catch(() => {});
    } else if (interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

client.on("error", console.error);
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const port = Number(process.env.PORT || 10000);
http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      ok: true,
      discord: client.isReady(),
      uptime: Math.floor(process.uptime())
    }));
  }

  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("HMPD Ticket Bot is running.");
}).listen(port, "0.0.0.0", () => {
  console.log(`✅ HTTP : 0.0.0.0:${port}`);
});

(async () => {
  try {
    await initDb();
    await registerCommands();
    await client.login(process.env.DISCORD_TOKEN);
  } catch (error) {
    console.error("❌ Démarrage impossible :", error);
    process.exit(1);
  }
})();
