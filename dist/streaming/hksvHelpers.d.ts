import { Readable } from 'stream';
import { Server } from 'net';
import { Logger } from 'homebridge';
/**
 * MP4 Atom structure for fragmented MP4
 */
export interface MP4Atom {
    header: Buffer;
    length: number;
    type: string;
    data: Buffer;
}
/**
 * Listen on a random port and return the port number
 */
export declare function listenServer(server: Server, log: Logger): Promise<number>;
/**
 * Read exact number of bytes from a readable stream
 */
export declare function readLength(readable: Readable, length: number): Promise<Buffer>;
/**
 * Parse fragmented MP4 stream into atoms (ftyp, moov, moof, mdat)
 */
export declare function parseFragmentedMP4(readable: Readable): AsyncGenerator<MP4Atom>;
