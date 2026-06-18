'use strict';

module.exports = {
  key: 'goal_reached',
  noun: 'Goal',
  display: {
    label: 'Goal Reached',
    description:
      'Triggers the moment a campaign's total pledges reach or exceed its funding goal.',
  },
  operation: {
    type: 'polling',
    inputFields: [
      {
        key: 'campaign_id',
        label: 'Campaign',
        type: 'string',
        dynamic: 'campaignList.id.name',
        required: false,
        helpText: 'Leave blank to watch all of your campaigns.',
      },
    ],
    perform: async (z, bundle) => {
      const params = { type: 'goal_reached', limit: 100, order: 'desc' };
      if (bundle.inputData.campaign_id) {
        params.campaign_id = bundle.inputData.campaign_id;
      }
      const res = await z.request({
        url: 'https://api.boostyourcampaign.com/v1/events',
        params,
      });
      return res.json.events;
    },
    sample: {
      id: 'evt_camp_123_goal',
      type: 'goal_reached',
      campaign_id: 'camp_123',
      campaign_name: 'My Cool Gadget',
      currency: 'USD',
      amount_pledged: 50000,
      goal: 50000,
      percent_funded: 100,
      backer_count: 820,
      occurred_at: '2026-06-18T12:00:00Z',
      data: {},
    },
    outputFields: [
      { key: 'id', label: 'Event ID' },
      { key: 'campaign_id', label: 'Campaign ID' },
      { key: 'campaign_name', label: 'Campaign' },
      { key: 'currency', label: 'Currency' },
      { key: 'amount_pledged', label: 'Amount Pledged', type: 'number' },
      { key: 'goal', label: 'Goal', type: 'number' },
      { key: 'percent_funded', label: 'Percent Funded', type: 'number' },
      { key: 'backer_count', label: 'Backer Count', type: 'number' },
      { key: 'occurred_at', label: 'Occurred At', type: 'datetime' },
    ],
  },
};
