import { Logger } from 'homebridge';
import { createHash, randomBytes } from 'crypto';
import { IncomingMessage } from 'http';
import * as http from 'http';
import * as https from 'https';
import { parseStringPromise } from 'xml2js';

/**
 * Digest authentication state
 */
interface DigestAuth {
  realm: string;
  nonce: string;
  qop: string;
  nc: number;
  opaque?: string;
}

/**
 * Optional per-request settings. Existing callers pass none and keep the original behaviour.
 */
interface RequestOptions {
  /** Request body (PUT/POST). */
  body?: string;
  contentType?: string;
  accept?: string;
  /** Throw on any non-200 response, including the one after digest authentication. */
  strict?: boolean;
}

/**
 * Hikvision ISAPI client with Digest Authentication
 */
export class HikvisionApi {
  private readonly protocol: typeof http | typeof https;
  private digestAuth?: DigestAuth;

  constructor(
    private readonly host: string,
    private readonly port: number,
    secure: boolean,
    private readonly username: string,
    private readonly password: string,
    private readonly log: Logger,
  ) {
    this.protocol = secure ? https : http;
  }

  /**
   * Make an authenticated GET request to the NVR
   */
  async get<T>(path: string): Promise<T> {
    const response = await this.request('GET', path);
    return this.parseXmlResponse<T>(response);
  }

  /**
   * GET returning the raw response text. Throws on any non-200 response.
   */
  async getText(path: string, accept = 'application/xml'): Promise<string> {
    return this.request('GET', path, { accept, strict: true });
  }

