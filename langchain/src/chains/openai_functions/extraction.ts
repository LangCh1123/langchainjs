import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { JsonSchema7ObjectType } from "zod-to-json-schema/src/parsers/object.js";

import { ChatOpenAI } from "../../chat_models/openai.js";
import { PromptTemplate } from "../../prompts/prompt.js";
import { TransformChain } from "../transform.js";
import { SimpleSequentialChain } from "../sequential_chain.js";
import {
  FunctionParameters,
  OpenAIFunctionsChain,
  parseToNamedArgument,
} from "./index.js";

function getExtractionFunctions(schema: FunctionParameters) {
  return [
    {
      name: "information_extraction",
      description: "Extracts the relevant information from the passage.",
      parameters: {
        type: "object",
        properties: {
          info: {
            type: "array",
            items: {
              type: schema.type,
              properties: schema.properties,
              required: schema.required,
            },
          },
        },
        required: ["info"],
      },
    },
  ];
}

const _EXTRACTION_TEMPLATE = `Extract and save the relevant entities mentioned in the following passage together with their properties.

Passage:
{input}
`;

export function createExtractionChain(
  schema: FunctionParameters,
  llm: ChatOpenAI
) {
  const functions = getExtractionFunctions(schema);
  const prompt = PromptTemplate.fromTemplate(_EXTRACTION_TEMPLATE);
  const chain = new OpenAIFunctionsChain({ llm, prompt, functions });
  const parsing_chain = new TransformChain({
    transform: parseToNamedArgument.bind(null, "info"),
    inputVariables: ["input"],
    outputVariables: ["output"],
  });
  return new SimpleSequentialChain({ chains: [chain, parsing_chain] });
}

export function createExtractionChainFromZod(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: z.ZodObject<any, any, any, any>,
  llm: ChatOpenAI
) {
  return createExtractionChain(
    zodToJsonSchema(schema) as JsonSchema7ObjectType,
    llm
  );
}
