/**
 * Public Routes — no authentication required.
 * Used for branding detection before login.
 */

const express = require('express');
const router  = express.Router();
const { getTenantRepository } = require('../repositories/tenant');

const DEFAULT_BRANDING = {
  companyName: 'SmartWorkforce',
  shortName:   'SW',
  tagline:     'Workforce Management Platform.',
  logoBase64:  null,
};

// GET /api/public/branding
// Reads the Host header, finds matching tenant by domain, returns branding config.
// Falls back to defaults if no tenant matches.
router.get('/branding', async (req, res) => {
  try {
    const hostname = req.hostname || '';
    const repo     = getTenantRepository();
    const tenant   = await repo.findByHostname(hostname);

    const saved = tenant?.settings?.branding || {};
    const branding = {
      companyName: saved.companyName || tenant?.name        || DEFAULT_BRANDING.companyName,
      shortName:   saved.shortName   || tenant?.code        || DEFAULT_BRANDING.shortName,
      tagline:     saved.tagline     || DEFAULT_BRANDING.tagline,
      logoBase64:  saved.logoBase64  || null,
    };

    return res.json({ data: branding });
  } catch (_) {
    return res.json({ data: DEFAULT_BRANDING });
  }
});

module.exports = router;
