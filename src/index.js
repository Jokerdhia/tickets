require("dotenv").config();

const http = require("http");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes
} = require("discord.js");

const { initDb } = require("./db");
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
  createRobberyTicket
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

client.once("ready", async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  console.log(`✅ Serveurs : ${client.guilds.cache.size}`);
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
        return await createRobberyTicket(interaction, interaction.values[0]);
      }
    }

    if (interaction.isModalSubmit()) {
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
