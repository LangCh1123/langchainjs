import {
  DiscordGetMessagesTool,
  DiscordChannelSearchTool,
  DiscordSendMessagesTool,
  DiscordGetGuildsTool,
  DiscordGetTextChannelsTool,
} from "langchain/tools/discord";

export async function run() {
  //Get messages from a channel given channel ID
  const getMessageTool = new DiscordGetMessagesTool();
  const messageResults = await getMessageTool.call("1153400523718938780");
  console.log(messageResults);

  //Get guilds/servers
  const getGuildsTool = new DiscordGetGuildsTool();
  const guildResults = await getGuildsTool.call();
  console.log(guildResults);

  //Search results in a given channel (case-insensitive)
  const searchTool = new DiscordChannelSearchTool("1153400523718938780");
  const searchResults = await searchTool.call("Test");
  console.log(searchResults);

  //Get all text channels of a server
  const getChannelsTool = new DiscordGetTextChannelsTool();
  const channelResults = await getChannelsTool.call("1153400523718938775");
  console.log(channelResults);

  //Send a message 
  const sendMessageTool = new DiscordSendMessagesTool("1153400523718938780");
  const sendMessageResults = await sendMessageTool.call("test message");
  console.log(sendMessageResults);
}
