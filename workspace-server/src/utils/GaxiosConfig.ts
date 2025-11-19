/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GaxiosOptions } from 'gaxios';
import { logToFile } from './logger';

export const gaxiosOptions: GaxiosOptions = {
    retryConfig: {
        retry: 3,
        noResponseRetries: 3,
        retryDelay: 1000,
        httpMethodsToRetry: ['GET', 'HEAD', 'OPTIONS', 'DELETE', 'PUT'],
        statusCodesToRetry: [
            [429, 429],
            [500, 599],
        ],
        onRetryAttempt: (err) => {
            const config = err.config as GaxiosOptions;
            logToFile(`Retrying request to ${config.url}, attempt #${config.retryConfig?.currentRetryAttempt}`);
            logToFile(`Error: ${err.message}`);
        }
    },
    timeout: 30000,
};

// Extended timeout for media upload operations
export const mediaUploadOptions: GaxiosOptions = {
    ...gaxiosOptions,
    timeout: 60000, // 60 seconds for media uploads
};
