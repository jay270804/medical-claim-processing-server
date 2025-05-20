const claimService = require('../services/claim.service');

class ClaimController {
  constructor() {
    // Bind methods to ensure 'this' context is preserved
    this.getClaimById = this.getClaimById.bind(this);
    this.getAllClaims = this.getAllClaims.bind(this);
    this._formatClaimResponse = this._formatClaimResponse.bind(this);
    this._formatClaimSummary = this._formatClaimSummary.bind(this);
  }

  // Helper to format a single claim response
  _formatClaimResponse(claim) {
    if (!claim) return null;

    return {
      id: claim.id,
      documentId: claim.documentId,
      status: claim.status,
      createdAt: claim.createdAt,
      updatedAt: claim.updatedAt,
      extractedData: claim.extractedData || {
        lines: [],
        metadata: {
          processedAt: claim.createdAt,
          confidenceThreshold: 0.7
        }
      }
    };
  }

  // Helper to format a claim summary for list view
  _formatClaimSummary(claim) {
    if (!claim) return null;

    return {
      id: claim.id,
      documentId: claim.documentId,
      status: claim.status,
      createdAt: claim.createdAt,
      updatedAt: claim.updatedAt,
      summary: {
        patientName: claim.patientName || null,
        amount: claim.amount ? parseFloat(claim.amount) : null,
        serviceDate: claim.serviceDate || null
      }
    };
  }

  async getClaimById(req, res) {
    console.log(`[getClaimById] Received request for claimId: ${req.params.claimId} from user: ${req.user.id}`);
    try {
      const { claimId } = req.params;
      const userId = req.user.id;
      const claim = await claimService.getClaimById(claimId, userId);

      if (!claim) {
        return res.status(404).json({
          success: false,
          error: { code: 'RESOURCE_NOT_FOUND', message: 'Claim not found' }
        });
      }

      const formattedClaim = this._formatClaimResponse(claim);
      if (!formattedClaim) {
        throw new Error('Failed to format claim data');
      }

      return res.status(200).json({
        success: true,
        data: formattedClaim
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
      const userId = req.user.id;
      const { status, page, limit, sortBy, sortDirection } = req.query;
      const queryParams = { status, page, limit, sortBy, sortDirection };

      const result = await claimService.getClaims(userId, queryParams);

      if (!result || !Array.isArray(result.claims)) {
        throw new Error('Invalid claims data received from service');
      }

      // Format the response according to the new contract
      const formattedClaims = result.claims
        .map(claim => this._formatClaimSummary(claim))
        .filter(claim => claim !== null); // Remove any null entries

      return res.status(200).json({
        success: true,
        data: {
          claims: formattedClaims,
          pagination: result.pagination || {
            totalItems: formattedClaims.length,
            totalPages: 1,
            currentPage: parseInt(page) || 1,
            limit: parseInt(limit) || 10
          }
        }
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