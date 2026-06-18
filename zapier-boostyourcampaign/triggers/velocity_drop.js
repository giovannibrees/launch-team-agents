'use strict';

module.exports = {
  key: 'velocity_drop',
  noun: 'Velocity Drop',
  display: {
    label: 'Funding Velocity Drop Detected',
    description:
      'Triggers when the trailing pledge rate drops significantly compared to the prior comparable window. ' +
      'One trigger per drop episode – does not re-fire until the rate recovers.',
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
      const params = { type: 'velocity_drop', limit: 100, order: 'desc' };
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
      id: 'evt_camp_123_veldrop_ep_001',
      type: 'velocity_drop',
      campaign_id: 'camp_123',
      campaign_name: 'My Cool Gadget',
      currency: 'USD',
      amount_pledged: 30000,
      goal: 50000,
      percent_funded: 60,
      backer_count: 500,
      occurred_at: '2026-06-18T16:00:00Z',
      data: {
        window_hours: 24,
        current_rate: 120,
        prior_rate: 300,
        drop_pct: 60,
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
      { key: 'data__current_rate', label: 'Current Pledge Rate (per hour)', type: 'number' },
      { key: 'data__prior_rate', label: 'Prior Pledge Rate (per hour)', type: 'number' },
      { key: 'data__drop_pct', label: 'Drop Percentage', type: 'number' },
    ],
  },
};
