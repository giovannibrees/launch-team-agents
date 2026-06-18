'use strict';

module.exports = {
  key: 'campaign_update',
  noun: 'Campaign Update',
  display: {
    label: 'New Campaign Update Posted',
    description:
      'Triggers when a campaign creator publishes a new campaign update.',
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
      const params = { type: 'campaign_update', limit: 100, order: 'desc' };
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
      id: 'evt_camp_123_update_upd_001',
      type: 'campaign_update',
      campaign_id: 'camp_123',
      campaign_name: 'My Cool Gadget',
      currency: 'USD',
      amount_pledged: 35000,
      goal: 50000,
      percent_funded: 70,
      backer_count: 580,
      occurred_at: '2026-06-18T18:00:00Z',
      data: {
        update_id: 'upd_001',
        update_title: 'Manufacturing Update – June 2026',
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
      { key: 'data__update_id', label: 'Update ID' },
      { key: 'data__update_title', label: 'Update Title' },
    ],
  },
};
