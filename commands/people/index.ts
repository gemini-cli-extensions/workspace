/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    getUserProfile,
    getMe,
    getUserManager,
} from '../../workspace-server/src/services/PeopleService';

export const get_user_profile = {
  name: 'get_user_profile',
  description: 'Get a user\'s profile by ID, email, or name.',
  parameters: {
    type: 'object',
    properties: {
      userId: {
        type: 'string',
        description: 'The ID of the user.',
      },
      email: {
        type: 'string',
        description: 'The email address of the user.',
      },
      name: {
        type: 'string',
        description: 'The name of the user.',
      },
    },
  },
  function: getUserProfile,
};

export const get_me = {
    name: 'get_me',
    description: 'Get the user\'s profile.',
    parameters: {
        type: 'object',
        properties: {},
    },
    function: getMe,
};

export const get_user_manager = {
    name: 'get_user_manager',
    description: 'Get the user\'s manager.',
    parameters: {
        type: 'object',
        properties: {
            userId: {
                type: 'string',
                description: 'The ID of the user.',
            },
        },
    },
    function: getUserManager,
};
