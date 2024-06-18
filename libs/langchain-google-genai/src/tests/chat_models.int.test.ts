import { test } from "@jest/globals";
import * as fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { FunctionDeclarationSchemaType } from "@google/generative-ai";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ChatGoogleGenerativeAI } from "../chat_models.js";
import { removeAdditionalProperties } from "../utils/zod_to_genai_parameters.js";

const dummyToolResponse = `[{"title":"Weather in New York City","url":"https://www.weatherapi.com/","content":"{'location': {'name': 'New York', 'region': 'New York', 'country': 'United States of America', 'lat': 40.71, 'lon': -74.01, 'tz_id': 'America/New_York', 'localtime_epoch': 1718659486, 'localtime': '2024-06-17 17:24'}, 'current': {'last_updated_epoch': 1718658900, 'last_updated': '2024-06-17 17:15', 'temp_c': 27.8, 'temp_f': 82.0, 'is_day': 1, 'condition': {'text': 'Partly cloudy', 'icon': '//cdn.weatherapi.com/weather/64x64/day/116.png', 'code': 1003}, 'wind_mph': 2.2, 'wind_kph': 3.6, 'wind_degree': 159, 'wind_dir': 'SSE', 'pressure_mb': 1021.0, 'pressure_in': 30.15, 'precip_mm': 0.0, 'precip_in': 0.0, 'humidity': 58, 'cloud': 25, 'feelslike_c': 29.0, 'feelslike_f': 84.2, 'windchill_c': 26.9, 'windchill_f': 80.5, 'heatindex_c': 27.9, 'heatindex_f': 82.2, 'dewpoint_c': 17.1, 'dewpoint_f': 62.8, 'vis_km': 16.0, 'vis_miles': 9.0, 'uv': 7.0, 'gust_mph': 18.3, 'gust_kph': 29.4}}","score":0.98192,"raw_content":null},{"title":"New York, NY Monthly Weather | AccuWeather","url":"https://www.accuweather.com/en/us/new-york/10021/june-weather/349727","content":"Get the monthly weather forecast for New York, NY, including daily high/low, historical averages, to help you plan ahead.","score":0.97504,"raw_content":null}]`;

test("Test Google AI", async () => {
  const model = new ChatGoogleGenerativeAI({});
  const res = await model.invoke("what is 1 + 1?");
  console.log({ res });
  expect(res).toBeTruthy();
});

test("Test Google AI generation", async () => {
  const model = new ChatGoogleGenerativeAI({});
  const res = await model.generate([
    [["human", `Translate "I love programming" into Korean.`]],
  ]);
  console.log(JSON.stringify(res, null, 2));
  expect(res).toBeTruthy();
});

test("Test Google AI generation with a stop sequence", async () => {
  const model = new ChatGoogleGenerativeAI({
    stopSequences: ["two", "2"],
  });
  const res = await model.invoke([
    ["human", `What are the first three positive whole numbers?`],
  ]);
  console.log(JSON.stringify(res, null, 2));
  expect(res).toBeTruthy();
  expect(res.additional_kwargs.finishReason).toBe("STOP");
  expect(res.content).not.toContain("2");
  expect(res.content).not.toContain("two");
});

test("Test Google AI generation with a system message", async () => {
  const model = new ChatGoogleGenerativeAI({});
  const res = await model.generate([
    [
      ["system", `You are an amazing translator.`],
      ["human", `Translate "I love programming" into Korean.`],
    ],
  ]);
  console.log(JSON.stringify(res, null, 2));
  expect(res).toBeTruthy();
});

test("Test Google AI multimodal generation", async () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const imageData = (
    await fs.readFile(path.join(__dirname, "/data/hotdog.jpg"))
  ).toString("base64");
  const model = new ChatGoogleGenerativeAI({
    modelName: "gemini-pro-vision",
  });
  const res = await model.invoke([
    new HumanMessage({
      content: [
        {
          type: "text",
          text: "Describe the following image:",
        },
        {
          type: "image_url",
          image_url: `data:image/png;base64,${imageData}`,
        },
      ],
    }),
  ]);
  console.log(JSON.stringify(res, null, 2));
  expect(res).toBeTruthy();
});

test("Test Google AI handleLLMNewToken callback", async () => {
  const model = new ChatGoogleGenerativeAI({});
  let tokens = "";
  const res = await model.call(
    [new HumanMessage("what is 1 + 1?")],
    undefined,
    [
      {
        handleLLMNewToken(token: string) {
          tokens += token;
        },
      },
    ]
  );
  console.log({ tokens });
  const responseContent = typeof res.content === "string" ? res.content : "";
  expect(tokens).toBe(responseContent);
});

