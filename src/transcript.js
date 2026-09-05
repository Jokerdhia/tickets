const { AttachmentBuilder } = require("discord.js");

function escapeHtml(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fetchAllMessages(channel, limit = 1000) {
  const collected = [];
  let before;

  while (collected.length < limit) {
    const batch = await channel.messages.fetch({
      limit: Math.min(100, limit - collected.length),
      before
    });

    if (!batch.size) break;

    const messages = [...batch.values()];
    collected.push(...messages);
    before = messages[messages.length - 1].id;

    if (batch.size < 100) break;
  }

  return collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

async function buildTranscript(channel, ticket) {
  const messages = await fetchAllMessages(channel);

  const rows = messages.map(message => {
    const date = new Date(message.createdTimestamp).toLocaleString("fr-FR", {
      timeZone: "Europe/Brussels"
    });

    const attachments = [...message.attachments.values()]
      .map(a => `<div class="attachment">📎 <a href="${escapeHtml(a.url)}">${escapeHtml(a.name || "Pièce jointe")}</a></div>`)
      .join("");

    const embeds = message.embeds.map((embed, index) => {
      const fields = (embed.fields || []).map(field =>
        `<div class="embed-field"><strong>${escapeHtml(field.name || "")}</strong><br>${escapeHtml(field.value || "").replaceAll("\n", "<br>")}</div>`
      ).join("");

      const image = embed.image?.url
        ? `<div class="embed-media">🖼️ Image: <a href="${escapeHtml(embed.image.url)}">${escapeHtml(embed.image.url)}</a></div>`
        : "";
      const thumbnail = embed.thumbnail?.url
        ? `<div class="embed-media">🖼️ Thumbnail: <a href="${escapeHtml(embed.thumbnail.url)}">${escapeHtml(embed.thumbnail.url)}</a></div>`
        : "";

      return `<div class="embed-box">
        <div><strong>Embed ${index + 1}</strong></div>
        ${embed.title ? `<div class="embed-title">${escapeHtml(embed.title)}</div>` : ""}
        ${embed.description ? `<div>${escapeHtml(embed.description).replaceAll("\n", "<br>")}</div>` : ""}
        ${embed.url ? `<div>🔗 <a href="${escapeHtml(embed.url)}">${escapeHtml(embed.url)}</a></div>` : ""}
        ${fields}
        ${image}
        ${thumbnail}
        ${embed.footer?.text ? `<div class="embed-footer">${escapeHtml(embed.footer.text)}</div>` : ""}
      </div>`;
    }).join("");

    const reactions = message.reactions.cache.size
      ? `<div class="reactions">${[...message.reactions.cache.values()].map(r => `${escapeHtml(r.emoji.name || "emoji")} × ${r.count}`).join(" • ")}</div>`
      : "";

    const reply = message.reference?.messageId
      ? `<div class="reply">↪ Reply to message ID: ${escapeHtml(message.reference.messageId)}</div>`
      : "";

    return `
      <div class="message">
        <img class="avatar" src="${escapeHtml(message.author.displayAvatarURL({ extension: "png", size: 64 }))}" />
        <div class="body">
          <div class="header">
            <strong>${escapeHtml(message.author.tag || message.author.username)}</strong>
            <span>${escapeHtml(date)}</span>
          </div>
          ${reply}
          <div class="content">${escapeHtml(message.content || "(no text content)").replaceAll("\n", "<br>")}</div>
          ${attachments}
          ${embeds}
          ${reactions}
        </div>
      </div>
    `;
  }).join("\n");

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Ticket #${ticket.id}</title>
<style>
body{font-family:Arial,sans-serif;background:#1e1f22;color:#dbdee1;margin:0;padding:30px}
.container{max-width:1000px;margin:auto}
.summary{background:#2b2d31;padding:18px;border-radius:10px;margin-bottom:20px}
.message{display:flex;gap:12px;padding:12px 4px;border-bottom:1px solid #313338}
.avatar{width:42px;height:42px;border-radius:50%}
.body{flex:1}
.header{display:flex;gap:10px;align-items:baseline}
.header span{font-size:12px;color:#949ba4}
.content{margin-top:5px;white-space:normal;overflow-wrap:anywhere}
.attachment,.embed-note,.reactions,.reply{margin-top:7px;color:#b5bac1}
.embed-box{border-left:4px solid #5865f2;background:#2b2d31;padding:10px 12px;margin-top:8px;border-radius:4px}.embed-title{font-weight:bold;font-size:16px;margin:5px 0}.embed-field{margin-top:8px}.embed-footer{margin-top:8px;font-size:12px;color:#949ba4}.embed-media{margin-top:7px}
a{color:#00a8fc}
</style>
</head>
<body>
<div class="container">
  <div class="summary">
    <h2>Transcript Ticket #${ticket.id}</h2>
    <div>Salon : #${escapeHtml(channel.name)}</div>
    <div>Propriétaire : ${escapeHtml(ticket.owner_id)}</div>
    <div>Type : ${escapeHtml(ticket.ticket_type)}</div>
    <div>Créé : ${escapeHtml(new Date(ticket.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Brussels" }))}</div>
  </div>
  ${rows || "<p>Aucun message.</p>"}
</div>
</body>
</html>`;

  return new AttachmentBuilder(Buffer.from(html, "utf8"), {
    name: `ticket-${ticket.id}-${channel.id}.html`
  });
}

module.exports = { buildTranscript };
