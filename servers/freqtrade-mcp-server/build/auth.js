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
exports.login = login;
exports.refreshTokenCall = refreshTokenCall;
exports.getValidToken = getValidToken;
const undici_1 = require("undici");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
let accessToken = null;
let refreshToken = null;
let tokenExpiresAt = 0;
const BASE_URL = process.env.FREQTRADE_PUBLIC_URL || 'https://freqtrade.home.digows.com/api/v1';
async function login() {
    const username = process.env.FREQTRADE_USERNAME;
    const password = process.env.FREQTRADE_PASSWORD;
    if (!username || !password) {
        throw new Error('FREQTRADE_USERNAME and FREQTRADE_PASSWORD environment variables are required.');
    }
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    const { statusCode, body } = await (0, undici_1.request)(`${BASE_URL}/token/login`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/json',
        },
    });
    if (statusCode !== 200) {
        throw new Error(`Failed to log in to Freqtrade. Status code: ${statusCode}`);
    }
    const data = await body.json();
    accessToken = data.access_token;
    refreshToken = data.refresh_token;
    // Assume access token expires in 15 minutes (typically freqtrade default)
    tokenExpiresAt = Date.now() + 15 * 60 * 1000 - 30000; // 30s buffer
}
async function refreshTokenCall() {
    if (!refreshToken) {
        return login();
    }
    const { statusCode, body } = await (0, undici_1.request)(`${BASE_URL}/token/refresh`, {
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
    const data = await body.json();
    accessToken = data.access_token;
    refreshToken = data.refresh_token;
    tokenExpiresAt = Date.now() + 15 * 60 * 1000 - 30000;
}
async function getValidToken() {
    if (!accessToken || Date.now() > tokenExpiresAt) {
        await login();
    }
    return accessToken;
}
