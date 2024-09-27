import { WatsonXAI } from "@ibm-cloud/watsonx-ai";
import {
  IamAuthenticator,
  BearerTokenAuthenticator,
  CloudPakForDataAuthenticator,
} from "ibm-cloud-sdk-core";
import { WatsonxAuth, WatsonxInit } from "../types.js";

export const authenticateAndSetInstance = ({
  watsonxAIApikey,
  watsonxAIAuthType,
  watsonxAIBearerToken,
  watsonxAIUsername,
  watsonxAIPassword,
  watsonxAIUrl,
  version,
  serviceUrl,
}: WatsonxAuth & Omit<WatsonxInit, "authenticator">): WatsonXAI | undefined => {
  if (watsonxAIAuthType === "iam" && watsonxAIApikey && watsonxAIUrl) {
    return WatsonXAI.newInstance({
      version,
      serviceUrl,
      authenticator: new IamAuthenticator({
        apikey: watsonxAIApikey,
        url: watsonxAIUrl,
      }),
    });
  } else if (
    watsonxAIAuthType === "bearertoken" &&
    watsonxAIBearerToken &&
    watsonxAIUrl
  ) {
    return WatsonXAI.newInstance({
      version,
      serviceUrl,
      authenticator: new BearerTokenAuthenticator({
        bearerToken: watsonxAIBearerToken,
      }),
    });
  } else if (watsonxAIAuthType === "cp4d" && watsonxAIUrl) {
    if (watsonxAIUsername && watsonxAIPassword && watsonxAIApikey)
      return WatsonXAI.newInstance({
        version,
        serviceUrl,
        authenticator: new CloudPakForDataAuthenticator({
          username: watsonxAIUsername,
          password: watsonxAIPassword,
          url: watsonxAIUrl,
          apikey: watsonxAIApikey,
        }),
      });
  } else
    return WatsonXAI.newInstance({
      version,
      serviceUrl,
    });
  return undefined;
};
