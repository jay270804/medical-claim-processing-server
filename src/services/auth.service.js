const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

class AuthService {
  constructor() {
    // Always configure for AWS environment
    const clientConfig = {
      region: process.env.AWS_REGION,
    };

    console.log('[AuthService Constructor] Configuring for AWS Production Environment.');
    console.log('[AuthService Constructor] AWS_REGION:', process.env.AWS_REGION);
    console.log('[AuthService Constructor] DynamoDB Client Config:', JSON.stringify(clientConfig));

    const client = new DynamoDBClient(clientConfig);
    this.docClient = DynamoDBDocumentClient.from(client);
    this.tableName = process.env.USERS_TABLE;
    this.jwtSecret = process.env.JWT_SECRET;

    console.log('[AuthService Constructor] USERS_TABLE:', this.tableName);
    console.log('[AuthService Constructor] JWT_SECRET set:', !!this.jwtSecret);

    if (!process.env.AWS_REGION) {
      console.error('CRITICAL: AWS_REGION environment variable is not set.');
      throw new Error('AWS_REGION environment variable is required for production setup.');
    }
    if (!this.tableName) {
      console.error('CRITICAL: USERS_TABLE environment variable is not set at instance creation.');
      throw new Error('USERS_TABLE environment variable is required.');
    }
    if (!this.jwtSecret) {
      console.error('CRITICAL: JWT_SECRET environment variable is not set at instance creation.');
      throw new Error('JWT_SECRET environment variable is required.');
    }
  }

  async getUserByEmail(email) {
    console.log(`[getUserByEmail] Attempting to get user by email: ${email}`);
    console.log(`[getUserByEmail] Using TableName: ${this.tableName}`);
    const params = {
      TableName: this.tableName,
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email,
      },
    };
    console.log('[getUserByEmail] Query params:', JSON.stringify(params));

    try {
      const data = await this.docClient.send(new QueryCommand(params));
      console.log('[getUserByEmail] Query successful, data received:', data.Items ? data.Items.length : 0, 'items');
      return data.Items && data.Items.length > 0 ? data.Items[0] : null;
    } catch (error) {
      console.error('[getUserByEmail] Error getting user by email from DynamoDB:', error.name, error.message);
      console.error('[getUserByEmail] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      throw new Error('Could not retrieve user data.');
    }
  }

  async registerUser(email, password, firstName, lastName) {
    console.log(`[registerUser] Attempting to register user: ${email}`);
    const existingUser = await this.getUserByEmail(email);
    if (existingUser) {
      console.warn(`[registerUser] User email ${email} already exists.`);
      const error = new Error('A user with this email already exists');
      error.statusCode = 409;
      error.code = 'EMAIL_ALREADY_EXISTS';
      throw error;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();
    const userId = uuidv4();

    const newUser = {
      id: userId,
      email,
      password: hashedPassword,
      firstName,
      lastName,
      createdAt: now,
      updatedAt: now,
    };

    const putParams = {
      TableName: this.tableName,
      Item: newUser,
    };
    console.log(`[registerUser] Attempting to save new user. TableName: ${this.tableName}`);
    console.log('[registerUser] Put params:', JSON.stringify(putParams));

    try {
      await this.docClient.send(new PutCommand(putParams));
      console.log(`[registerUser] User ${email} registered successfully with id ${userId}`);
      return {
        userId: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        createdAt: newUser.createdAt,
      };
    } catch (error) {
      console.error('[registerUser] Error saving user to DynamoDB:', error.name, error.message);
      console.error('[registerUser] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      throw new Error('Could not register user.');
    }
  }

  async loginUser(email, password) {
    console.log(`[loginUser] Attempting to login user: ${email}`);
    const user = await this.getUserByEmail(email);
    if (!user) {
      console.warn(`[loginUser] User email ${email} not found for login.`);
      const error = new Error('Invalid email or password');
      error.statusCode = 401;
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.warn(`[loginUser] Password mismatch for user: ${email}`);
      const error = new Error('Invalid email or password');
      error.statusCode = 401;
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      this.jwtSecret,
      { expiresIn: '24h' }
    );
    console.log(`[loginUser] User ${email} logged in successfully.`);
    return {
      token,
      user: {
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }

  // New method to verify JWT
  async verifyToken(token) {
    try {
      // The jwt.verify function is synchronous by default if no callback is provided,
      // but can work with async/await if the secret/key is fetched asynchronously (not our case here).
      // For simplicity and consistency with other async methods, we'll wrap it.
      const decoded = jwt.verify(token, this.jwtSecret);
      // decoded will contain { userId: user.id, email: user.email, iat: ..., exp: ... }
      return { id: decoded.userId, email: decoded.email }; // Match structure from serverless authorizer
    } catch (error) {
      console.error('[verifyToken] Invalid token:', error.message);
      // Throw an error that can be caught by the middleware
      const authError = new Error('Invalid or expired token');
      authError.statusCode = 401;
      authError.code = 'INVALID_TOKEN';
      throw authError;
    }
  }
}

module.exports = new AuthService();