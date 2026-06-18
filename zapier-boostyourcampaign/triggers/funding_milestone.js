'use strict';

module.exports = {
  key: 'funding_milestone',
  noun: 'Milestone',
  display: {
    label: 'Funding Milestone Hit',
    description:
      'Triggers when a campaign crosses a funding milestone – every 10% of goal or a round currency amount.',
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
      const params = { type: 'funding_milestone', limit: 100, order: 'desc' };
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
      id: 'evt_camp_123_pct_50',
      type: 'funding_milestone',
      campaign_id: 'camp_123',
      campaign_name: 'My Cool Gadget',
      currency: 'USD',
      amount_pledged: 25000,
      goal: 50000,
      percent_funded: 50,
      backer_count: 410,
      occurred_at: '2026-06-18T10:00:00Z',
      data: { milestone_basis: 'percent', milestone_value: 50 },
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
      { key: 'data__milestone_basis', label: 'Milestone Basis' },
      { key: 'data__milestone_value', label: 'Milestone Value', type: 'number' },
    ],
  },
};
