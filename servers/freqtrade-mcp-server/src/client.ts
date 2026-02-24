import { request, Dispatcher } from 'undici';
import { getValidToken, refreshTokenCall } from './auth.js';

const BASE_URL = process.env.FREQTRADE_PUBLIC_URL || 'https://freqtrade.home.digows.com/api/v1';

export async function freqtradeRequest<T>(
    endpoint: string,
    options?: Omit<Dispatcher.RequestOptions, 'origin' | 'path'>
): Promise<T> {
    const url = `${BASE_URL}${endpoint}`;
    let token = await getValidToken();

    const makeReq = async (currentToken: string) => {
        return request(url, {
            ...options,
            headers: {
                Authorization: `Bearer ${currentToken}`,
                'Content-Type': 'application/json',
                ...(options?.headers || {}),
            },
        });
    };

    let response = await makeReq(token);

    if (response.statusCode === 401) {
        // Attempt refresh once
        await refreshTokenCall();
        token = await getValidToken();
        // Consume the previous response body stream to avoid memory leaks
        await response.body.text();
        response = await makeReq(token);
    }

    if (response.statusCode >= 400) {
        const errorText = await response.body.text();
        throw new Error(`Freqtrade API Error: [${response.statusCode}] ${endpoint} - ${errorText}`);
    }

    // Handle empty responses
    const text = await response.body.text();
    if (!text) return {} as T;

    try {
        return JSON.parse(text) as T;
    } catch {
        return text as any as T;
    }
}
