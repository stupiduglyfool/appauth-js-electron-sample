import * as fs from 'fs';

export class FileSystemUtil {
    public static exists(path: string) {
        return new Promise<boolean>(res => fs.exists(path, res));
    }

    public static readFile(path: string, encoding: string) {
        return new Promise<string>((res, rej) =>
            fs.readFile(path, encoding, (err, data) => {
                if (err) rej(err);
                res(data);
            }));
    }

    public static writeFile(path: string, data: string, encoding: string) {
        return new Promise<void>((res, rej) =>
            fs.writeFile(path, data, encoding, err => {
                if (err) rej(err);
                res();
            }));
    }
}