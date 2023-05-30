import { ZepClient, Memory, Message } from "@getzep/zep-js";
import { 
  InputValues,
  OutputValues,
  MemoryVariables,
  getBufferString,
  getInputValue,
} from "./base.js";
import { BaseChatMemory, BaseChatMemoryInput } from "./chat_memory.js";
import { BaseChatMessage, ChatMessage, AIChatMessage, HumanChatMessage } from "../schema/index.js";

export interface ZepMemoryInput extends BaseChatMemoryInput {
  humanPrefix?: string;

  aiPrefix?: string;
  
  memoryKey?: string;
  
  baseURL: string; // Changed from optional to required
  
  sessionID: string; // Changed from optional to required

  lastN?: number;
}

export class ZepMemory extends BaseChatMemory implements ZepMemoryInput {
  humanPrefix = "Human";

  aiPrefix = "AI";

  memoryKey = "history";

  baseURL: string; // Define the baseURL property

  sessionID: string; // Define the sessionID property

  zepClient: ZepClient; // Define the zepClient property

  constructor(fields: ZepMemoryInput) {
    super({
      returnMessages: fields?.returnMessages ?? false,
      inputKey: fields?.inputKey,
      outputKey: fields?.outputKey,
    });

    this.humanPrefix = fields.humanPrefix ?? this.humanPrefix;
    this.aiPrefix = fields.aiPrefix ?? this.aiPrefix;
    this.memoryKey = fields.memoryKey ?? this.memoryKey;
    this.baseURL = fields.baseURL;
    this.sessionID = fields.sessionID;
    this.zepClient = new ZepClient(this.baseURL);
  }

  get memoryKeys() {
    return [this.memoryKey];
  }

  async loadMemoryVariables(_values: InputValues): Promise<MemoryVariables> {
    const lastN = _values.lastN ?? 5;
    const memory = await this.zepClient.getMemory(this.sessionID, lastN);
    let messages: BaseChatMessage[] = [];

    if (memory) {
      messages = memory.messages.map((message) => {
        const { content, role } = message;
        if (role === this.humanPrefix) {
          return new HumanChatMessage(content);
        } else if (role === this.aiPrefix) {
          return new AIChatMessage(content);
        } else {
          // default to generic ChatMessage
          return new ChatMessage(content, role);
        }
      });
    }

    if (this.returnMessages) {
      const result = {
        [this.memoryKey]: messages,
      };
      return result;
    }

    const result = {
      [this.memoryKey]: getBufferString(
        messages,
        this.humanPrefix,
        this.aiPrefix
      ),
    };
    return result;
  }

  async saveContext(
    inputValues: InputValues,
    outputValues: OutputValues
  ): Promise<void> {
    const input = getInputValue(inputValues, this.inputKey);
    const output = getInputValue(outputValues, this.outputKey);

    // Create new Memory and Message instances
    const memory = new Memory({
      messages: [
        new Message({
          role: this.humanPrefix,
          content: `${input}`,
        }),
        new Message({
          role: this.aiPrefix,
          content: `${output}`,
        }),
      ],
    });

    // Add the new memory to the session using the ZepClient
    if (this.sessionID) {
      try {
        await this.zepClient.addMemory(this.sessionID, memory);
      } catch (error) {
        console.error("Error adding memory: ", error);
      }
    }

    // Call the superclass's saveContext method
    await super.saveContext(inputValues, outputValues);
  }

  async clear(): Promise<void> {
    try {
      await this.zepClient.deleteMemory(this.sessionID);
    } catch (error) {
      console.error("Error deleting session: ", error);
    }

    // Clear the superclass's chat history
    await super.clear();
  }
}
