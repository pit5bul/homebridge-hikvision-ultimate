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
export async function listenServer(server: Server, log: Logger): Promise<number> {
  let isListening = false;
  while (!isListening) {
    const port = 10000 + Math.round(Math.random() * 30000);
    server.listen(port);
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
      });
      isListening = true;
      const address = server.address();
      if (address && typeof address === 'object' && 'port' in address) {
        return address.port;
      }
      throw new Error('Failed to get server address');
    } catch (e: any) {
      log.error('Error while listening to the server:', e);
    }
  }
  return 0;
}

/**
 * Read exact number of bytes from a readable stream
 */
export async function readLength(readable: Readable, length: number): Promise<Buffer> {
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
    const r = (): void => {
      const ret = readable.read(length);
      if (ret) {
        cleanup();
        resolve(ret);
      }
    };

    const e = (): void => {
      cleanup();
      reject(new Error(`stream ended during read for minimum ${length} bytes`));
    };

    const cleanup = (): void => {
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
export async function* parseFragmentedMP4(readable: Readable): AsyncGenerator<MP4Atom> {
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
