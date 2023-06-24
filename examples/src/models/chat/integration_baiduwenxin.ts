import {
  ChatBaiduWenxin,
  WenxinModelName,
} from "langchain/chat_models/baiduwenxin";
import { HumanChatMessage } from "langchain/schema";

// Default model is ERNIE-Bot-turbo
const ernieTurbo = new ChatBaiduWenxin({
  baiduErnieApiKey: "YOUR-API-KEY", // In Node.js defaults to process.env.BAIDU_ERNIE_API_KEY
  baiduErnieSecretKey: "YOUR-SECRET-KEY", // In Node.js defaults to process.env.BAIDU_ERNIE_SECRET_KEY
});

// Use ERNIE-Bot
const ernie = new ChatBaiduWenxin({
  modelName: WenxinModelName.ERNIE_BOT,
  temperature: 1, // Only ERNIE-Bot supports temperature
  baiduErnieApiKey: "YOUR-API-KEY", // In Node.js defaults to process.env.BAIDU_ERNIE_API_KEY
  baiduErnieSecretKey: "YOUR-SECRET-KEY", // In Node.js defaults to process.env.BAIDU_ERNIE_SECRET_KEY
});


const messages = [new HumanChatMessage("Hello")];

let res = await ernieTurbo.call(messages);
/*
AIChatMessage {
  text: 'Hello! How may I assist you today?',
  name: undefined,
  additional_kwargs: {}
  }
}
*/

res = await ernie.call(messages);
/*
AIChatMessage {
  text: 'Hello! How may I assist you today?',
  name: undefined,
  additional_kwargs: {}
  }
}
*/