  /**
   * GET a `?format=json` endpoint and parse the JSON response. Throws on any non-200 response.
   */
  async getJson<T>(path: string): Promise<T> {
    const text = await this.request('GET', path, { accept: 'application/json', strict: true });
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Invalid JSON response from ${path}: ${text.substring(0, 200)}`);
    }
  }

  /**
   * PUT a body and return the response text. Throws on a non-200 response, or when the
   * device answers 200 with a ResponseStatus whose statusCode is not 1 (OK).
   */
  async put(path: string, body: string, contentType: string): Promise<string> {
    const text = await this.request('PUT', path, {
      body,
      contentType,
      accept: contentType.includes('json') ? 'application/json' : 'application/xml',
      strict: true,
    });
    HikvisionApi.assertStatusOk(path, text);
    return text;
  }

  /**
   * Check an ISAPI ResponseStatus (XML or JSON). A body with no statusCode is accepted.
   */
  static assertStatusOk(path: string, text: string): void {
    const code = text.match(/<statusCode>\s*(\d+)\s*<\/statusCode>/i) || text.match(/"statusCode"\s*:\s*(\d+)/i);
    if (!code || parseInt(code[1], 10) === 1) {
      return;
    }
    const detail = text.match(/<statusString>([^<]*)<\/statusString>/i) || text.match(/"statusString"\s*:\s*"([^"]*)"/i);
    const sub = text.match(/<subStatusCode>([^<]*)<\/subStatusCode>/i) || text.match(/"subStatusCode"\s*:\s*"([^"]*)"/i);
    throw new Error(`Device rejected ${path}: statusCode ${code[1]}${detail ? ` ${detail[1]}` : ''}${sub ? ` (${sub[1]})` : ''}`);
  }

  /**
   * Open a persistent connection for event stream
   */
  openEventStream(
    path: string,
    onData: (chunk: string) => void,
    onError: (err: Error) => void,
    onClose: () => void,
  ): { close: () => void } {
    let request: http.ClientRequest | null = null;
    let response: IncomingMessage | null = null;
    let closed = false;

    const connect = async () => {
      if (closed) {
        return;
      }

      try {
        const result = await this.requestRaw('GET', path, true);
        request = result.request;
        response = result.response;

        response.on('data', (chunk: Buffer) => {
          if (!closed) {
            onData(chunk.toString());
          }
        });

        response.on('end', () => {
          if (!closed) {
            this.log.debug('Event stream ended, reconnecting...');
            setTimeout(connect, 5000);
          }
        });

        response.on('error', (err) => {
          if (!closed) {
            onError(err);
            setTimeout(connect, 5000);
          }
        });
      } catch (err) {
        if (!closed) {
          onError(err as Error);
          setTimeout(connect, 5000);
        }
      }
    };

    connect();

    return {
      close: () => {
        closed = true;
        if (request) {
          request.destroy();
        }
        if (response) {
          response.destroy();
        }
        onClose();
      },
    };
  }

  /**
   * Make an HTTP request with digest authentication
   */
  private async request(method: string, path: string, options?: RequestOptions): Promise<string> {
    const result = await this.requestRaw(method, path, false, options);
    return new Promise((resolve, reject) => {
      let data = '';
      result.response.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      result.response.on('end', () => {
        resolve(data);
      });
      result.response.on('error', reject);
    });
  }

  /**
   * Make a raw HTTP request with digest auth, returning the response stream
   */
  private async requestRaw(
    method: string,
    path: string,
    keepAlive: boolean,
    options?: RequestOptions,
  ): Promise<{ request: http.ClientRequest; response: IncomingMessage }> {
    // First request to get WWW-Authenticate challenge
    const firstResponse = await this.makeRequest(method, path, undefined, keepAlive, options);

    if (firstResponse.response.statusCode === 401) {
      // Parse WWW-Authenticate header
      const wwwAuth = firstResponse.response.headers['www-authenticate'];
      if (!wwwAuth) {
        throw new Error('No WWW-Authenticate header in 401 response');
      }

      // Drain the first response
      firstResponse.response.resume();

      // Parse and compute digest auth
      this.digestAuth = this.parseDigestChallenge(wwwAuth);
      const authHeader = this.computeDigestHeader(method, path);

      // Second request with auth header
      const secondResponse = await this.makeRequest(method, path, authHeader, keepAlive, options);
      if (options?.strict && secondResponse.response.statusCode !== 200) {
        const detail = await this.readErrorBody(secondResponse.response);
        throw new Error(`HTTP ${secondResponse.response.statusCode}: ${secondResponse.response.statusMessage}${detail}`);
      }
      return secondResponse;
    }

    if (firstResponse.response.statusCode !== 200) {
      const detail = options?.strict ? await this.readErrorBody(firstResponse.response) : '';
      throw new Error(`HTTP ${firstResponse.response.statusCode}: ${firstResponse.response.statusMessage}${detail}`);
    }

    return firstResponse;
  }

  /**
   * Make a single HTTP request
   */
  private makeRequest(
    method: string,
    path: string,
    authHeader?: string,
    keepAlive = false,
    extra?: RequestOptions,
  ): Promise<{ request: http.ClientRequest; response: IncomingMessage }> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {
        'Accept': extra?.accept ?? 'application/xml',
      };
      if (extra?.body !== undefined) {
        headers['Content-Type'] = extra.contentType ?? 'application/xml';
        headers['Content-Length'] = Buffer.byteLength(extra.body).toString();
      }

      const options: http.RequestOptions = {
        hostname: this.host,
        port: this.port,
        path,
        method,
        headers,
        timeout: keepAlive ? 0 : 30000,
      };

      if (authHeader) {
        headers['Authorization'] = authHeader;
      }

      const request = this.protocol.request(options, (response) => {
        resolve({ request, response });
      });

      request.on('error', reject);
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });

      if (extra?.body !== undefined) {
        request.end(extra.body);
      } else {
        request.end();
      }
    });
  }

  /**
   * Read a short excerpt of an error response body for the error message.
   */
  private readErrorBody(response: IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
      let data = '';
      const finish = () => resolve(data.trim() ? ` - ${data.trim().replace(/\s+/g, ' ').substring(0, 200)}` : '');
      response.on('data', (chunk: Buffer) => {
        if (data.length < 400) data += chunk.toString();
      });
      response.on('end', finish);
      response.on('error', finish);
      setTimeout(finish, 3000).unref();
    });
  }

  /**
   * Parse XML response to object
   */
  private async parseXmlResponse<T>(xml: string): Promise<T> {
    try {
      const result = await parseStringPromise(xml, {
        explicitArray: false,
        ignoreAttrs: false,
        mergeAttrs: true,
      });
      return result as T;
    } catch (err) {
      this.log.debug(`XML parse error: ${xml.substring(0, 500)}`);
      throw new Error(`Failed to parse XML response: ${err}`);
    }
  }

  /**
   * Parse WWW-Authenticate header for Digest auth
   */
  private parseDigestChallenge(header: string): DigestAuth {
    const auth: DigestAuth = {
      realm: '',
      nonce: '',
      qop: '',
      nc: 0,
    };

    const parts = header.replace(/^Digest\s+/i, '').split(',');
    for (const part of parts) {
      const [key, ...valueParts] = part.trim().split('=');
      const value = valueParts.join('=').replace(/^"|"$/g, '');

      switch (key.toLowerCase()) {
        case 'realm':
          auth.realm = value;
          break;
        case 'nonce':
          auth.nonce = value;
          break;
        case 'qop':
          auth.qop = value;
          break;
        case 'opaque':
          auth.opaque = value;
          break;
      }
    }

    return auth;
  }

  /**
   * Compute Authorization header for Digest auth
   */
  private computeDigestHeader(method: string, uri: string): string {
    if (!this.digestAuth) {
      throw new Error('No digest auth available');
    }

    this.digestAuth.nc++;
    const nc = this.digestAuth.nc.toString(16).padStart(8, '0');
    const cnonce = randomBytes(8).toString('hex');

    // HA1 = MD5(username:realm:password)
    const ha1 = createHash('md5')
      .update(`${this.username}:${this.digestAuth.realm}:${this.password}`)
      .digest('hex');

    // HA2 = MD5(method:uri)
    const ha2 = createHash('md5')
      .update(`${method}:${uri}`)
      .digest('hex');

    // Response = MD5(HA1:nonce:nc:cnonce:qop:HA2)
    const response = createHash('md5')
      .update(`${ha1}:${this.digestAuth.nonce}:${nc}:${cnonce}:auth:${ha2}`)
      .digest('hex');

    let header = `Digest username="${this.username}", ` +
      `realm="${this.digestAuth.realm}", ` +
      `nonce="${this.digestAuth.nonce}", ` +
      `uri="${uri}", ` +
      `qop=auth, ` +
      `nc=${nc}, ` +
      `cnonce="${cnonce}", ` +
      `response="${response}"`;

    if (this.digestAuth.opaque) {
      header += `, opaque="${this.digestAuth.opaque}"`;
    }

    return header;
  }
}
