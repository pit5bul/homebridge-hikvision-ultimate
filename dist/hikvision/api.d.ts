import { Logger } from 'homebridge';
/**
 * Hikvision ISAPI client with Digest Authentication
 */
export declare class HikvisionApi {
    private readonly host;
    private readonly port;
    private readonly username;
    private readonly password;
    private readonly log;
    private readonly protocol;
    private digestAuth?;
    constructor(host: string, port: number, secure: boolean, username: string, password: string, log: Logger);
    /**
     * Make an authenticated GET request to the NVR
     */
    get<T>(path: string): Promise<T>;
    /**
     * Open a persistent connection for event stream
     */
    openEventStream(path: string, onData: (chunk: string) => void, onError: (err: Error) => void, onClose: () => void): {
        close: () => void;
    };
    /**
     * Make an HTTP request with digest authentication
     */
    private request;
    /**
     * Make a raw HTTP request with digest auth, returning the response stream
     */
    private requestRaw;
    /**
     * Make a single HTTP request
     */
    private makeRequest;
    /**
     * Parse XML response to object
     */
    private parseXmlResponse;
    /**
     * Parse WWW-Authenticate header for Digest auth
     */
    private parseDigestChallenge;
    /**
     * Compute Authorization header for Digest auth
     */
    private computeDigestHeader;
}
