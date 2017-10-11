/*
 * Copyright 2017 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

import { AuthorizationRequest } from '@openid/appauth/built/authorization_request';
import { AuthorizationNotifier, AuthorizationRequestHandler, AuthorizationRequestResponse, BUILT_IN_PARAMETERS } from '@openid/appauth/built/authorization_request_handler';
import { AuthorizationResponse } from '@openid/appauth/built/authorization_response';
import { AuthorizationServiceConfiguration } from '@openid/appauth/built/authorization_service_configuration';
import { NodeBasedHandler } from '@openid/appauth/built/node_support/node_request_handler';
import { NodeRequestor } from '@openid/appauth/built/node_support/node_requestor';
import { GRANT_TYPE_AUTHORIZATION_CODE, GRANT_TYPE_REFRESH_TOKEN, TokenRequest } from '@openid/appauth/built/token_request';
import { BaseTokenRequestHandler, TokenRequestHandler } from '@openid/appauth/built/token_request_handler';
import { TokenError, TokenResponse } from '@openid/appauth/built/token_response';
import EventEmitter = require('events');

import { log } from './logger';
import { StringMap } from '@openid/appauth/built/types';
import { CodeVerifier } from './code_verifier';
import { ElectronBrowserWindowRequestHandler } from './electron_browser_window_request_handler';

import * as path from 'path';
import { Config } from './config-loader';

export class AuthStateEmitter extends EventEmitter {
  static ON_TOKEN_RESPONSE = 'on_token_response';
}

/* the Node.js based HTTP client. */
const requestor = new NodeRequestor();

export class AuthFlow {
  private _notifier: AuthorizationNotifier;
  private _authorizationHandler: ElectronBrowserWindowRequestHandler;
  private _tokenHandler: TokenRequestHandler;
  private _authServiceConfig: AuthorizationServiceConfiguration;
  private _config: Config;

  private _accessTokenResponse: TokenResponse | undefined;
  private _verifier: CodeVerifier;

  public refreshToken: string | undefined;
  public accessToken: string | undefined;

  public readonly authStateEmitter: AuthStateEmitter;

  public get isLoggedIn() {
    return !!this._accessTokenResponse && this._accessTokenResponse.isValid();
  }

  constructor(config: Config, refreshToken?: string) {

    this.refreshToken = refreshToken;

    this._config = config;
    this._verifier = new CodeVerifier();
    this._notifier = new AuthorizationNotifier();
    this.authStateEmitter = new AuthStateEmitter();

    //TODO:DIW:Associate a method of obtaining a electron browser, eg creating a BrowserWindow, or using a WebView.
    this._authorizationHandler = new ElectronBrowserWindowRequestHandler({
      title: 'Login',
      width: 800,
      height: 600,
      icon: 'assets/app_icon.png',
      webPreferences: { nodeIntegration: false }
    });

    this._tokenHandler = new BaseTokenRequestHandler(requestor);

    // set notifier to deliver responses
    this._authorizationHandler.setAuthorizationNotifier(this._notifier);

    // set a listener to respond to authorization responses and make refresh and access token requests.
    this._notifier.setAuthorizationListener(async (request, response, error) => {

      if (!response) return;

      await this.performTokenRequest(response.code);

      this.authStateEmitter.emit(AuthStateEmitter.ON_TOKEN_RESPONSE);
    });
  }

  public async initialize() {

    this._authServiceConfig = await AuthorizationServiceConfiguration.fetchFromIssuer(this._config.openidUri, requestor);

  }

  public signIn(username?: string) {
    if (!this._authServiceConfig) throw new Error('Unknown service configuration');

    let extras: StringMap = {
      'prompt': 'consent',
      'access_type': 'offline'
    };

    if (username) extras['login_hint'] = username;
    if (this._config.clientSecret) extras['client_secret'] = this._config.clientSecret;

    if (this._verifier) {
      extras['code_challenge'] = this._verifier.challenge;
      extras['code_challenge_method'] = this._verifier.method;
      extras['code_verifier'] = this._verifier.verifier;
    }

    // create a request
    let authRequest = new AuthorizationRequest(this._config.clientId, this._config.redirectUri, this._config.scope, AuthorizationRequest.RESPONSE_TYPE_CODE, undefined, extras);

    this._authorizationHandler.performAuthorizationRequest(this._authServiceConfig, authRequest);
  }

  public signOut() {
    //TODO:Logout on server?
    this._accessTokenResponse = undefined;
  }

  private async performTokenRequest(code: string) {

    if (!this._authServiceConfig) return Promise.reject('Unknown service configuration');

    let extras: StringMap = {};

    if (this._config.clientSecret) extras['client_secret'] = this._config.clientSecret;

    if (this._verifier) {
      extras['code_challenge'] = this._verifier.challenge;
      extras['code_challenge_method'] = this._verifier.method;
      extras['code_verifier'] = this._verifier.verifier;
    }

    let request = new TokenRequest(this._config.clientId, this._config.redirectUri, GRANT_TYPE_AUTHORIZATION_CODE, code, undefined, extras);

    let response = await this._tokenHandler.performTokenRequest(this._authServiceConfig, request);

    this._accessTokenResponse = response;

    this.refreshToken = response.refreshToken;
    this.accessToken = response.accessToken;
  }

  public async updateAccessToken() {

    if (!this._authServiceConfig) throw new Error('Unknown service configuration');
    if (!this.refreshToken) throw new Error('Missing refreshToken.');

    if (this._accessTokenResponse && this._accessTokenResponse.isValid()) return;

    let extras: StringMap = {};

    if (this._config.clientSecret) extras['client_secret'] = this._config.clientSecret;

    let request = new TokenRequest(this._config.clientId, this._config.redirectUri, GRANT_TYPE_REFRESH_TOKEN, undefined, this.refreshToken, extras);

    let response = await this._tokenHandler.performTokenRequest(this._authServiceConfig, request);

    this._accessTokenResponse = response;

  }
}