test("Test Google AI handleLLMNewToken callback with streaming", async () => {
  const model = new ChatGoogleGenerativeAI({});
  let tokens = "";
  const res = await model.stream([new HumanMessage("what is 1 + 1?")], {
    callbacks: [
      {
        handleLLMNewToken(token: string) {
          tokens += token;
        },
      },
    ],
  });
  console.log({ tokens });
  let responseContent = "";
  for await (const streamItem of res) {
    responseContent += streamItem.content;
  }
  console.log({ tokens });
  expect(tokens).toBe(responseContent);
});

test("Test Google AI in streaming mode", async () => {
  const model = new ChatGoogleGenerativeAI({ streaming: true });
  let tokens = "";
  let nrNewTokens = 0;
  const res = await model.invoke([new HumanMessage("Write a haiku?")], {
    callbacks: [
      {
        handleLLMNewToken(token: string) {
          nrNewTokens += 1;
          tokens += token;
        },
      },
    ],
  });
  console.log({ tokens, nrNewTokens });
  expect(nrNewTokens > 1).toBe(true);
  expect(res.content).toBe(tokens);
});

async function fileToBase64(filePath: string): Promise<string> {
  const fileData = await fs.readFile(filePath);
  const base64String = Buffer.from(fileData).toString("base64");
  return base64String;
}

test.skip("Gemini can understand audio", async () => {
  // Update this with the correct path to an audio file on your machine.
  const audioPath =
    "/Users/bracesproul/code/lang-chain-ai/langchainjs/libs/langchain-google-gauth/src/tests/data/audio.mp3";
  const audioMimeType = "audio/mp3";

  const model = new ChatGoogleGenerativeAI({
    model: "gemini-1.5-pro-latest",
    temperature: 0,
  });

  const audioBase64 = await fileToBase64(audioPath);

  const prompt = ChatPromptTemplate.fromMessages([
    new MessagesPlaceholder("audio"),
  ]);

  const chain = prompt.pipe(model);
  const response = await chain.invoke({
    audio: new HumanMessage({
      content: [
        {
          type: "media",
          mimeType: audioMimeType,
          data: audioBase64,
        },
        {
          type: "text",
          text: "Summarize the content in this audio. ALso, what is the speaker's tone?",
        },
      ],
    }),
  });

  console.log(response.content);
  expect(typeof response.content).toBe("string");
  expect((response.content as string).length).toBeGreaterThan(15);
});

class FakeBrowserTool extends StructuredTool {
  schema = z.object({
    url: z.string(),
    query: z.string().optional(),
  });

  name = "fake_browser_tool";

  description =
    "useful for when you need to find something on the web or summarize a webpage.";

  async _call(_: z.infer<this["schema"]>): Promise<string> {
    return "fake_browser_tool";
  }
}
const googleGenAITool = {
  functionDeclarations: [
    {
      name: "fake_browser_tool",
      description:
        "useful for when you need to find something on the web or summarize a webpage.",
      parameters: {
        type: FunctionDeclarationSchemaType.OBJECT,
        required: ["url"],
        properties: {
          url: {
            type: FunctionDeclarationSchemaType.STRING,
          },
          query: {
            type: FunctionDeclarationSchemaType.STRING,
          },
        },
      },
    },
  ],
};
const prompt = new HumanMessage(
  "Search the web and tell me what the weather will be like tonight in new york. use weather.com"
);

test("ChatGoogleGenerativeAI can bind and invoke langchain tools", async () => {
  const model = new ChatGoogleGenerativeAI({});

  const modelWithTools = model.bind({
    tools: [new FakeBrowserTool()],
  });
  const res = await modelWithTools.invoke([prompt]);
  const toolCalls = res.tool_calls;
  console.log(toolCalls);
  expect(toolCalls).toBeDefined();
  if (!toolCalls) {
    throw new Error("tool_calls not in response");
  }
  expect(toolCalls.length).toBe(1);
  expect(toolCalls[0].name).toBe("fake_browser_tool");
  expect("url" in toolCalls[0].args).toBe(true);
});

test("ChatGoogleGenerativeAI can bind and stream langchain tools", async () => {
  const model = new ChatGoogleGenerativeAI({
    model: "gemini-1.5-pro",
  });

  const modelWithTools = model.bind({
    tools: [new FakeBrowserTool()],
  });
  let finalChunk: AIMessageChunk | undefined;
  for await (const chunk of await modelWithTools.stream([prompt])) {
    if (!finalChunk) {
      finalChunk = chunk;
    } else {
      finalChunk = finalChunk.concat(chunk);
    }
  }
  if (!finalChunk) {
    throw new Error("finalChunk is undefined");
  }
  const toolCalls = finalChunk.tool_calls;
  console.log(toolCalls);
  expect(toolCalls).toBeDefined();
  if (!toolCalls) {
    throw new Error("tool_calls not in response");
  }
  expect(toolCalls.length).toBe(1);
  expect(toolCalls[0].name).toBe("fake_browser_tool");
  expect("url" in toolCalls[0].args).toBe(true);
});

