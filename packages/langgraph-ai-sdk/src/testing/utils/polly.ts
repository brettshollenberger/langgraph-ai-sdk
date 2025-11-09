import { Polly, type PollyConfig } from '@pollyjs/core';
import NodeHttpAdapter from '@pollyjs/adapter-node-http';
import FetchAdapter from '@pollyjs/adapter-fetch';
import FSPersister from '@pollyjs/persister-fs';
import path from 'path';

// Register Polly adapters and persisters once globally
Polly.register(NodeHttpAdapter);
Polly.register(FetchAdapter);
Polly.register(FSPersister);

// Use global to ensure singleton across module boundaries
// This is necessary because TypeScript path aliases can cause module duplication
const globalAny = global as any;
if (!globalAny.__pollyManagerInstance) {
    globalAny.__pollyManagerInstance = null;
}

class PollyManager {
    static get polly(): Polly | null {
        return globalAny.__pollyManagerInstance;
    }
    
    static set polly(value: Polly | null) {
        globalAny.__pollyManagerInstance = value;
    }

    // Define AI/LLM provider patterns that should use node-specific recordings
    static AI_PROVIDERS = [
        /127\.0\.0\.1:11434/,  // Ollama
        /api\.anthropic\.com/,  // Anthropic
        /api\.openai\.com/,     // OpenAI
        /generativelanguage\.googleapis\.com/  // Google
    ];

    static RECORDINGS_DIR = path.join(process.cwd(), 'tests', 'recordings');

    /**
     * Gets or creates a Polly instance for a specific node.
     * This is designed to be called by node decorators.
     * 
     * @param nodeName The name of the node (used for recording name)
     * @param options Additional options for the node
     * @returns The Polly instance (either existing or newly created)
     */
    public static async startPolly(
        recordingName: string, 
        mode?: 'record' | 'replay' | 'passthrough' | 'stopped',
        configure?: (polly: Polly) => void
    ): Promise<Polly> {
        let polly = PollyManager.polly;
        if (!polly) {
            polly = PollyManager.hardStartPolly({
                recordingName,
                mode,
                configure,
            });
        }
        PollyManager.setRecordingName(recordingName)
        return polly;
    }

    /**
     * Gets the current Polly instance if one exists.
     */
    public static getPolly(): Polly | null {
        return PollyManager.polly;
    }

    /**
     * Stops and cleans up the global Polly instance.
     */
    public static async stopPolly(): Promise<void> {
        if (PollyManager.polly) {
            if (PollyManager.polly.persister) {
                await PollyManager.polly.persister.persist();
            }
            await PollyManager.polly.stop();
            PollyManager.polly = null;
        }
    }

    /**
     * Persists all recordings for the active Polly instance.
     */
    public static async persistRecordings(): Promise<void> {
        await PollyManager.polly?.persister?.persist();
    }

    /**
     * Configures request routing for a specific node.
     * Only updates AI/LLM host routes to use node-specific recordings.
     * This preserves any test-specific configuration for other routes.
     * 
     * @param nodeName The name of the node (used for recording name)
     */
    public static setRecordingName(nodeName: string): void {
        const polly = PollyManager.polly;
        if (!polly) {
            throw new Error('No active Polly instance to configure');
        }
        
        const { server } = polly;
        
        server
            .any()
            .recordingName(nodeName);
    }

    private static configureRails() {
        const { server } = PollyManager.polly!;

        server
            .any('http://localhost:3000/*')
            .passthrough()
    }

    private static configureLlms() {
        const { server } = PollyManager.polly!;
        PollyManager.AI_PROVIDERS.forEach(providerRegex => {
            server
                .any(providerRegex)
                .configure({ 
                    matchRequestsBy: {
                        method: true,
                        headers: false,  // CRITICAL: Ignore headers for LLM calls
                        body: true,
                        order: false,
                        url: true
                    }
                })
        });
    }

    private static configureHeaders() {
        const { server } = PollyManager.polly;
        server
            .any()
            .on('beforePersist', (req: any, recording: any) => {
                const headersToIgnore = [
                    'x-api-key', 'authorization', 'api-key', 'x-test-proof', 'x-test-mode', 
                    'anthropic-ratelimit-input-tokens-limit', 'anthropic-ratelimit-input-tokens-remaining', 
                    'anthropic-ratelimit-input-tokens-reset',
                    'x-stainless-os', 'x-stainless-arch', 'x-stainless-runtime-version'
                ];
                // Remove sensitive headers from recorded request
                if (recording.request && recording.request.headers && Array.isArray(recording.request.headers)) {
                    recording.request.headers = recording.request.headers.filter((header: any) => {
                        const name = header.name?.toLowerCase();
                        return !headersToIgnore.includes(name);
                    });
                }
                // Also check for headers at the top level
                if (recording.headers && Array.isArray(recording.headers)) {
                    recording.headers = recording.headers.filter((header: any) => {
                        const name = header.name?.toLowerCase();
                        return !headersToIgnore.includes(name);
                    });
                }
            })
    }

    /**
     * Gets or creates a Polly instance.
     * - If no Polly exists, creates a new one with the given options
     * - If a Polly exists with the SAME recording name, returns it (optionally applying additional config)
     * - If a Polly exists with a DIFFERENT recording name, returns the existing one WITHOUT changing it
     *   (This allows nodes to share a test-level Polly instance)
     */
    private static hardStartPolly(options: { 
        recordingName: string,
        mode?: 'record' | 'replay' | 'passthrough' | 'stopped',
        configure?: (polly: Polly) => void
    }): Polly {
        PollyManager.polly = new Polly(options.recordingName, {
            mode: options.mode || 'replay',
            adapters: ['node-http', 'fetch'],
            persister: 'fs',
            persisterOptions: {
                fs: {
                    recordingsDir: PollyManager.RECORDINGS_DIR
                },
                keepUnusedRequests: true  // CRITICAL: Keep entries from previous nodes
            },
            recordIfMissing: true,
            matchRequestsBy: {
                method: true,
                headers: false,
                body: true,
                order: false,
                url: true
            },
            recordFailedRequests: true
        });
        PollyManager.configureRails();
        PollyManager.configureLlms();
        PollyManager.configureHeaders();

        // --- ALLOW CUSTOM CONFIGURATION BEFORE DEFAULT HANDLERS ---
        if (options.configure) {
            options.configure(PollyManager.polly);
        }

        return PollyManager.polly;
    }
}

/**
 * Mock API response helper for tests
 */
export function mockApiResponse(pattern: string | RegExp, response: any) {
    const polly = PollyManager.getPolly();
    if (!polly) {
        throw new Error('No active Polly instance. Call startPolly first.');
    }
    
    polly.server
        .any(pattern)
        .intercept((req: any, res: any) => {
            res.status(response.status || 200);
            res.json(response.body || response);
        });
}

/**
 * Mock multiple API endpoints at once
 */
export function mockApiEndpoints(endpoints: Array<{pattern: string | RegExp, response: any}>) {
    endpoints.forEach(({pattern, response}) => {
        mockApiResponse(pattern, response);
    });
}

export const { startPolly, stopPolly, persistRecordings, getPolly } = PollyManager;