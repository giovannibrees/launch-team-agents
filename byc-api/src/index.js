'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const accountRoutes = require('./routes/account');
const campaignRoutes = require('./routes/campaigns');
const eventRoutes = require('./routes/events');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// All API routes under /v1
app.use('/v1', accountRoutes);
app.use('/v1', campaignRoutes);
app.use('/v1', eventRoutes);

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// 404
app.use((req, res) => res.status(404).json({ message: 'Not found.' }));

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error.' });
});

app.listen(PORT, () => console.log(`BYC API running on port ${PORT}`));