test("ChatGoogleGenerativeAI can handle streaming tool messages.", async () => {
  const model = new ChatGoogleGenerativeAI({
    model: "gemini-1.5-pro",
    maxRetries: 1,
  });

  const browserTool = new FakeBrowserTool();

  const modelWithTools = model.bind({
    tools: [browserTool],
  });
  let finalChunk: AIMessageChunk | undefined;
  const fullPrompt = [
    new SystemMessage(
      "You are a helpful assistant. If the chat history contains the tool results, you should use that and not call the tool again."
    ),
    prompt,
    new AIMessage({
      content: "",
      tool_calls: [
        {
          name: browserTool.name,
          args: {
            query: "weather tonight new york",
            url: "https://weather.com",
          },
        },
      ],
    }),
    new ToolMessage(dummyToolResponse, "id", browserTool.name),
  ];
  for await (const chunk of await modelWithTools.stream(fullPrompt)) {
    if (!finalChunk) {
      finalChunk = chunk;
    } else {
      finalChunk = finalChunk.concat(chunk);
    }
  }
  if (!finalChunk) {
    throw new Error("finalChunk is undefined");
  }
  expect(typeof finalChunk.content).toBe("string");
  expect(finalChunk.content.length).toBeGreaterThan(1);
  expect(finalChunk.tool_calls).toHaveLength(0);
});

test("ChatGoogleGenerativeAI can handle invoking tool messages.", async () => {
  const model = new ChatGoogleGenerativeAI({
    model: "gemini-1.5-pro",
    maxRetries: 1,
  });

  const browserTool = new FakeBrowserTool();

  const modelWithTools = model.bind({
    tools: [browserTool],
  });
  const fullPrompt = [
    new SystemMessage(
      "You are a helpful assistant. If the chat history contains the tool results, you should use that and not call the tool again."
    ),
    prompt,
    new AIMessage({
      content: "",
      tool_calls: [
        {
          name: browserTool.name,
          args: {
            query: "weather tonight new york",
            url: "https://weather.com",
          },
        },
      ],
    }),
    new ToolMessage(dummyToolResponse, "id", browserTool.name),
  ];
  const response = await modelWithTools.invoke(fullPrompt);
  console.log(response);
  expect(typeof response.content).toBe("string");
  expect(response.content.length).toBeGreaterThan(1);
  expect(response.tool_calls).toHaveLength(0);
});

test("ChatGoogleGenerativeAI can bind and invoke genai tools", async () => {
  const model = new ChatGoogleGenerativeAI({});

  const modelWithTools = model.bind({
    tools: [googleGenAITool],
  });
  const res = await modelWithTools.invoke([prompt]);
  const toolCalls = res.tool_calls;
  console.log(toolCalls);
  expect(toolCalls).toBeDefined();
  if (!toolCalls) {
    throw new Error("tool_calls not in response");
  }
  expect(toolCalls.length).toBe(1);
  expect(toolCalls[0].name).toBe("fake_browser_tool");
  expect("url" in toolCalls[0].args).toBe(true);
});

test("ChatGoogleGenerativeAI can bindTools with langchain tools and invoke", async () => {
  const model = new ChatGoogleGenerativeAI({});

  const modelWithTools = model.bindTools([new FakeBrowserTool()]);
  const res = await modelWithTools.invoke([prompt]);
  const toolCalls = res.tool_calls;
  console.log(toolCalls);
  expect(toolCalls).toBeDefined();
  if (!toolCalls) {
    throw new Error("tool_calls not in response");
  }
  expect(toolCalls.length).toBe(1);
  expect(toolCalls[0].name).toBe("fake_browser_tool");
  expect("url" in toolCalls[0].args).toBe(true);
});

test("ChatGoogleGenerativeAI can bindTools with genai tools and invoke", async () => {
  const model = new ChatGoogleGenerativeAI({});

  const modelWithTools = model.bindTools([googleGenAITool]);
  const res = await modelWithTools.invoke([prompt]);
  const toolCalls = res.tool_calls;
  console.log(toolCalls);
  expect(toolCalls).toBeDefined();
  if (!toolCalls) {
    throw new Error("tool_calls not in response");
  }
  expect(toolCalls.length).toBe(1);
  expect(toolCalls[0].name).toBe("fake_browser_tool");
  expect("url" in toolCalls[0].args).toBe(true);
});

