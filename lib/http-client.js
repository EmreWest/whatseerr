#!/usr/bin/env node

/**
 * Shared HTTP client utility
 * 
 * Provides a reusable HTTP client for making requests to APIs.
 */

import https from 'https';
import http from 'http';

/**
 * Creates an HTTP client for making requests
 * @param {string} baseUrl - Base URL for the API (e.g., https://api.example.com)
 * @param {Object} options - Optional configuration
 * @param {boolean} options.defaultContentType - Whether to set default Content-Type header (default: false)
 * @returns {Object} Client with request method
 */
export function createHttpClient(baseUrl, options = {}) {
  const { defaultContentType = false } = options;
  const url = new URL(baseUrl);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  function request(method, pathName, { headers = {}, query = {}, body = null } = {}) {
    const fullUrl = new URL(pathName, baseUrl);
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        fullUrl.searchParams.append(k, String(v));
      }
    });

    const requestHeaders = defaultContentType 
      ? { 'Content-Type': 'application/json', ...headers }
      : headers;

    const requestOptions = {
      method,
      hostname: fullUrl.hostname,
      port: fullUrl.port || (isHttps ? 443 : 80),
      path: fullUrl.pathname + fullUrl.search,
      headers: requestHeaders,
      rejectUnauthorized: false, // allow self-signed if needed; adjust for your setup
    };

    return new Promise((resolve, reject) => {
      const req = lib.request(requestOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch {
            // ignore JSON parse error, keep raw string
          }
          resolve({ status: res.statusCode, headers: res.headers, data: parsed ?? data });
        });
      });

      req.on('error', (err) => reject(err));

      if (body) {
        const json = JSON.stringify(body);
        if (!defaultContentType) {
          req.setHeader('Content-Type', 'application/json');
        }
        req.setHeader('Content-Length', Buffer.byteLength(json));
        req.write(json);
      }

      req.end();
    });
  }

  return { request };
}

