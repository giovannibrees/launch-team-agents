'use strict';

module.exports = {
  key: 'campaignList',
  noun: 'Campaign',
  display: {
    label: 'Campaign List',
    description: 'Internal trigger used to populate campaign dropdowns.',
    hidden: true,
  },
  operation: {
    perform: async (z, bundle) => {
      const res = await z.request({
        url: 'https://api.boostyourcampaign.com/v1/campaigns',
        params: { limit: 100 },
      });
      return res.json.campaigns; // [{ id, name }]
    },
    sample: { id: 'camp_123', name: 'My Cool Gadget' },
  },
};
