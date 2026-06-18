'use strict';

const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../db/schema');
const { requireApiKey } = require('../middleware/auth');

const router = express.Router();

const VALID_TYPES = [
  'funding_milestone',
  'goal_reached',
  'stretch_goal_reached',
  'velocity_drop',
  'campaign_update',
  'comment_spike',
];

router.get('/events', requireApiKey, (req, res) => {
  const { type, campaign_id } = req.query;
  const limit = Math.min(parseInt(req.query.limit) || 100, 100);

  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({ message: `type is required and must be one of: ${VALID_TYPES.join(', ')}` });
  }

  const db = getDb();

  // Verify campaign belongs to this account if scoped
  if (campaign_id) {
    const camp = db.prepare('SELECT id FROM campaigns WHERE id = ? AND account_id = ?').get(campaign_id, req.account.id);
    if (!camp) return res.status(404).json({ message: 'Campaign not found.' });
  }

  // Compute fresh events server-side, then return from emitted_events (stable ids)
  computeEvents(db, req.account.id, type, campaign_id);

  const rows = db.prepare(`
    SELECT e.id, e.type, e.campaign_id, c.name AS campaign_name,
           c.currency, c.goal, e.payload, e.occurred_at
    FROM emitted_events e
    JOIN campaigns c ON c.id = e.campaign_id
    WHERE e.type = ?
      AND c.account_id = ?
      ${campaign_id ? 'AND e.campaign_id = ?' : ''}
    ORDER BY e.occurred_at DESC
    LIMIT ?
  `).all(...[type, req.account.id, ...(campaign_id ? [campaign_id] : []), limit]);

  const events = rows.map(row => {
    const payload = JSON.parse(row.payload);
    const totalPledged = getTotalPledged(db, row.campaign_id);
    const backerCount = getBackerCount(db, row.campaign_id);
    return {
      id: row.id,
      type: row.type,
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      currency: row.currency,
      amount_pledged: totalPledged,
      goal: row.goal,
      percent_funded: Math.round((totalPledged / row.goal) * 100),
      backer_count: backerCount,
      occurred_at: row.occurred_at,
      data: payload,
    };
  });

  res.json({ events });
});

// ── Event computation (server-side, idempotent) ──────────────────────────────

function computeEvents(db, accountId, type, campaignId) {
  const campaigns = campaignId
    ? db.prepare('SELECT * FROM campaigns WHERE id = ? AND account_id = ?').all(campaignId, accountId)
    : db.prepare('SELECT * FROM campaigns WHERE account_id = ?').all(accountId);

  for (const camp of campaigns) {
    switch (type) {
      case 'funding_milestone':  computeMilestones(db, camp); break;
      case 'goal_reached':       computeGoalReached(db, camp); break;
      case 'stretch_goal_reached': computeStretchGoals(db, camp); break;
      case 'velocity_drop':      computeVelocityDrop(db, camp); break;
      case 'campaign_update':    computeCampaignUpdates(db, camp); break;
      case 'comment_spike':      computeCommentSpike(db, camp); break;
    }
  }
}

function emitOnce(db, eventId, campaignId, type, payload) {
  const existing = db.prepare('SELECT id FROM emitted_events WHERE id = ?').get(eventId);
  if (!existing) {
    db.prepare(`
      INSERT INTO emitted_events (id, campaign_id, type, payload)
      VALUES (?, ?, ?, ?)
    `).run(eventId, campaignId, type, JSON.stringify(payload));
  }
}

function getTotalPledged(db, campaignId) {
  const row = db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM pledges WHERE campaign_id = ?').get(campaignId);
  return row.total;
}

function getBackerCount(db, campaignId) {
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM pledges WHERE campaign_id = ?').get(campaignId);
  return row.cnt;
}

function computeMilestones(db, camp) {
  const total = getTotalPledged(db, camp.id);
  const pct = (total / camp.goal) * 100;

  // Every 10% of goal
  for (let threshold = 10; threshold <= 100; threshold += 10) {
    if (pct >= threshold) {
      const eventId = `evt_${camp.id}_pct_${threshold}`;
      emitOnce(db, eventId, camp.id, 'funding_milestone', { milestone_basis: 'percent', milestone_value: threshold });
    }
  }

  // Round currency amounts: every $1k up to $10k, every $5k up to $100k, every $25k above
  const roundAmounts = generateRoundAmounts(camp.goal);
  for (const amt of roundAmounts) {
    if (total >= amt) {
      const eventId = `evt_${camp.id}_amt_${amt}`;
      emitOnce(db, eventId, camp.id, 'funding_milestone', { milestone_basis: 'amount', milestone_value: amt });
    }
  }
}

function generateRoundAmounts(goal) {
  const amounts = new Set();
  for (let a = 1000; a <= Math.min(goal, 10000); a += 1000) amounts.add(a);
  for (let a = 10000; a <= Math.min(goal, 100000); a += 5000) amounts.add(a);
  for (let a = 100000; a <= goal; a += 25000) amounts.add(a);
  return [...amounts];
}

