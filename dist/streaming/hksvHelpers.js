"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listenServer = listenServer;
exports.readLength = readLength;
exports.parseFragmentedMP4 = parseFragmentedMP4;
/**
 * Listen on a random port and return the port number
 */
async function listenServer(server, log) {
    let isListening = false;
    while (!isListening) {
        const port = 10000 + Math.round(Math.random() * 30000);
        server.listen(port);
        try {
            await new Promise((resolve, reject) => {
                server.once('listening', resolve);
                server.once('error', reject);
            });
            isListening = true;
            const address = server.address();
            if (address && typeof address === 'object' && 'port' in address) {
                return address.port;
            }
            throw new Error('Failed to get server address');
        }
        catch (e) {
            log.error('Error while listening to the server:', e);
        }
    }
    return 0;
}
/**
 * Read exact number of bytes from a readable stream
 */
async function readLength(readable, length) {
    if (!length) {
        return Buffer.alloc(0);
    }
    {
        const ret = readable.read(length);
        if (ret) {
            return ret;
        }
    }
    return new Promise((resolve, reject) => {
        const r = () => {
            const ret = readable.read(length);
            if (ret) {
                cleanup();
                resolve(ret);
            }
        };
        const e = () => {
            cleanup();
            reject(new Error(`stream ended during read for minimum ${length} bytes`));
        };
        const cleanup = () => {
            readable.removeListener('readable', r);
            readable.removeListener('end', e);
        };
        readable.on('readable', r);
        readable.on('end', e);
    });
}
/**
 * Parse fragmented MP4 stream into atoms (ftyp, moov, moof, mdat)
 */
async function* parseFragmentedMP4(readable) {
    while (true) {
        const header = await readLength(readable, 8);
        const length = header.readInt32BE(0) - 8;
        const type = header.slice(4).toString();
        const data = await readLength(readable, length);
        yield {
            header,
            length,
            type,
            data,
        };
    }
}
