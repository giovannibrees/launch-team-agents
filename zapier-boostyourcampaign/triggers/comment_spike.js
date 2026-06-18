'use strict';

module.exports = {
  key: 'comment_spike',
  noun: 'Comment Spike',
  display: {
    label: 'Comment Spike Detected',
    description:
      'Triggers when comment volume over a time window significantly exceeds the baseline. ' +
      'One trigger per spike episode.',
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
      const params = { type: 'comment_spike', limit: 100, order: 'desc' };
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
      id: 'evt_camp_123_commentspike_ep_001',
      type: 'comment_spike',
      campaign_id: 'camp_123',
      campaign_name: 'My Cool Gadget',
      currency: 'USD',
      amount_pledged: 40000,
      goal: 50000,
      percent_funded: 80,
      backer_count: 650,
      occurred_at: '2026-06-18T20:00:00Z',
      data: {
        window_hours: 6,
        comment_count: 85,
        baseline_count: 12,
      },
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
      { key: 'data__window_hours', label: 'Window (Hours)', type: 'number' },
      { key: 'data__comment_count', label: 'Comments in Window', type: 'number' },
      { key: 'data__baseline_count', label: 'Baseline Comment Count', type: 'number' },
    ],
  },
};