test("ChatGoogleGenerativeAI can call withStructuredOutput langchain tools and invoke", async () => {
  const model = new ChatGoogleGenerativeAI({});
  const tool = new FakeBrowserTool();

  const modelWithTools = model.withStructuredOutput<
    z.infer<typeof tool.schema>
  >(tool.schema);
  const res = await modelWithTools.invoke([prompt]);
  console.log(res);
  expect(typeof res.url === "string").toBe(true);
});

test("ChatGoogleGenerativeAI can call withStructuredOutput genai tools and invoke", async () => {
  const model = new ChatGoogleGenerativeAI({});

  type GeminiTool = {
    url: string;
    query?: string;
  };

  const modelWithTools = model.withStructuredOutput<GeminiTool>(
    googleGenAITool.functionDeclarations[0].parameters
  );
  const res = await modelWithTools.invoke([prompt]);
  console.log(res);
  expect(typeof res.url === "string").toBe(true);
});

test("Stream token count usage_metadata", async () => {
  const model = new ChatGoogleGenerativeAI({
    temperature: 0,
  });
  let res: AIMessageChunk | null = null;
  for await (const chunk of await model.stream(
    "Why is the sky blue? Be concise."
  )) {
    if (!res) {
      res = chunk;
    } else {
      res = res.concat(chunk);
    }
  }
  console.log(res);
  expect(res?.usage_metadata).toBeDefined();
  if (!res?.usage_metadata) {
    return;
  }
  expect(res.usage_metadata.input_tokens).toBe(10);
  expect(res.usage_metadata.output_tokens).toBeGreaterThan(10);
  expect(res.usage_metadata.total_tokens).toBe(
    res.usage_metadata.input_tokens + res.usage_metadata.output_tokens
  );
});

test("streamUsage excludes token usage", async () => {
  const model = new ChatGoogleGenerativeAI({
    temperature: 0,
    streamUsage: false,
  });
  let res: AIMessageChunk | null = null;
  for await (const chunk of await model.stream(
    "Why is the sky blue? Be concise."
  )) {
    if (!res) {
      res = chunk;
    } else {
      res = res.concat(chunk);
    }
  }
  console.log(res);
  expect(res?.usage_metadata).not.toBeDefined();
});

test("Invoke token count usage_metadata", async () => {
  const model = new ChatGoogleGenerativeAI({
    temperature: 0,
  });
  const res = await model.invoke("Why is the sky blue? Be concise.");
  console.log(res);
  expect(res?.usage_metadata).toBeDefined();
  if (!res?.usage_metadata) {
    return;
  }
  expect(res.usage_metadata.input_tokens).toBe(10);
  expect(res.usage_metadata.output_tokens).toBeGreaterThan(10);
  expect(res.usage_metadata.total_tokens).toBe(
    res.usage_metadata.input_tokens + res.usage_metadata.output_tokens
  );
});

test("removeAdditionalProperties can remove all instances of additionalProperties", async () => {
  function extractKeys(obj: Record<string, any>, keys: string[] = []) {
    for (const key in obj) {
      keys.push(key);
      if (typeof obj[key] === "object" && obj[key] !== null) {
        extractKeys(obj[key], keys);
      }
    }
    return keys;
  }

  const idealResponseSchema = z.object({
    idealResponse: z
      .string()
      .optional()
      .describe("The ideal response to the question"),
  });
  const questionSchema = z.object({
    question: z.string().describe("Question text"),
    type: z.enum(["singleChoice", "multiChoice"]).describe("Question type"),
    options: z.array(z.string()).describe("List of possible answers"),
    correctAnswer: z
      .string()
      .optional()
      .describe("correct answer from the possible answers"),
    idealResponses: z
      .array(idealResponseSchema)
      .describe("Array of ideal responses to the question"),
  });

  const schema = z.object({
    questions: z.array(questionSchema).describe("Array of question objects"),
  });

  const parsedSchemaArr = removeAdditionalProperties(zodToJsonSchema(schema));
  const arrSchemaKeys = extractKeys(parsedSchemaArr);
  expect(
    arrSchemaKeys.find((key) => key === "additionalProperties")
  ).toBeUndefined();
  const parsedSchemaObj = removeAdditionalProperties(zodToJsonSchema(schema));
  const arrSchemaObj = extractKeys(parsedSchemaObj);
  expect(
    arrSchemaObj.find((key) => key === "additionalProperties")
  ).toBeUndefined();
});
