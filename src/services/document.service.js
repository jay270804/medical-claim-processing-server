const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const aiService = require('./ai.service');
const claimService = require('./claim.service');

class DocumentService {
  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION,
    });
    this.bucketName = process.env.S3_BUCKET_NAME;

    if (!process.env.AWS_REGION) {
      console.error('CRITICAL: AWS_REGION environment variable is not set for S3 client.');
      throw new Error('AWS_REGION environment variable is required.');
    }
    if (!this.bucketName) {
      console.error('CRITICAL: S3_BUCKET_NAME environment variable is not set.');
      throw new Error('S3_BUCKET_NAME environment variable is required.');
    }
    console.log(`[DocumentService Constructor] S3 Bucket Name: ${this.bucketName}`);
  }

  async uploadDocument(file, userId, documentType, description) {
    const documentId = `${userId}/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    const putObjectParams = {
      Bucket: this.bucketName,
      Key: documentId,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    try {
      await this.s3Client.send(new PutObjectCommand(putObjectParams));
      console.log(`[uploadDocument] File uploaded to S3: ${documentId}`);

      console.log(`[uploadDocument] Processing document with AI Service: ${documentId}`);
      const extractedData = await aiService.extractMedicalDataFromDocument(file.buffer, file.mimetype);
      console.log(`[uploadDocument] AI Service extracted data for ${documentId}`);

      const newClaim = await claimService.createClaimInternal(userId, documentId, documentId, extractedData);
      console.log(`[uploadDocument] Claim created for document ${documentId}: ${newClaim.id}`);

      return {
        documentId: documentId,
        fileName: file.originalname,
        documentType: documentType,
        description: description,
        uploadedAt: newClaim.createdAt,
        status: newClaim.status,
        claimId: newClaim.id,
      };
    } catch (error) {
      console.error('[uploadDocument] Error during document upload and claim creation process:', error);
      throw new Error(error.message || 'Failed to upload document and initiate claim.');
    }
  }

  async getDocumentMetadata(documentId, userId) {
    const params = {
      TableName: this.documentsTable,
      Key: { documentId },
    };
    try {
      const { Item } = await this.dynamoDocClient.send(new DynamoGetCommand(params));
      if (!Item) {
        const error = new Error('Document not found.');
        error.statusCode = 404;
        throw error;
      }
      // Authorize: Check if the document belongs to the requesting user
      if (Item.userId !== userId) {
        console.warn(`[getDocumentMetadata] Unauthorized access attempt for document ${documentId} by user ${userId}`);
        const error = new Error('Access denied to this document.');
        error.statusCode = 403; // Forbidden
        throw error;
      }
      return Item;
    } catch (error) {
        console.error('[getDocumentMetadata] Error fetching from DynamoDB:', error);
        if (error.statusCode) throw error; // Rethrow errors with status codes (404, 403)
        throw new Error('Could not retrieve document metadata.');
    }
  }

  async generatePresignedUrl(documentId, userId) {
    try {
      const claim = await claimService.getClaimByS3Key(documentId, userId);
      console.log(`[generatePresignedUrl] Access authorized for user ${userId} to document ${documentId} via claim ${claim.id}`);

      // Determine file name for download
      const fileName = claim.extractedData?.fileName || documentId.substring(documentId.lastIndexOf('/')+1);

      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: documentId,
        ResponseContentDisposition: `attachment; filename=\"${fileName}\"` // Force download
      });

      const expiresIn = 3600; // 1 hour
      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      console.log(`[generatePresignedUrl] Generated URL for S3 Key: ${documentId} with download option`);
      return {
        documentId: documentId,
        fileName: fileName,
        presignedUrl: url,
        expiresAt: expiresAt,
      };
    } catch (error) {
      console.error('[generatePresignedUrl] Error:', error);
      if (error.statusCode === 404 || error.statusCode === 403) throw error;
      throw new Error('Failed to generate presigned URL.');
    }
  }

  async getDocumentStatus(documentId, userId) {
    try {
      const claim = await claimService.getClaimByS3Key(documentId, userId);
      console.log(`[getDocumentStatus] Retrieved claim for document ${documentId} to determine status: ClaimID ${claim.id}`);

      let documentStatus = 'UNKNOWN';
      let progress = 0;

      if (claim.status === 'PROCESSED') {
        documentStatus = 'PROCESSED'; // Or map to 'COMPLETED' if that aligns with API contract
        progress = 100;
      } else if (claim.status === 'NOT_PROCESSED') {
        documentStatus = 'NOT_PROCESSED'; // Or map to 'FAILED' or similar
        progress = 0; // Indicates processing attempted but failed or yielded no data
      }
      // If claim.status is undefined or unexpected, it remains UNKNOWN with 0 progress

      return {
        documentId: documentId,
        status: documentStatus,
        progress: progress,
        startedAt: claim.createdAt, // Document processing starts when claim is initiated
        completedAt: (documentStatus === 'PROCESSED') ? claim.updatedAt : null, // Consider if updatedAt is always set for PROCESSED
        claimId: claim.id,
      };
    } catch (error) {
      console.error('[getDocumentStatus] Error:', error);
      if (error.statusCode === 404 || error.statusCode === 403) throw error;
      throw new Error('Failed to retrieve document status.');
    }
  }

  // TODO: Add a method to update document metadata (e.g., status, claimId)
  // async updateDocumentStatus(documentId, userId, newStatus, claimId = null) { ... }
}

module.exports = new DocumentService();