function computeGoalReached(db, camp) {
  const total = getTotalPledged(db, camp.id);
  if (total >= camp.goal) {
    emitOnce(db, `evt_${camp.id}_goal`, camp.id, 'goal_reached', {});
  }
}

function computeStretchGoals(db, camp) {
  const total = getTotalPledged(db, camp.id);
  const stretches = db.prepare('SELECT * FROM stretch_goals WHERE campaign_id = ?').all(camp.id);
  for (const sg of stretches) {
    if (total >= sg.value) {
      emitOnce(db, `evt_${camp.id}_stretch_${sg.id}`, camp.id, 'stretch_goal_reached', {
        stretch_id: sg.id,
        stretch_label: sg.label,
        stretch_value: sg.value,
      });
    }
  }
}

function computeVelocityDrop(db, camp) {
  const windowHours = 24;
  const dropThreshold = 40; // percent

  const now = new Date();
  const windowStart = new Date(now - windowHours * 3600 * 1000).toISOString();
  const priorStart = new Date(now - 2 * windowHours * 3600 * 1000).toISOString();

  const currentRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM pledges
    WHERE campaign_id = ? AND pledged_at >= ?
  `).get(camp.id, windowStart);

  const priorRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM pledges
    WHERE campaign_id = ? AND pledged_at >= ? AND pledged_at < ?
  `).get(camp.id, priorStart, windowStart);

  const currentRate = currentRow.total / windowHours;
  const priorRate = priorRow.total / windowHours;

  if (priorRate === 0) return; // no baseline to compare

  const dropPct = ((priorRate - currentRate) / priorRate) * 100;

  if (dropPct >= dropThreshold) {
    // Check if there's already an active episode
    const active = db.prepare(`
      SELECT id FROM velocity_drop_episodes WHERE campaign_id = ? AND active = 1
    `).get(camp.id);

    if (!active) {
      const episodeId = 'ep_' + crypto.randomBytes(6).toString('hex');
      db.prepare(`INSERT INTO velocity_drop_episodes (id, campaign_id) VALUES (?, ?)`).run(episodeId, camp.id);
      emitOnce(db, `evt_${camp.id}_veldrop_${episodeId}`, camp.id, 'velocity_drop', {
        window_hours: windowHours,
        current_rate: Math.round(currentRate * 100) / 100,
        prior_rate: Math.round(priorRate * 100) / 100,
        drop_pct: Math.round(dropPct),
      });
    }
  } else {
    // Rate recovered — close any active episode
    db.prepare(`
      UPDATE velocity_drop_episodes SET active = 0, ended_at = datetime('now')
      WHERE campaign_id = ? AND active = 1
    `).run(camp.id);
  }
}

function computeCampaignUpdates(db, camp) {
  const updates = db.prepare('SELECT * FROM campaign_updates WHERE campaign_id = ?').all(camp.id);
  for (const u of updates) {
    emitOnce(db, `evt_${camp.id}_update_${u.id}`, camp.id, 'campaign_update', {
      update_id: u.id,
      update_title: u.title,
    });
  }
}

function computeCommentSpike(db, camp) {
  const windowHours = 6;
  const spikeMultiplier = 3; // spike if window count > 3x baseline

  const now = new Date();
  const windowStart = new Date(now - windowHours * 3600 * 1000).toISOString();
  const baselineStart = new Date(now - 7 * 24 * 3600 * 1000).toISOString(); // 7-day baseline

  const windowRow = db.prepare(`
    SELECT COUNT(*) AS cnt FROM comments
    WHERE campaign_id = ? AND created_at >= ?
  `).get(camp.id, windowStart);

  const baselineRow = db.prepare(`
    SELECT COUNT(*) AS cnt FROM comments
    WHERE campaign_id = ? AND created_at >= ? AND created_at < ?
  `).get(camp.id, baselineStart, windowStart);

  const commentCount = windowRow.cnt;
  const baselineDays = 7 * (24 / windowHours);
  const baselineAvg = baselineDays > 0 ? baselineRow.cnt / baselineDays : 0;

  if (baselineAvg === 0 || commentCount < 5) return;

  if (commentCount >= baselineAvg * spikeMultiplier) {
    const active = db.prepare(`
      SELECT id FROM comment_spike_episodes WHERE campaign_id = ? AND active = 1
    `).get(camp.id);

    if (!active) {
      const episodeId = 'ep_' + crypto.randomBytes(6).toString('hex');
      db.prepare(`INSERT INTO comment_spike_episodes (id, campaign_id) VALUES (?, ?)`).run(episodeId, camp.id);
      emitOnce(db, `evt_${camp.id}_commentspike_${episodeId}`, camp.id, 'comment_spike', {
        window_hours: windowHours,
        comment_count: commentCount,
        baseline_count: Math.round(baselineAvg),
      });
    }
  } else {
    db.prepare(`
      UPDATE comment_spike_episodes SET active = 0, ended_at = datetime('now')
      WHERE campaign_id = ? AND active = 1
    `).run(camp.id);
  }
}

module.exports = router;
