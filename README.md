# Resume Express Backend

This is a simplified Node.js Express backend for the Resume Generator application. It provides the same API interface as the original Spring Boot backend but is much easier to run.

## Features

- Express server that exposes the same API endpoints as the original backend
- Mock resume generation capability (no AI API key required)
- Option to integrate with OpenAI API (requires API key)
- Cross-origin resource sharing (CORS) enabled

## Prerequisites

- Node.js (v14 or later)
- npm (comes with Node.js)

## Installation

1. Clone the repository or navigate to the project directory
2. Install dependencies:

```bash
npm install
```

## Running the Application

Start the server:

```bash
node server.js
```

The server will start on port 8080, and you should see a message like:

```
Resume backend server running at http://localhost:8080
Try the API at http://localhost:8080/api/v1/resume/generate
```

## API Endpoints

### Generate Resume

- **URL**: `/api/v1/resume/generate`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "userDescription": "Your resume details here..."
  }
  ```
- **Response**: A JSON object containing the generated resume data

### Health Check

- **URL**: `/health`
- **Method**: `GET`
- **Response**: `{ "status": "ok" }`

## Using with OpenAI API

To use with the OpenAI API instead of mock data:

1. Uncomment the OpenAI client initialization in `server.js`
2. Get an API key from OpenAI
3. Set the API key in your environment or directly in the code (not recommended for production)
4. Uncomment the OpenAI API call in the `/api/v1/resume/generate` endpoint
5. Comment out the mock response

## Using with the Frontend

Make sure the frontend is configured to connect to `http://localhost:8080/api/v1/resume/generate` for the resume generation feature. 