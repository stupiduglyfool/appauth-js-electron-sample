import * as path from 'path';
import * as electron from 'electron';

import { FileSystemUtil } from './file-system-util';

export class Config {
    clientId: string;
    clientSecret: string;
    openidUri: string;
    redirectUri: string;
    scope: string;
    disableSslCheck: boolean
}

export class ConfigLoader {

    static async execute() {

        let app = electron.remote ? electron.remote.app : electron.app;

        let configPath = `config.json`;

        if (await FileSystemUtil.exists(configPath)) {
            let configFileContents = await FileSystemUtil.readFile(configPath, "UTF-8");

            return <Config>JSON.parse(configFileContents);
        }

        return new Config();
    }
}