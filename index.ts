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

import { app, BrowserWindow, ipcMain } from 'electron';
import url = require('url');
import path = require('path');
import { log } from './logger';
import { ConfigLoader } from './config-loader';


// retain a reference to the window, otherwise it gets gc-ed
let mainWindow: Electron.BrowserWindow;

ipcMain.on('app-focus', () => app.focus());

const createMainWindow = async () => {

  let config = await ConfigLoader.execute();

  if (config.disableSslCheck) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    icon: 'assets/app_icon.png',
    show: false
  });

  mainWindow.on('close', () => mainWindow.destroy());

  mainWindow.on('ready-to-show', () => {
    mainWindow.webContents.send('config-loaded', config);
    mainWindow.show();
  });

  mainWindow.loadURL(url.format({
    pathname: path.join(path.dirname(__dirname), 'index.html'),
    protocol: 'file:',
    slashes: true
  }));

  return mainWindow;
}

app.on('ready', async () => await createMainWindow());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
});

app.on('activate', async () => {
  if (mainWindow === null) mainWindow = await createMainWindow();
});
