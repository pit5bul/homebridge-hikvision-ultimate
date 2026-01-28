"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.HikvisionApi = void 0;
const crypto_1 = require("crypto");
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const xml2js_1 = require("xml2js");
/**
 * Hikvision ISAPI client with Digest Authentication
 */
class HikvisionApi {
    host;
    port;
    username;
    password;
    log;
    protocol;
    digestAuth;
    constructor(host, port, secure, username, password, log) {
        this.host = host;
        this.port = port;
        this.username = username;
        this.password = password;
        this.log = log;
        this.protocol = secure ? https : http;
    }
    /**
     * Make an authenticated GET request to the NVR
     */
    async get(path) {
        const response = await this.request('GET', path);
        return this.parseXmlResponse(response);
    }
    /**
     * Open a persistent connection for event stream
     */
    openEventStream(path, onData, onError, onClose) {
        let request = null;
        let response = null;
        let closed = false;
        const connect = async () => {
            if (closed) {
                return;
            }
            try {
                const result = await this.requestRaw('GET', path, true);
                request = result.request;
                response = result.response;
                response.on('data', (chunk) => {
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
            }
            catch (err) {
                if (!closed) {
                    onError(err);
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
    async request(method, path) {
        const result = await this.requestRaw(method, path, false);
        return new Promise((resolve, reject) => {
            let data = '';
            result.response.on('data', (chunk) => {
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
    async requestRaw(method, path, keepAlive) {
        // First request to get WWW-Authenticate challenge
        const firstResponse = await this.makeRequest(method, path, undefined, keepAlive);
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
            return this.makeRequest(method, path, authHeader, keepAlive);
        }
        if (firstResponse.response.statusCode !== 200) {
            throw new Error(`HTTP ${firstResponse.response.statusCode}: ${firstResponse.response.statusMessage}`);
        }
        return firstResponse;
    }
    /**
     * Make a single HTTP request
     */
    makeRequest(method, path, authHeader, keepAlive = false) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: this.host,
                port: this.port,
                path,
                method,
                headers: {
                    'Accept': 'application/xml',
                },
                timeout: keepAlive ? 0 : 30000,
            };
            if (authHeader) {
                options.headers['Authorization'] = authHeader;
            }
            const request = this.protocol.request(options, (response) => {
                resolve({ request, response });
            });
            request.on('error', reject);
            request.on('timeout', () => {
                request.destroy();
                reject(new Error('Request timeout'));
            });
            request.end();
        });
    }
    /**
     * Parse XML response to object
     */
    async parseXmlResponse(xml) {
        try {
            const result = await (0, xml2js_1.parseStringPromise)(xml, {
                explicitArray: false,
                ignoreAttrs: false,
                mergeAttrs: true,
            });
            return result;
        }
        catch (err) {
            this.log.debug(`XML parse error: ${xml.substring(0, 500)}`);
            throw new Error(`Failed to parse XML response: ${err}`);
        }
    }
    /**
     * Parse WWW-Authenticate header for Digest auth
     */
    parseDigestChallenge(header) {
        const auth = {
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
    computeDigestHeader(method, uri) {
        if (!this.digestAuth) {
            throw new Error('No digest auth available');
        }
        this.digestAuth.nc++;
        const nc = this.digestAuth.nc.toString(16).padStart(8, '0');
        const cnonce = (0, crypto_1.randomBytes)(8).toString('hex');
        // HA1 = MD5(username:realm:password)
        const ha1 = (0, crypto_1.createHash)('md5')
            .update(`${this.username}:${this.digestAuth.realm}:${this.password}`)
            .digest('hex');
        // HA2 = MD5(method:uri)
        const ha2 = (0, crypto_1.createHash)('md5')
            .update(`${method}:${uri}`)
            .digest('hex');
        // Response = MD5(HA1:nonce:nc:cnonce:qop:HA2)
        const response = (0, crypto_1.createHash)('md5')
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
exports.HikvisionApi = HikvisionApi;
