/*
 * Copyright 2017 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the
 * License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as url from 'url';
import * as EventEmitter from 'events';
import { BasicQueryStringUtils, QueryStringUtils } from '@openid/appauth/built/query_string_utils';
import { AuthorizationRequest } from '@openid/appauth/built/authorization_request';
import { AuthorizationRequestHandler, AuthorizationRequestResponse, } from '@openid/appauth/built/authorization_request_handler';
import { AuthorizationError, AuthorizationResponse, AuthorizationResponseJson, AuthorizationErrorJson } from '@openid/appauth/built/authorization_response'
import { AuthorizationServiceConfiguration } from '@openid/appauth/built/authorization_service_configuration';
import { log } from '@openid/appauth/built/logger';

import { WebviewTag, BrowserWindow, BrowserWindowConstructorOptions } from 'electron';

class ServerEventsEmitter extends EventEmitter {
    static ON_AUTHORIZATION_RESPONSE = 'authorization_response';
    static ON_AUTHORIZATION_ERROR = 'authorization_error';
}

export interface IElectronTokenRequestBehavior {
    begin(): void;
    loadUrl(url: string): void;

    getWebContents(): Electron.WebContents;

    complete(): void;
}

export class ElectronWebviewBehavior implements IElectronTokenRequestBehavior {

    constructor(private _webview: Electron.WebviewTag | null) { }

    public begin() { }

    public loadUrl(url: string) {
        let webview = this._webview as Electron.WebviewTag;
        webview.loadURL(url);
    }

    public getWebContents() {
        let webview = this._webview as Electron.WebviewTag;
        return webview.getWebContents();
    }


    public complete() {
        let webview = this._webview as Electron.WebviewTag;

        if (webview) webview.getWebContents().removeAllListeners();
    }
}

export class ElectronBrowserWindowBehavior implements IElectronTokenRequestBehavior {
    private _authWindow: BrowserWindow | null;

    constructor(private _options?: BrowserWindowConstructorOptions) { }

    public begin() {
        this._authWindow = new BrowserWindow(this._options);

        this._authWindow.on('closed', () => {
            let browserWindow = this._authWindow as BrowserWindow;
            browserWindow.removeAllListeners();
        });
    }

    public loadUrl(url: string) {
        let browserWindow = this._authWindow as BrowserWindow;
        browserWindow.loadURL(url);
    }

    public getWebContents() {
        let browserWindow = this._authWindow as BrowserWindow;
        return browserWindow.webContents;
    }

    public complete() {
        let browserWindow = this._authWindow as BrowserWindow;
        browserWindow.destroy();

        this._authWindow = null;
    }
}
export class ElectronRequestHandler extends AuthorizationRequestHandler {

    // the handle to the current authorization request
    public authorizationPromise: Promise<AuthorizationRequestResponse | null> | null;

    constructor(
        private _tokenRequestBehavior: IElectronTokenRequestBehavior,
        utils?: QueryStringUtils) {

        super(utils || new BasicQueryStringUtils());

        this.authorizationPromise = null;
    }

    private handleNavigation(emitter: ServerEventsEmitter, navigationUri: string) {

        let request = url.parse(navigationUri, true);

        let queryParams = request.query as (AuthorizationResponseJson & AuthorizationErrorJson);
        let state = queryParams['state'];
        let code = queryParams['code'];
        let error = queryParams['error'];

        let authorizationResponse: AuthorizationResponse | null = null;
        let authorizationError: AuthorizationError | null = null;

        if (error) {

            // get additional optional info.
            let errorUri = queryParams['error_uri'];
            let errorDescription = queryParams['error_description'];
            authorizationError = new AuthorizationError(error, errorDescription, errorUri, state);

            emitter.emit(ServerEventsEmitter.ON_AUTHORIZATION_ERROR, authorizationError);

            this._tokenRequestBehavior.complete();

            return;
        }

        if (!code) return;

        authorizationResponse = new AuthorizationResponse(code!, state!);

        let completeResponse = {
            request: request,
            response: authorizationResponse,
            error: authorizationError
        } as AuthorizationRequestResponse;

        emitter.emit(ServerEventsEmitter.ON_AUTHORIZATION_RESPONSE, completeResponse);
        this._tokenRequestBehavior.complete();

    }

    public performAuthorizationRequest(configuration: AuthorizationServiceConfiguration, request: AuthorizationRequest) {

        let emitter = new ServerEventsEmitter();

        this.authorizationPromise = new Promise<AuthorizationRequestResponse>((resolve, reject) => {
            emitter.once(ServerEventsEmitter.ON_AUTHORIZATION_RESPONSE, (result: any) => {
                // resolve pending promise
                resolve(result as AuthorizationRequestResponse);
                // complete authorization flow
                this.completeAuthorizationRequestIfPossible();
            });
        });


        this._tokenRequestBehavior.begin();

        this._tokenRequestBehavior.loadUrl(this.buildRequestUrl(configuration, request));

        let webContents = this._tokenRequestBehavior.getWebContents();


        webContents.on('will-navigate', (event, url) => {
            this.handleNavigation(emitter, url);
        });

        webContents.on('did-get-redirect-request', (event, oldUrl, newUrl) => {
            this.handleNavigation(emitter, newUrl);
        });

    }

    protected completeAuthorizationRequest(): Promise<AuthorizationRequestResponse | null> {
        if (!this.authorizationPromise) return Promise.reject('No pending authorization request. Call performAuthorizationRequest() ?');

        return this.authorizationPromise;
    }
}
