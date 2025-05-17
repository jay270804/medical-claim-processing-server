const express = require('express');
const claimController = require('../controllers/claim.controller');
const authenticateJWT = require('../middleware/auth.middleware');

const router = express.Router();

// GET /claims - Fetch all claims for the authenticated user
router.get('/', authenticateJWT, claimController.getAllClaims);

// GET /claims/:claimId - Fetch a specific claim by ID
router.get('/:claimId', authenticateJWT, claimController.getClaimById);

module.exports = router;