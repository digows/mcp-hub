import { request } from 'undici';
import * as dotenv from 'dotenv';
dotenv.config();

let accessToken: string | null = null;
let refreshToken: string | null = null;
let tokenExpiresAt: number = 0;

const BASE_URL = process.env.FREQTRADE_PUBLIC_URL;

if (!BASE_URL) {
    throw new Error('FREQTRADE_PUBLIC_URL environment variable is required.');
}


export async function login(): Promise<void> {
    const username = process.env.FREQTRADE_USERNAME;
    const password = process.env.FREQTRADE_PASSWORD;

    if (!username || !password) {
        throw new Error('FREQTRADE_USERNAME and FREQTRADE_PASSWORD environment variables are required.');
    }

    const credentials = Buffer.from(`${username}:${password}`).toString('base64');

    const { statusCode, body } = await request(`${BASE_URL}/token/login`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/json',
        },
    });

    if (statusCode !== 200) {
        throw new Error(`Failed to log in to Freqtrade. Status code: ${statusCode}`);
    }

    const data = await body.json() as { access_token: string; refresh_token: string };
    accessToken = data.access_token;
    refreshToken = data.refresh_token;
    // Assume access token expires in 15 minutes (typically freqtrade default)
    tokenExpiresAt = Date.now() + 15 * 60 * 1000 - 30000; // 30s buffer
}

export async function refreshTokenCall(): Promise<void> {
    if (!refreshToken) {
        return login();
    }

    const { statusCode, body } = await request(`${BASE_URL}/token/refresh`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${refreshToken}`,
            'Content-Type': 'application/json',
        },
    });

    if (statusCode !== 200) {
        // If refresh fails, try logging in again
        return login();
    }

    const data = await body.json() as { access_token: string; refresh_token: string };
    accessToken = data.access_token;
    refreshToken = data.refresh_token;
    tokenExpiresAt = Date.now() + 15 * 60 * 1000 - 30000;
}

export async function getValidToken(): Promise<string> {
    if (!accessToken || Date.now() > tokenExpiresAt) {
        await login();
    }
    return accessToken!;
}
