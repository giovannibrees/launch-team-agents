'use strict';

module.exports = {
  key: 'stretch_goal_reached',
  noun: 'Stretch Goal',
  display: {
    label: 'Stretch Goal Reached',
    description:
      'Triggers when a campaign crosses a defined stretch goal threshold.',
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
      const params = { type: 'stretch_goal_reached', limit: 100, order: 'desc' };
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
      id: 'evt_camp_123_stretch_sg_001',
      type: 'stretch_goal_reached',
      campaign_id: 'camp_123',
      campaign_name: 'My Cool Gadget',
      currency: 'USD',
      amount_pledged: 75000,
      goal: 50000,
      percent_funded: 150,
      backer_count: 1100,
      occurred_at: '2026-06-18T14:00:00Z',
      data: {
        stretch_id: 'sg_001',
        stretch_label: 'Color Variant Unlocked',
        stretch_value: 75000,
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
      { key: 'data__stretch_id', label: 'Stretch Goal ID' },
      { key: 'data__stretch_label', label: 'Stretch Goal Label' },
      { key: 'data__stretch_value', label: 'Stretch Goal Amount', type: 'number' },
    ],
  },
};
