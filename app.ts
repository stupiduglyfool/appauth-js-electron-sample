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

import { ipcRenderer } from 'electron';
import { AuthFlow, AuthStateEmitter } from './flow';
import { log } from './logger';
import { CodeVerifier } from './code_verifier';
import { Md5 } from './md5';
import { Config } from './config-loader';

const SIGN_IN = 'Sign-In';
const SIGN_OUT = 'Sign-Out';

interface SnackBarOptions {
  message: string;
  timeout?: number;
  actionHandler?: (event: any) => void;
  actionText?: string;
}

interface UserInfo {
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
}

export class App {
  private _config: Config;
  private _accessToken: string;
  private _userInfo: UserInfo | null;

  private _handleSignIn = document.querySelector('#handle-sign-in') as HTMLElement;
  private _fetchUserInfo = document.querySelector('#handle-user-info') as HTMLElement;
  private _userCard = document.querySelector('#user-info') as HTMLElement;
  private _userProfileImage = document.querySelector('#user-profile-image') as HTMLImageElement;
  private _userName = document.querySelector('#user-name') as HTMLElement;
  private _snackbarContainer: any = document.querySelector('#appauth-snackbar') as HTMLElement;

  constructor() {

    this.initializeUi();

    ipcRenderer.on('config-loaded', (event: any, config: Config) => {
      this._config = config;
    });

    ipcRenderer.on('signed-in', (event: any, message: string) => {

      this._accessToken = message;
      this.updateUi();

    });

    this._handleSignIn.addEventListener('click', (event) => {
      if (this._handleSignIn.textContent === SIGN_IN) {
        this.signIn();
      } else if (this._handleSignIn.textContent === SIGN_OUT) {
        this.signOut();
      }
      event.preventDefault();
    });

    this._fetchUserInfo.addEventListener('click', () => {

      let request =
        new Request(`${this._config.openidUri}/connect/userinfo`, {
          headers: new Headers({ 'Authorization': `Bearer ${this._accessToken}` }),
          method: 'GET',
          cache: 'no-cache'
        });

      fetch(request)
        .then(result => result.json())
        .then(user => {
          log('User Info ', user);
          this._userInfo = user;
          this.updateUi();
        })
        .catch(error => {
          log('Something bad happened ', error);
        });

    });
  }

  signIn(username?: string): Promise<void> {
    if (this._accessToken) return Promise.resolve();

    ipcRenderer.send('sign-in');

    return Promise.resolve();


    /*return this.authFlow.fetchServiceConfiguration().then(
        () => this.authFlow.makeAuthorizationRequest(username));
    } else {
      return Promise.resolve();
    }*/
  }

  private initializeUi() {
    this._handleSignIn.textContent = SIGN_IN;
    this._fetchUserInfo.style.display = 'none';
    this._userCard.style.display = 'none';
  }

  // update ui post logging in.
  private updateUi() {
    this._handleSignIn.textContent = SIGN_OUT;
    this._fetchUserInfo.style.display = '';
    if (this._userInfo) {


      let md5 = new Md5();
      md5.start();
      md5.appendStr(this._userInfo.name.toLowerCase());
      let hashedEmail = <string>md5.end(false);

      this._userProfileImage.src = this._userInfo.picture
        ? `${this._userInfo.picture}?sz=96`
        : `https://www.gravatar.com/avatar/${hashedEmail}`;

      this._userName.textContent = this._userInfo.name;
      this.showSnackBar(
        { message: `Welcome ${this._userInfo.name}`, timeout: 4000 });
      this._userCard.style.display = '';
    }
  }

  private showSnackBar(data: SnackBarOptions) {
    this._snackbarContainer.MaterialSnackbar.showSnackbar(data);
  }

  signOut() {
    ipcRenderer.send('sign-out');
    this._userInfo = null;
    this.initializeUi();
  }
}

log('Init complete');
const app = new App();
