const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./src/routes/auth.routes');
const documentRoutes = require('./src/routes/document.routes');
const claimRoutes = require('./src/routes/claim.routes');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: 'https://aarogyaui.jaypatel.software',
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Specify allowed methods
  allowedHeaders: ['Content-Type', 'Authorization'] // Specify allowed headers
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Auth Routes
app.use('/auth', authRoutes);

// Document Routes
app.use('/documents', documentRoutes);

// Claim Routes
app.use('/claims', claimRoutes);

// Basic Route
app.get('/', (req, res) => {
  res.send('Medical Claim Processing Server is running!');
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

module.exports = app;