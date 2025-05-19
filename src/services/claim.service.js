const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, QueryCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

class ClaimService {
  constructor() {
    const client = new DynamoDBClient({ region: process.env.AWS_REGION });
    this.docClient = DynamoDBDocumentClient.from(client);
    this.tableName = process.env.CLAIMS_TABLE;

    if (!process.env.AWS_REGION) {
      console.error('CRITICAL: AWS_REGION environment variable is not set.');
      throw new Error('AWS_REGION environment variable is required.');
    }
    if (!this.tableName) {
      console.error('CRITICAL: CLAIMS_TABLE environment variable is not set.');
      throw new Error('CLAIMS_TABLE environment variable is required.');
    }
    console.log(`[ClaimService Constructor] Claims DynamoDB Table: ${this.tableName}`);
  }

  // This method will be expanded when AI processing is integrated
  async createClaimInternal(userId, documentId, s3Key, extractedData) {
    const timestamp = new Date().toISOString();
    const claimId = uuidv4();

    let claimStatus = 'NOT_PROCESSED';
    if (extractedData && Object.keys(extractedData).length > 0) {
      claimStatus = 'PROCESSED';
    }

    const claim = {
      id: claimId,
      userId,
      documentId, // s3Key is the documentId here
      s3Key,      // Redundant if documentId is s3Key, but explicit
      status: claimStatus, // Updated status logic
      extractedData: extractedData || {},
      patientName: extractedData?.patientInfo?.name || extractedData?.patient_details?.name,
      providerName: extractedData?.providerInfo?.name || extractedData?.hospital_details?.name,
      serviceDate: extractedData?.claimDetails?.serviceDate || extractedData?.claim_details?.claim_date,
      amount: extractedData?.claimDetails?.totalAmount || extractedData?.claim_details?.total_amount,
      claimType: extractedData?.claimDetails?.claimType || extractedData?.claim_details?.claim_type,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    try {
      await this.docClient.send(new PutCommand({
        TableName: this.tableName,
        Item: claim,
      }));
      console.log(`[createClaimInternal] Claim created successfully: ${claimId}`);
      return claim;
    } catch (error) {
      console.error('[createClaimInternal] Error creating claim:', error);
      throw new Error('Failed to create claim internally.');
    }
  }

  async getClaimById(claimId, userId) {
    console.log(`[getClaimById] Service called with claimId: ${claimId}, userId: ${userId}`);
    const params = {
      TableName: this.tableName,
      Key: { id: claimId },
    };
    try {
      const { Item } = await this.docClient.send(new GetCommand(params));
      if (!Item) {
        const error = new Error('Claim not found.');
        error.statusCode = 404;
        throw error;
      }
      if (Item.userId !== userId) {
        console.warn(`[getClaimById] Unauthorized access attempt for claim ${claimId} by user ${userId}`);
        const error = new Error('Access denied to this claim.');
        error.statusCode = 403;
        throw error;
      }
      return Item;
    } catch (error) {
      console.error('[getClaimById] Error:', error);
      if (error.statusCode) throw error;
      throw new Error('Failed to get claim.');
    }
  }

  async getClaims(userId, queryParams = {}) {
    const { status, page = 1, limit = 10, sortBy = 'createdAt', sortDirection = 'desc' } = queryParams;

    const params = {
      TableName: this.tableName,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      // ScanIndexForward: sortDirection === 'asc', // Only works if GSI has a sort key matching sortBy
      // Limit for pagination will be applied post-filtering if filtering is done in code
    };

    // If GSI had status as a sort key: ExpressionAttributeValues: { ':userId': userId, ':status': status }, KeyConditionExpression: 'userId = :userId and status = :status',
    // Since UserIdIndex only has userId, we filter in code for now.

    try {
      let allUserClaims = [];
      let lastEvaluatedKey;
      do {
        if (lastEvaluatedKey) {
          params.ExclusiveStartKey = lastEvaluatedKey;
        }
        const data = await this.docClient.send(new QueryCommand(params));
        allUserClaims = allUserClaims.concat(data.Items || []);
        lastEvaluatedKey = data.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      // Filter by status (if provided)
      let filteredClaims = allUserClaims;
      if (status) {
        filteredClaims = filteredClaims.filter(claim => claim.status === status);
      }

      // Sort (application-level sorting)
      filteredClaims.sort((a, b) => {
        let valA = a[sortBy];
        let valB = b[sortBy];

        // Handle nested properties for sorting, e.g., from extractedData if sortBy refers to them
        if (sortBy.includes('.')) {
            valA = sortBy.split('.').reduce((o, i) => o ? o[i] : undefined, a);
            valB = sortBy.split('.').reduce((o, i) => o ? o[i] : undefined, b);
        }

        if (typeof valA === 'string' && typeof valB === 'string') {
            valA = valA.toLowerCase();
            valB = valB.toLowerCase();
        }

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });

      // Paginate
      const totalItems = filteredClaims.length;
      const totalPages = Math.ceil(totalItems / limit);
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;
      const paginatedClaims = filteredClaims.slice(startIndex, endIndex);

      return {
        claims: paginatedClaims,
        pagination: {
          totalItems,
          totalPages,
          currentPage: parseInt(page, 10),
          limit: parseInt(limit, 10),
        },
      };
    } catch (error) {
      console.error('[getClaims] Error:', error);
      throw new Error('Failed to get claims.');
    }
  }

  async getClaimByS3Key(s3Key, userId) {
    console.log(`[getClaimByS3Key] Attempting to find claim for s3Key: ${s3Key} and userId: ${userId}`);
    const params = {
      TableName: this.tableName,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
    };

    try {
      let userClaims = [];
      let lastEvaluatedKey;
      do {
        if (lastEvaluatedKey) {
          params.ExclusiveStartKey = lastEvaluatedKey;
        }
        const data = await this.docClient.send(new QueryCommand(params));
        if (data.Items && data.Items.length > 0) {
            console.log(`[getClaimByS3Key] Fetched ${data.Items.length} claims for userId ${userId}. First item (sample):`, JSON.stringify(data.Items[0]));
            data.Items.forEach(claim => {
                console.log(`[getClaimByS3Key] Checking claimId: ${claim.id}, s3Key: ${claim.s3Key}, documentId: ${claim.documentId}`);
            });
        }
        userClaims = userClaims.concat(data.Items || []);
        lastEvaluatedKey = data.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      console.log(`[getClaimByS3Key] Total claims fetched for user ${userId}: ${userClaims.length}. Now filtering for s3Key: ${s3Key}`);
      const foundClaim = userClaims.find(claim => claim.s3Key === s3Key || claim.documentId === s3Key);

      if (!foundClaim) {
        const error = new Error('Claim associated with this document not found for the user.');
        error.statusCode = 404;
        throw error;
      }
      // No explicit userId check here as the initial query was already scoped to userId
      return foundClaim;
    } catch (error) {
      console.error('[getClaimByS3Key] Error:', error);
      if (error.statusCode) throw error;
      throw new Error('Failed to retrieve claim by S3 key.');
    }
  }
}

module.exports = new ClaimService();