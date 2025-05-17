const authService = require('../services/auth.service');

class AuthController {
  async register(req, res) {
    try {
      const { email, password, firstName, lastName } = req.body;
      if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'Email, password, firstName, and lastName are required.'
          }
        });
      }

      const result = await authService.registerUser(email, password, firstName, lastName);
      return res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: result
      });
    } catch (error) {
      if (error.code === 'EMAIL_ALREADY_EXISTS') {
        return res.status(error.statusCode || 409).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: 'Please use a different email address or try to login'
          }
        });
      }
      console.error('Register Error:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred during registration.'
        }
      });
    }
  }

  async login(req, res) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'Email and password are required.'
          }
        });
      }
      const result = await authService.loginUser(email, password);
      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      if (error.code === 'INVALID_CREDENTIALS') {
        return res.status(error.statusCode || 401).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: null
          }
        });
      }
      console.error('Login Error:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred during login.'
        }
      });
    }
  }
}

module.exports = new AuthController();