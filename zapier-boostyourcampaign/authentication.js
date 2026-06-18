'use strict';

const authentication = {
  type: 'custom',
  fields: [
    {
      key: 'apiKey',
      label: 'API Key',
      required: true,
      type: 'password',
      helpText:
        'Find your API key in BoostYourCampaign under **Settings › Developer**. ' +
        'You can generate a new key at any time from that page.',
    },
  ],
  test: {
    url: 'https://api.boostyourcampaign.com/v1/account',
  },
  connectionLabel: '{{json.account.name}}',
};

const addApiKeyHeader = (request, z, bundle) => {
  if (bundle.authData.apiKey) {
    request.headers.Authorization = `Bearer ${bundle.authData.apiKey}`;
  }
  return request;
};

const throwOnError = (response, z) => {
  if (response.status >= 400) {
    let msg = 'Unexpected error from the BoostYourCampaign API.';
    try {
      const body = response.json;
      if (body && body.message) {
        msg = body.message;
      } else if (body && body.error) {
        msg = body.error;
      }
    } catch (_) {
      // response body is not JSON – use the default message
    }

    if (response.status === 401) {
      msg = 'Invalid API key. Please reconnect your BoostYourCampaign account.';
    } else if (response.status === 403) {
      msg = 'Your API key does not have permission to perform this action.';
    } else if (response.status === 429) {
      msg =
        'BoostYourCampaign rate limit reached. Please wait a moment and try again. ' +
        'If this persists, contact support@boostyourcampaign.com.';
    }

    throw new z.errors.Error(msg, 'APIError', response.status);
  }
  return response;
};

module.exports = { authentication, addApiKeyHeader, throwOnError };
