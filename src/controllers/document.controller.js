const documentService = require('../services/document.service');

class DocumentController {
  async uploadDocument(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: { code: 'NO_FILE_UPLOADED', message: 'No document file was uploaded.' }
        });
      }
      const { documentType, description } = req.body;
      const userId = req.user.id; // Assuming authenticateJWT middleware adds req.user

      if (!documentType) {
        return res.status(400).json({
            success: false,
            error: { code: 'MISSING_DOCUMENT_TYPE', message: 'documentType is required.' }
        });
      }

      const result = await documentService.uploadDocument(req.file, userId, documentType, description || '');

      return res.status(201).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('[uploadDocumentController] Error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'UPLOAD_FAILED', message: error.message || 'Failed to upload document.' }
      });
    }
  }

  async getPresignedUrl(req, res) {
    try {
      const { documentId } = req.params;
      const userId = req.user.id;
      const result = await documentService.generatePresignedUrl(documentId, userId);
      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('[getPresignedUrlController] Error:', error);
      if (error.statusCode === 404) {
        return res.status(404).json({
            success: false,
            error: { code: 'RESOURCE_NOT_FOUND', message: error.message }
        });
      }
      return res.status(500).json({
        success: false,
        error: { code: 'URL_GENERATION_FAILED', message: error.message || 'Failed to generate presigned URL.' }
      });
    }
  }

  async getDocumentStatus(req, res) {
    try {
      const { documentId } = req.params;
      const userId = req.user.id;
      const result = await documentService.getDocumentStatus(documentId, userId);
      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('[getDocumentStatusController] Error:', error);
      if (error.statusCode === 404) {
        return res.status(404).json({
            success: false,
            error: { code: 'RESOURCE_NOT_FOUND', message: error.message }
        });
      }
      return res.status(500).json({
        success: false,
        error: { code: 'STATUS_RETRIEVAL_FAILED', message: error.message || 'Failed to retrieve document status.' }
      });
    }
  }
}

module.exports = new DocumentController();