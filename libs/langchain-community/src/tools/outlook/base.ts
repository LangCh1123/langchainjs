import { Tool } from "@langchain/core/tools";
import { AuthFlowBase } from "./authFlowBase.js";
import { AuthFlowToken, AuthFlowRefresh } from "./authFlowToken.js";
import { AuthFlowREST } from "./authFlowREST.js";

/**
 * Tool for interacting with Outlook, allowing actions such as sending or reading emails.
 * @extends Tool
 */
export abstract class OutlookBase extends Tool {
  /**
   * The name of the Outlook tool.
   * @type {string}
   */
  name = "Outlook";

  /**
   * Description of the Outlook tool.
   * @type {string}
   */
  description =
    "A tool to send or read emails or do other features from Outlook.";

  /**
   * The authentication flow used for obtaining access tokens.
   * @type {AuthFlowBase}
   * @protected
   */
  protected authFlow: AuthFlowBase;

  /**
   * The access token obtained after successful authentication.
   * @type {string}
   * @protected
   */
  protected accessToken = "";

  /**
   * Constructs an instance of the OutlookBase tool.
   * @param {AuthFlowBase} authFlow - The authentication flow to use.
   * @param {string} choice - The choice of authentication flow (token, refresh, rest).
   * @throws {Error} Throws an error if an incorrect choice of built-in authFlow is provided.
   */
  constructor(authFlow?: AuthFlowBase, choice?: string) {
    super();
    if (authFlow) {
      this.authFlow = authFlow;
    } else {
      if (choice === "token") {
        this.authFlow = new AuthFlowToken();
      } else if (choice === "refresh") {
        this.authFlow = new AuthFlowRefresh();
      } else if (choice === "rest") {
        this.authFlow = new AuthFlowREST();
      } else {
        throw new Error("Incorrect choice of built-in authFlow.");
      }
    }
  }

  /**
   * Retrieves and returns the authentication token.
   * If the token is not available, it first attempts to refresh the token, and if that fails, it obtains a new token.
   * @returns {Promise<string>} A promise that resolves to the authentication token.
   */
  async getAuth() {
    if (!this.accessToken) {
      this.accessToken = await this.authFlow.getAccessToken();
    } else {
      try {
        this.accessToken = await this.authFlow.refreshAccessToken();
      } catch (error) {
        this.accessToken = await this.authFlow.getAccessToken();
      }
    }
    return this.accessToken;
  }
}
