const express = require('express');
const multer = require('multer');
const documentController = require('../controllers/document.controller');
const authenticateJWT = require('../middleware/auth.middleware');
const decodeParam = require('../middleware/decodeParam.middleware');

const router = express.Router();

// Configure multer for in-memory file storage
// This is suitable for passing the buffer to S3 directly.
// You can add file type filters and size limits here as needed.
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // Example: 10MB limit
  // You can add a fileFilter function here, e.g.:
  // fileFilter: (req, file, cb) => {
  //   if (file.mimetype === 'application/pdf' || file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
  //     cb(null, true);
  //   } else {
  //     cb(new Error('Unsupported file type'), false);
  //   }
  // }
});

// POST /documents - Upload a document
router.post('/',
  authenticateJWT,
  upload.single('document'), // 'document' is the field name from aarogya_api_contract.json
  documentController.uploadDocument
);

// GET /documents/:documentId/url - Get a presigned URL for a document
router.get('/:documentId/url',
  authenticateJWT,
  decodeParam('documentId'),
  documentController.getPresignedUrl
);

// GET /documents/:documentId/status - Get document processing status
router.get('/:documentId/status',
  authenticateJWT,
  decodeParam('documentId'),
  documentController.getDocumentStatus
);

module.exports = router;