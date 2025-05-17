const authService = require('../services/auth.service');

const authenticateJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'NO_TOKEN_PROVIDED',
          message: 'Authorization header is missing.'
        }
      });
    }

    const tokenParts = authHeader.split(' ');
    if (tokenParts.length !== 2 || tokenParts[0].toLowerCase() !== 'bearer') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN_FORMAT',
          message: 'Authorization header must be in the format \'Bearer <token>\'.'
        }
      });
    }

    const token = tokenParts[1];
    const user = await authService.verifyToken(token);

    if (!user) {
      // This case should ideally be handled by verifyToken throwing an error
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid token.'
        }
      });
    }

    // Attach user information to the request object
    req.user = {
      id: user.id,
      email: user.email
    };

    next(); // Proceed to the next middleware or route handler
  } catch (error) {
    if (error.code === 'INVALID_TOKEN' || error.statusCode === 401) {
      return res.status(401).json({
        success: false,
        error: {
          code: error.code || 'UNAUTHORIZED',
          message: error.message || 'Authentication failed.'
        }
      });
    }
    // For other unexpected errors
    console.error('[authenticateJWT] Middleware error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred during authentication.'
      }
    });
  }
};

module.exports = authenticateJWT;