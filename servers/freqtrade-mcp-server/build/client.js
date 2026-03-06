"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.freqtradeRequest = freqtradeRequest;
const undici_1 = require("undici");
const auth_js_1 = require("./auth.js");
const BASE_URL = process.env.FREQTRADE_PUBLIC_URL;
async function freqtradeRequest(endpoint, options) {
    const url = `${BASE_URL}${endpoint}`;
    let token = await (0, auth_js_1.getValidToken)();
    const makeReq = async (currentToken) => {
        return (0, undici_1.request)(url, {
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
        await (0, auth_js_1.refreshTokenCall)();
        token = await (0, auth_js_1.getValidToken)();
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
    if (!text)
        return {};
    try {
        return JSON.parse(text);
    }
    catch {
        return text;
    }
}
