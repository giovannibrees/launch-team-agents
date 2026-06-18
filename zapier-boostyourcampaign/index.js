'use strict';

const { version } = require('./package.json');
const platformVersion = require('zapier-platform-core').version;

const { authentication, addApiKeyHeader, throwOnError } = require('./authentication');

const campaignList = require('./triggers/campaign_list');
const fundingMilestone = require('./triggers/funding_milestone');
const goalReached = require('./triggers/goal_reached');
const stretchGoalReached = require('./triggers/stretch_goal_reached');
const velocityDrop = require('./triggers/velocity_drop');
const campaignUpdate = require('./triggers/campaign_update');
const commentSpike = require('./triggers/comment_spike');

module.exports = {
  version,
  platformVersion,
  authentication,
  beforeRequest: [addApiKeyHeader],
  afterResponse: [throwOnError],
  triggers: {
    [campaignList.key]: campaignList,
    [fundingMilestone.key]: fundingMilestone,
    [goalReached.key]: goalReached,
    [stretchGoalReached.key]: stretchGoalReached,
    [velocityDrop.key]: velocityDrop,
    [campaignUpdate.key]: campaignUpdate,
    [commentSpike.key]: commentSpike,
  },
};
