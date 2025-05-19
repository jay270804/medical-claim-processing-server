const claimService = require('../services/claim.service');

class ClaimController {
  async getClaimById(req, res) {
    console.log(`[getClaimById] Received request for claimId: ${req.params.claimId} from user: ${req.user.id}`);
    try {
      const { claimId } = req.params;
      const userId = req.user.id; // From authenticateJWT middleware
      const claim = await claimService.getClaimById(claimId, userId);
      return res.status(200).json({
        success: true,
        data: claim,
      });
    } catch (error) {
      console.error('[getClaimByIdController] Error:', error);
      if (error.statusCode === 404) {
        return res.status(404).json({
            success: false,
            error: { code: 'RESOURCE_NOT_FOUND', message: error.message }
        });
      } else if (error.statusCode === 403) {
        return res.status(403).json({
            success: false,
            error: { code: 'FORBIDDEN', message: error.message }
        });
      }
      return res.status(500).json({
        success: false,
        error: { code: 'RETRIEVAL_FAILED', message: error.message || 'Failed to retrieve claim.' }
      });
    }
  }

  async getAllClaims(req, res) {
    try {
      const userId = req.user.id; // From authenticateJWT middleware
      // Extract query parameters as defined in aarogya_api_contract.json
      const { status, page, limit, sortBy, sortDirection } = req.query;
      const queryParams = { status, page, limit, sortBy, sortDirection };

      const result = await claimService.getClaims(userId, queryParams);
      return res.status(200).json({
        success: true,
        data: result, // This will include claims and pagination info
      });
    } catch (error) {
      console.error('[getAllClaimsController] Error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'LIST_FAILED', message: error.message || 'Failed to list claims.' }
      });
    }
  }
}

module.exports = new ClaimController();