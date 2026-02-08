/**
 * Debug Logger Utility
 * 
 * Intercepts global fetch requests to log details to files in debug/ directory.
 * Only active when DEBUG_MODE=true in .env
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

export function initializeDebugLogger() {
    const isDebugMode = process.env.DEBUG_MODE === 'true';

    if (!isDebugMode) {
        return;
    }

    console.log('🐞 Debug Mode Enabled: Logging external requests to debug/ folder');

    // Ensure debug directory exists
    try {
        mkdirSync('debug', { recursive: true });
    } catch (e) {
        console.error('Failed to create debug directory:', e);
    }

    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const startTime = Date.now();
        const method = init?.method || 'GET';
        const urlStr = input.toString();
        const url = new URL(urlStr);

        // Create safe filename: TIMESTAMP-METHOD-HOSTNAME-PATH
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safePath = url.pathname.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
        const filename = `${timestamp}-${method}-${url.hostname}${safePath}.log`;
        const filePath = join('debug', filename);

        let logContent = `URL: ${urlStr}\nMethod: ${method}\nTimestamp: ${new Date().toISOString()}\n\n`;

        // Log Request Headers
        if (init?.headers) {
            logContent += `--- Request Headers ---\n${JSON.stringify(init.headers, null, 2)}\n\n`;
        }

        // Log Request Body
        if (init?.body) {
            logContent += `--- Request Body ---\n`;
            try {
                logContent += typeof init.body === 'string' ? init.body : '[Binary/Stream data]';
            } catch (e) {
                logContent += '[Error reading body]';
            }
            logContent += `\n\n`;
        }

        let response: Response;
        let error: any;

        try {
            response = await originalFetch(input, init);
        } catch (e) {
            error = e;
            logContent += `--- Request Failed ---\nError: ${e}\n`;
            writeFileSync(filePath, logContent);
            throw e;
        }

        const duration = Date.now() - startTime;
        logContent += `--- Response (${response.status}) ---\nDuration: ${duration}ms\n\n`;

        // Log Response Headers
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
        });
        logContent += `--- Response Headers ---\n${JSON.stringify(responseHeaders, null, 2)}\n\n`;

        // Clone response to read body
        const callbackResponse = response.clone();

        try {
            const text = await callbackResponse.text();
            logContent += `--- Response Body ---\n`;
            try {
                const json = JSON.parse(text);
                logContent += JSON.stringify(json, null, 2);
            } catch {
                logContent += text;
            }
        } catch (e) {
            logContent += `[Stream/Binary - Could not read body]\n`;
        }

        // Write log to file
        try {
            writeFileSync(filePath, logContent);
            console.log(`📝 Logged external request to ${filePath}`);
        } catch (e) {
            console.error('Failed to write debug log:', e);
        }

        return response;
    };
}
