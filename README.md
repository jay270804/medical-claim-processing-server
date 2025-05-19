# Medical Claim Processing Server

## Description

This is the backend server for the Medical Claim Processing application. It handles user authentication, document uploads to AWS S3, medical data extraction using the Google Gemini API, claim creation and management in AWS DynamoDB, and provides APIs for the frontend application.

## Features

- User Authentication (Registration, Login)
- Document Upload and Storage (AWS S3)
- AI-Powered Medical Data Extraction (Google Gemini)
- Claim Creation and Management (AWS DynamoDB)
- API Endpoints for Frontend Communication

## Technologies Used

- Node.js
- Express.js
- AWS SDK (S3, DynamoDB)
- Google Generative AI SDK (Gemini)
- bcryptjs (for password hashing)
- jsonwebtoken (for authentication tokens)
- multer (for file uploads)
- cors (for handling Cross-Origin Resource Sharing)
- dotenv (for environment variable management)
- uuid (for generating unique IDs)

## Setup and Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd medical-claim-processing-server
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Set up Environment Variables:** Create a `.env` file in the root directory of the project and add the required environment variables (see below).
4.  **Run the server locally:**
    ```bash
    npm start
    # or
    node app.js
    ```
    The server will run on the port specified in your `.env` file or default to 3000.

## Environment Variables

Create a `.env` file in the project root with the following variables:

-   `PORT`: The port the server should listen on (e.g., `3000`).
-   `AWS_REGION`: The AWS region for your services (e.g., `us-east-1`).
-   `USERS_TABLE`: Name of the DynamoDB table for users.
-   `CLAIMS_TABLE`: Name of the DynamoDB table for claims.
-   `S3_BUCKET_NAME`: Name of the S3 bucket for documents.
-   `JWT_SECRET`: A strong, random secret for signing JWT tokens.
-   `GEMINI_API_KEY`: Your API key for the Google Gemini service.

## API Endpoints

-   `POST /auth/register`: Register a new user.
-   `POST /auth/login`: Login a user and get a JWT token.
-   `POST /documents`: Upload a document and trigger claim processing.
-   `GET /documents/:documentId/status`: Get the processing status of a document.
-   `GET /documents/:documentId/presigned-url`: Get a presigned URL to download a document.
-   `GET /claims`: Get a list of claims for the authenticated user.
-   `GET /claims/:claimId`: Get details for a specific claim.

## Deployment on EC2 with Nginx

The server is deployed on an AWS EC2 Ubuntu instance. Nginx is used as a reverse proxy to handle incoming requests and forward them to the Node.js application running on a specific port (e.g., 3000). Nginx also handles SSL termination (HTTPS).

-   **Server Address:** `https://aarogyaserver.jaypatel.software`

The setup typically involves:
1.  Installing Node.js, npm, and Git on the EC2 instance.
2.  Cloning the repository.
3.  Installing Node.js dependencies (`npm install`).
4.  Setting environment variables (e.g., via PM2 or a `.env` file).
5.  Using a process manager like PM2 to keep the Node.js app running.
6.  Installing and configuring Nginx to proxy requests from port 443 (HTTPS) to the Node.js app's port.
7.  Setting up SSL certificates (e.g., with Certbot/Let's Encrypt).

## Contributing

(Add instructions for contributing if applicable)

## License

This project is licensed under the ISC License. (Modify if you are using a different license)