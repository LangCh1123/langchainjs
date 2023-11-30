import { AuthFlowBase } from "./authFlowBase.js";
import { getEnvironmentVariable } from "../../util/env.js";

interface AccessTokenResponse {
  access_token: string;
  refresh_token: string;
}

// if you have the token, and no need to refresh it, warning: token expires in 1 hour
export class AuthFlowToken extends AuthFlowBase {
  constructor(accessToken?: string) {
    let token = accessToken;
    if (!token) {
      token = getEnvironmentVariable("OUTLOOK_ACCESS_TOKEN");
    }
    if (!token) {
      throw new Error("Missing access_token.");
    }
    super("");
    this.accessToken = token;
  }

  public async refreshAccessToken(): Promise<string> {
    return this.accessToken;
  }

  public async getAccessToken(): Promise<string> {
    return this.accessToken;
  }
}

// if you have the refresh token and other credentials
export class AuthFlowRefresh extends AuthFlowBase {
  private clientSecret: string;
  
  private redirectUri: string;

  private refreshToken: string;

  constructor(
    clientId?: string,
    clientSecret?: string,
    redirectUri?: string,
    refreshToken?: string
  ) {
    let id = clientId;
    let secret = clientSecret;
    let uri = redirectUri;
    let token = refreshToken;
    if (!id || !secret || !uri || !token) {
      id = getEnvironmentVariable("OUTLOOK_CLIENT_ID");
      secret = getEnvironmentVariable("OUTLOOK_CLIENT_SECRET");
      uri = getEnvironmentVariable("OUTLOOK_REDIRECT_URI");
      token = getEnvironmentVariable("OUTLOOK_REFRESH_TOKEN");
    }
    if (!id || !secret || !uri || !token) {
      throw new Error(
        "Missing clientId, clientSecret, redirectUri or refreshToken."
      );
    }
    super(id);
    this.clientSecret = secret;
    this.redirectUri = uri;
    this.refreshToken = token;
  }

  public async refreshAccessToken(): Promise<string> {
    // fetch new access token using refresh token
    const req_body =
      `client_id=${encodeURIComponent(this.clientId)}&` +
      `client_secret=${encodeURIComponent(this.clientSecret)}&` +
      `scope=${encodeURIComponent("https://graph.microsoft.com/.default")}&` +
      `redirect_uri=${encodeURIComponent(this.redirectUri)}&` +
      `grant_type=refresh_token&` +
      `refresh_token=${encodeURIComponent(this.refreshToken)}`;

    const response = await fetch(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: req_body,
      }
    );

    if (!response.ok) {
      throw new Error(`fetch token error! response: ${response}`);
    }
    // save new access token
    const json = (await response.json()) as AccessTokenResponse;
    this.accessToken = json.access_token;
    return this.accessToken;
  }

  // Function to get the token using the code and client credentials
  public async getAccessToken(): Promise<string> {
    const accessToken = await this.refreshAccessToken();
    this.accessToken = accessToken;
    return accessToken;
  }
}
