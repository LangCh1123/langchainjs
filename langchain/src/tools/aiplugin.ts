import { BaseLanguageModel } from "../base_language/index.js";

import { Tool } from "./base.js";
import * as yaml from "js-yaml";

export interface AIPluginToolParams {
  name: string;
  description: string;
  shortApiSpec: string;
  openaiSpec: string;
  model: BaseLanguageModel;
}


export interface PathParameter {
  name: string;
  description: string;
}

export interface Info {
  title: string;
  description: string;
  version: string;
}
export interface PathMethod {
  summary: string;
  operationId: string;
  parameters?: PathParameter[];
}

interface ApiSpec {
  openapi: string;
  info: Info;
  paths: { [key: string]: { [key: string]: PathMethod } };
}

function isJson(str: string): boolean {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}

function convertJsonToYamlIfApplicable(spec: string): string {
  if (isJson(spec)) {
    const jsonData = JSON.parse(spec);
    return yaml.dump(jsonData);
  }
  return spec;
}


function extractShortVersion(openapiSpec: string): string {
  openapiSpec = convertJsonToYamlIfApplicable(openapiSpec);
  try {
    const fullApiSpec: ApiSpec = yaml.load(openapiSpec) as ApiSpec;
    const shortApiSpec: ApiSpec = {
      openapi: fullApiSpec.openapi,
      info: fullApiSpec.info,
      paths: {},
    };

    for (let path in fullApiSpec.paths) {
      shortApiSpec.paths[path] = {};
      for (let method in fullApiSpec.paths[path]) {
        shortApiSpec.paths[path][method] = {
          summary: fullApiSpec.paths[path][method].summary,
          operationId: fullApiSpec.paths[path][method].operationId,
          parameters: fullApiSpec.paths[path][method].parameters?.map(
            (parameter) => ({
              name: parameter.name,
              description: parameter.description,
            })
          ),
        };
      }
    }

    return yaml.dump(shortApiSpec);
  } catch (e) {
    console.log(e);
    return "";
  }
}
function printOperationDetails(operationId: string, openapiSpec: string) {
  openapiSpec = convertJsonToYamlIfApplicable(openapiSpec);
  let returnText = "";
  try {
    let doc = yaml.load(openapiSpec) as any;
    let servers = doc.servers;
    let paths = doc.paths;
    let components = doc.components;

    for (let path in paths) {
      for (let method in paths[path]) {
        let operation = paths[path][method];
        if (operation.operationId === operationId) {
          returnText += `The API request to do for operationId "${operationId}" is:\n`;
          returnText += `Method: ${method.toUpperCase()}\n`;

          let url = servers[0].url + path;
          returnText += `Path: ${url}\n`;

          returnText += "Parameters:\n";
          if (operation.parameters) {
            for (let param of operation.parameters) {
              let required = param.required ? "" : " (optional),";
              returnText += `- ${param.name} (${param.in},${required} ${param.schema.type}): ${param.description}\n`;
            }
          } else {
            returnText += " None\n";
          }
          returnText += "\n";

          let responseSchema =
            operation.responses["200"].content["application/json"].schema;

          // Check if schema is a reference
          if (responseSchema.$ref) {
            // Extract schema name from reference
            let schemaName = responseSchema.$ref.split("/").pop();
            // Look up schema in components
            responseSchema = components.schemas[schemaName];
          }

          returnText += "Response schema:\n";
          returnText += "- Type: " + responseSchema.type + "\n";
          returnText += "- Additional properties:\n";
          returnText +=
            "  - Type: " + responseSchema.additionalProperties?.type + "\n";
          if (responseSchema.additionalProperties?.properties) {
            returnText += "  - Properties:\n";
            for (let prop in responseSchema.additionalProperties.properties) {
              returnText += `    - ${prop} (${responseSchema.additionalProperties.properties[prop].type}): Description not provided in OpenAPI spec\n`;
            }
          }
        }
      }
    }
    if (returnText === "") {
      returnText += `No operation with operationId "${operationId}" found.`;
    }
    return returnText;
  } catch (e) {
    console.log(e);
    return "";
  }
}


export class AIPluginTool extends Tool implements AIPluginToolParams {
  private _name: string;
  private _description: string;
  shortApiSpec: string;
  openaiSpec: string;
  model: BaseLanguageModel;

  get name() {
    return this._name;
  }

  get description() {
    return this._description;
  }

  constructor(params: AIPluginToolParams) {
    super();
    this._name = params.name;
    this._description = params.description;
    this.shortApiSpec = params.shortApiSpec;
    this.openaiSpec = params.openaiSpec;
    this.model = params.model;
  }
  
  async _call(input: string) {
   let date = new Date();
    let fullDate = `Date: ${date.getDate()}/${date.getMonth() + 1
      }/${date.getFullYear()}, Time: ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
    const prompt = `${fullDate}
Question: ${input}
As an AI, your task is to identify the operationId of the relevant API path based on the condensed OpenAPI specifications provided.

Please note:

1. Do not imagine URLs. Only use the information provided in the condensed OpenAPI specifications.

2. Do not guess the operationId. Identify it strictly based on the API paths and their descriptions.

Your output should only include:
- operationId: The operationId of the relevant API path

If you cannot find a suitable API path based on the OpenAPI specifications, please answer only "operationId: No API path found to answer the question".

Now, based on the question above and the condensed OpenAPI specifications given below, identify the operationId:
${this.shortApiSpec}.`;
    const gptResponse = await this.model.predict(prompt);
    let operationId = gptResponse.match(/operationId: (.*)/)?.[1];
    if (!operationId) {
      return "No operationId found in the response";
    }
    if (operationId == "No API path found to answer the question") {
      return "No API path found to answer the question";
    }

    let openApiData = printOperationDetails(operationId, this.openaiSpec);

    return openApiData;
  }

  static async fromPluginUrl(
    url: string,
    model: BaseLanguageModel,
  ) {
    const aiPluginRes = await fetch(url, {});
    if (!aiPluginRes.ok) {
      throw new Error(
        `Failed to fetch plugin from ${url} with status ${aiPluginRes.status}`
      );
    }
    const aiPluginJson = await aiPluginRes.json();
    const apiUrlRes = await fetch(aiPluginJson.api.url, {});
    if (!apiUrlRes.ok) {
      throw new Error(
        `Failed to fetch API spec from ${aiPluginJson.api.url} with status ${apiUrlRes.status}`
      );
    }
    const apiUrlJson = await apiUrlRes.text();
    const shortApiSpec = extractShortVersion(apiUrlJson);
    return new AIPluginTool({
      name: aiPluginJson.name_for_model,
      description: `A \`plugin\` that can construct API requests. (Short description: ${aiPluginJson.description_for_model})`,
      shortApiSpec: shortApiSpec,
      openaiSpec: apiUrlJson,
      model: model,
    });
  }
}
