const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { OpenAI } = require('openai');
const resumePrompt = require('./resumePrompt');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs'); // For password hashing
const jwt = require('jsonwebtoken'); // For JWT tokens

const app = express();
const port = 3000;

// Simple in-memory cache for resume generation
const resumeCache = new Map();
const MAX_CACHE_SIZE = 20; // Maximum number of cache entries

// JWT Secret Key
const JWT_SECRET = process.env.JWT_SECRET || 'resume-maker-secret-key-change-in-production';

// Users database file path
const USERS_DB_PATH = path.join(__dirname, 'users.json');
// Analytics database file path
const ANALYTICS_DB_PATH = path.join(__dirname, 'analytics.json');
// Questions database file path
const QUESTIONS_DB_PATH = path.join(__dirname, 'questions.json');

// Middleware
app.use(cors());
app.use(express.json());

// User database functions
const initUsers = () => {
  if (!fs.existsSync(USERS_DB_PATH)) {
    const defaultUsers = [
      {
        id: '1',
        fullName: 'Test User',
        email: 'test@example.com',
        password: bcrypt.hashSync('password123', 10), // Hashed password
        createdAt: new Date().toISOString(),
      }
    ];
    fs.writeFileSync(USERS_DB_PATH, JSON.stringify(defaultUsers, null, 2));
    return defaultUsers;
  }
  return JSON.parse(fs.readFileSync(USERS_DB_PATH, 'utf8'));
};

const getUsers = () => {
  try {
    if (!fs.existsSync(USERS_DB_PATH)) {
      return initUsers();
    }
    return JSON.parse(fs.readFileSync(USERS_DB_PATH, 'utf8'));
  } catch (error) {
    console.error('Error reading users file:', error);
    return [];
  }
};

const saveUsers = (users) => {
  try {
    fs.writeFileSync(USERS_DB_PATH, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error('Error saving users file:', error);
  }
};

// Analytics database functions
const initAnalytics = () => {
  if (!fs.existsSync(ANALYTICS_DB_PATH)) {
    const defaultAnalytics = {
      events: [],
      pageViews: [],
      userSessions: [],
      interactions: []
    };
    fs.writeFileSync(ANALYTICS_DB_PATH, JSON.stringify(defaultAnalytics, null, 2));
    return defaultAnalytics;
  }
  return JSON.parse(fs.readFileSync(ANALYTICS_DB_PATH, 'utf8'));
};

const getAnalytics = () => {
  try {
    if (!fs.existsSync(ANALYTICS_DB_PATH)) {
      return initAnalytics();
    }
    return JSON.parse(fs.readFileSync(ANALYTICS_DB_PATH, 'utf8'));
  } catch (error) {
    console.error('Error reading analytics file:', error);
    return { events: [], pageViews: [], userSessions: [], interactions: [] };
  }
};

const saveAnalytics = (analytics) => {
  try {
    fs.writeFileSync(ANALYTICS_DB_PATH, JSON.stringify(analytics, null, 2));
  } catch (error) {
    console.error('Error saving analytics file:', error);
  }
};

// Questions database functions
const initQuestions = () => {
  if (!fs.existsSync(QUESTIONS_DB_PATH)) {
    const defaultQuestions = [];
    fs.writeFileSync(QUESTIONS_DB_PATH, JSON.stringify(defaultQuestions, null, 2));
    return defaultQuestions;
  }
  return JSON.parse(fs.readFileSync(QUESTIONS_DB_PATH, 'utf8'));
};

const getQuestions = () => {
  try {
    if (!fs.existsSync(QUESTIONS_DB_PATH)) {
      return initQuestions();
    }
    return JSON.parse(fs.readFileSync(QUESTIONS_DB_PATH, 'utf8'));
  } catch (error) {
    console.error('Error reading questions file:', error);
    return [];
  }
};

const saveQuestions = (questions) => {
  try {
    fs.writeFileSync(QUESTIONS_DB_PATH, JSON.stringify(questions, null, 2));
  } catch (error) {
    console.error('Error saving questions file:', error);
  }
};

// Authentication middleware
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(' ')[1];

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
      }

      req.user = user;
      next();
    });
  } else {
    res.status(401).json({ error: 'Authorization token required' });
  }
};

// Admin middleware - check if user is admin
const isAdmin = (req, res, next) => {
  // For demo purposes, all authenticated users are considered admins
  // In a real app, you would check a user role or admin flag
  if (req.user) {
    next();
  } else {
    res.status(403).json({ error: 'Admin access required' });
  }
};

// Option 1: OpenAI client (uncomment and add API key to use)
/*
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here', // Prefer using environment variables
});
*/

// Parse AI response to extract JSON data
function parseMultipleResponses(response) {
  const jsonResponse = {};

  // Extract content inside <think> tags
  const thinkMatch = response.match(/<think>([\s\S]*?)<\/think>/);
  jsonResponse.think = thinkMatch ? thinkMatch[1].trim() : null;

  // Extract content that is in JSON format
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      jsonResponse.data = JSON.parse(jsonMatch[1].trim());
    } catch (e) {
      console.error('Invalid JSON format in the response:', e.message);
      jsonResponse.data = null;
    }
  } else {
    jsonResponse.data = null;
  }

  return jsonResponse;
}

// Replace template placeholders
function putValuesToTemplate(template, values) {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(`{{${key}}}`, value);
  }
  return result;
}

// Auth API Routes
app.post('/api/v1/auth/signup', async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    // Validate input
    if (!fullName || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if email is valid
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check if password is strong enough
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Check if user already exists
    const users = getUsers();
    if (users.some(user => user.email === email)) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = {
      id: Date.now().toString(),
      fullName,
      email,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
    };

    // Save user
    users.push(newUser);
    saveUsers(users);

    // Generate JWT token
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, fullName: newUser.fullName },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Return user info (without password) and token
    res.status(201).json({
      user: {
        id: newUser.id,
        fullName: newUser.fullName,
        email: newUser.email,
        createdAt: newUser.createdAt,
      },
      token,
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create account', details: error.message });
  }
});

app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const users = getUsers();
    const user = users.find(user => user.email === email);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Compare password
    const passwordIsValid = await bcrypt.compare(password, user.password);

    if (!passwordIsValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, fullName: user.fullName },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Return user info (without password) and token
    res.json({
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        createdAt: user.createdAt,
      },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to log in', details: error.message });
  }
});

app.get('/api/v1/auth/me', authenticateJWT, (req, res) => {
  // Return current user info from token
  res.json({
    user: {
      id: req.user.id,
      fullName: req.user.fullName,
      email: req.user.email,
    },
  });
});

// Analytics API Routes
app.post('/api/v1/analytics/track', (req, res) => {
  try {
    const { event, sessionId, data, timestamp } = req.body;
    
    if (!event) {
      return res.status(400).json({ error: 'Event name is required' });
    }
    
    const analytics = getAnalytics();
    
    // Store event based on type
    if (event === 'page_view') {
      analytics.pageViews.push({
        sessionId,
        page: data.page,
        referrer: data.referrer,
        timestamp,
        ...data
      });
    } else if (event === 'user_interaction') {
      analytics.interactions.push({
        sessionId,
        element: data.element,
        action: data.action,
        timestamp,
        ...data
      });
    } else if (event === 'session_end') {
      // Find the session and update it with duration
      const existingSessionIndex = analytics.userSessions.findIndex(
        session => session.sessionId === sessionId
      );
      
      if (existingSessionIndex >= 0) {
        analytics.userSessions[existingSessionIndex].duration = data.duration;
        analytics.userSessions[existingSessionIndex].endTime = timestamp;
      }
    } else {
      // Generic event
      analytics.events.push({
        eventName: event,
        sessionId,
        timestamp,
        data
      });
      
      // If it's a new session, record it
      if (event === 'session_start' || !analytics.userSessions.some(s => s.sessionId === sessionId)) {
        analytics.userSessions.push({
          sessionId,
          startTime: timestamp,
          endTime: null,
          duration: null
        });
      }
    }
    
    saveAnalytics(analytics);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error tracking analytics:', error);
    res.status(500).json({ error: 'Failed to track event', details: error.message });
  }
});

// Get analytics data (admin only)
app.get('/api/v1/analytics/data', authenticateJWT, isAdmin, (req, res) => {
  try {
    const { metric, filters, timeRange } = req.query;
    const analytics = getAnalytics();
    
    let result = {};
    
    // Parse filters and timeRange if provided
    const parsedFilters = filters ? JSON.parse(filters) : {};
    const parsedTimeRange = timeRange ? JSON.parse(timeRange) : {};
    
    // Filter data based on time range
    const filterByTimeRange = (items) => {
      if (!parsedTimeRange.start && !parsedTimeRange.end) return items;
      
      return items.filter(item => {
        const itemTime = new Date(item.timestamp).getTime();
        const startTime = parsedTimeRange.start ? new Date(parsedTimeRange.start).getTime() : 0;
        const endTime = parsedTimeRange.end ? new Date(parsedTimeRange.end).getTime() : Infinity;
        
        return itemTime >= startTime && itemTime <= endTime;
      });
    };
    
    // Handle different metric types
    switch (metric) {
      case 'visits':
        result = {
          total: filterByTimeRange(analytics.pageViews).length,
          data: filterByTimeRange(analytics.pageViews)
        };
        break;
      
      case 'unique_users':
        // Count unique session IDs
        const filteredViews = filterByTimeRange(analytics.pageViews);
        const uniqueSessions = [...new Set(filteredViews.map(view => view.sessionId))];
        result = {
          total: uniqueSessions.length,
          data: uniqueSessions
        };
        break;
      
      case 'session_duration':
        // Calculate average session duration
        const filteredSessions = filterByTimeRange(analytics.userSessions)
          .filter(session => session.duration !== null);
        
        const totalDuration = filteredSessions.reduce(
          (sum, session) => sum + (session.duration || 0), 0
        );
        
        result = {
          average: filteredSessions.length ? totalDuration / filteredSessions.length : 0,
          data: filteredSessions
        };
        break;
      
      case 'events':
        // Return all events or filter by specific event name
        let filteredEvents = filterByTimeRange(analytics.events);
        if (parsedFilters.eventName) {
          filteredEvents = filteredEvents.filter(
            event => event.eventName === parsedFilters.eventName
          );
        }
        
        result = {
          total: filteredEvents.length,
          data: filteredEvents
        };
        break;
      
      case 'page_popularity':
        // Count visits per page
        const pageVisits = {};
        filterByTimeRange(analytics.pageViews).forEach(view => {
          pageVisits[view.page] = (pageVisits[view.page] || 0) + 1;
        });
        
        result = {
          data: Object.entries(pageVisits).map(([page, count]) => ({ page, count }))
            .sort((a, b) => b.count - a.count)
        };
        break;
      
      case 'referrers':
        // Count visits per referrer
        const referrerVisits = {};
        filterByTimeRange(analytics.pageViews)
          .filter(view => view.referrer)
          .forEach(view => {
            referrerVisits[view.referrer] = (referrerVisits[view.referrer] || 0) + 1;
          });
        
        result = {
          data: Object.entries(referrerVisits).map(([referrer, count]) => ({ referrer, count }))
            .sort((a, b) => b.count - a.count)
        };
        break;
      
      default:
        // Return all analytics data
        result = {
          pageViews: filterByTimeRange(analytics.pageViews),
          events: filterByTimeRange(analytics.events),
          userSessions: filterByTimeRange(analytics.userSessions),
          interactions: filterByTimeRange(analytics.interactions)
        };
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching analytics data:', error);
    res.status(500).json({ error: 'Failed to fetch analytics data', details: error.message });
  }
});

// Questions/Feedback API Routes
app.post('/api/v1/questions/submit', (req, res) => {
  try {
    const { question, email } = req.body;
    
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    const questions = getQuestions();
    
    // Add new question
    const newQuestion = {
      id: Date.now().toString(),
      question,
      email: email || null,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      answer: null,
      answeredAt: null
    };
    
    questions.push(newQuestion);
    saveQuestions(questions);
    
    res.status(201).json({ success: true, questionId: newQuestion.id });
  } catch (error) {
    console.error('Error submitting question:', error);
    res.status(500).json({ error: 'Failed to submit question', details: error.message });
  }
});

// Get all questions (admin only)
app.get('/api/v1/questions', authenticateJWT, isAdmin, (req, res) => {
  try {
    const questions = getQuestions();
    res.json({ questions });
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ error: 'Failed to fetch questions', details: error.message });
  }
});

// Answer a question (admin only)
app.post('/api/v1/questions/:id/answer', authenticateJWT, isAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { answer } = req.body;
    
    if (!answer) {
      return res.status(400).json({ error: 'Answer is required' });
    }
    
    const questions = getQuestions();
    const questionIndex = questions.findIndex(q => q.id === id);
    
    if (questionIndex === -1) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    // Update question with answer
    questions[questionIndex].answer = answer;
    questions[questionIndex].status = 'answered';
    questions[questionIndex].answeredAt = new Date().toISOString();
    questions[questionIndex].updatedAt = new Date().toISOString();
    
    saveQuestions(questions);
    
    res.json({ success: true, question: questions[questionIndex] });
  } catch (error) {
    console.error('Error answering question:', error);
    res.status(500).json({ error: 'Failed to answer question', details: error.message });
  }
});

// Resume generation API
app.post('/api/v1/resume/generate', async (req, res) => {
  try {
    const { userDescription } = req.body;
    
    if (!userDescription) {
      return res.status(400).json({ error: 'User description is required' });
    }
    
    console.log("Generating resume for description:", userDescription);
    
    // Check if the resume is already cached
    const cachedResume = resumeCache.get(userDescription);
    if (cachedResume) {
      console.log("Resume found in cache");
      return res.json(cachedResume);
    }

    // Get the prompt template
    const promptTemplate = resumePrompt;
    
    // Replace placeholders with values
    const promptContent = putValuesToTemplate(promptTemplate, {
      userDescription: userDescription
    });

    // OPTION 1: Use OpenAI (uncomment to use)
    /*
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: promptContent }],
    });
    
    const aiResponse = completion.choices[0].message.content;
    const parsedResponse = parseMultipleResponses(aiResponse);
    res.json(parsedResponse);
    */

    // OPTION 2: Use a mock response for testing
    // This allows the app to work without an actual AI API
    const mockResponse = {
      data: {
        personalInformation: {
          fullName: "John Doe",
          email: "john.doe@example.com",
          phoneNumber: "(123) 456-7890",
          location: "New York, NY",
          linkedIn: "linkedin.com/in/johndoe",
          gitHub: "github.com/johndoe",
          portfolio: "johndoe.dev"
        },
        summary: "Software developer with 5 years of experience in web development and a passion for creating efficient, user-friendly applications.",
        skills: [
          { title: "JavaScript", level: "Expert" },
          { title: "React", level: "Advanced" },
          { title: "Node.js", level: "Intermediate" }
        ],
        experience: [
          {
            jobTitle: "Senior Frontend Developer",
            company: "Tech Solutions Inc.",
            location: "New York, NY",
            duration: "Jan 2020 - Present",
            responsibility: "Leading the frontend development team and architecting modern web applications."
          }
        ],
        education: [
          {
            degree: "Bachelor of Science in Computer Science",
            university: "New York University",
            location: "New York, NY",
            graduationYear: "2018"
          }
        ],
        certifications: [
          {
            title: "AWS Certified Developer",
            issuingOrganization: "Amazon Web Services",
            year: "2021"
          }
        ],
        projects: [
          {
            title: "E-commerce Platform",
            description: "Built a scalable e-commerce platform with modern frontend technologies",
            technologiesUsed: ["React", "Node.js", "MongoDB"],
            githubLink: "github.com/johndoe/ecommerce"
          }
        ],
        achievements: [
          {
            title: "Employee of the Year",
            year: "2022",
            extraInformation: "Recognized for outstanding contributions to company projects"
          }
        ],
        languages: [
          {
            id: 1,
            name: "English"
          },
          {
            id: 2,
            name: "Spanish"
          }
        ],
        interests: [
          {
            id: 1,
            name: "Open Source Contributing"
          },
          {
            id: 2,
            name: "Machine Learning"
          }
        ]
      },
      think: "This is a software developer with strong skills in web development technologies."
    };
    
    // Add some variation based on the input description
    if (userDescription.toLowerCase().includes("data science") || 
        userDescription.toLowerCase().includes("machine learning")) {
      mockResponse.data.personalInformation.fullName = "Jane Smith";
      mockResponse.data.skills = [
        { title: "Python", level: "Expert" },
        { title: "Machine Learning", level: "Advanced" },
        { title: "Data Analysis", level: "Advanced" }
      ];
      mockResponse.data.summary = "Data scientist with expertise in machine learning algorithms and data analysis, passionate about extracting insights from complex datasets.";
      mockResponse.think = "This person has a background in data science or machine learning.";
    } else if (userDescription.toLowerCase().includes("backend") || 
              userDescription.toLowerCase().includes("java")) {
      mockResponse.data.personalInformation.fullName = "Michael Johnson";
      mockResponse.data.skills = [
        { title: "Java", level: "Expert" },
        { title: "Spring Boot", level: "Advanced" },
        { title: "SQL", level: "Intermediate" }
      ];
      mockResponse.data.summary = "Backend developer specializing in Java and Spring Boot with experience building scalable and secure server-side applications.";
      mockResponse.think = "This person specializes in backend development with Java technologies.";
    }
    
    console.log("Resume generated successfully");
    
    // Cache the generated resume
    if (resumeCache.size >= MAX_CACHE_SIZE) {
      const oldestKey = resumeCache.keys().next().value;
      resumeCache.delete(oldestKey);
    }
    resumeCache.set(userDescription, mockResponse);
    
    res.json(mockResponse);
    
  } catch (error) {
    console.error('Error generating resume:', error);
    res.status(500).json({ error: 'Failed to generate resume', details: error.message });
  }
});

// Get user's resumes
app.get('/api/v1/resumes', authenticateJWT, (req, res) => {
  // In a real app, you would fetch resumes from database
  // For now, return mock data
  res.json({
    resumes: [
      {
        id: '1',
        title: 'Software Developer Resume',
        createdAt: '2023-05-15T10:30:00Z',
        lastModified: '2023-05-16T14:20:00Z',
      },
      {
        id: '2',
        title: 'Frontend Developer Resume',
        createdAt: '2023-06-20T09:15:00Z',
        lastModified: '2023-06-20T09:15:00Z',
      }
    ]
  });
});

// Chatbot API
app.post('/api/v1/chatbot/message', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // In a real implementation, you would process the message with AI
    // For now, we'll use a simple keyword-based response system
    
    const responses = {
      'hello': 'Hello! How can I help with your resume today?',
      'resume': 'Our AI-powered resume builder helps you create professional resumes in minutes. Would you like to try it?',
      'template': 'We offer multiple professional templates optimized for different industries. Would you like recommendations for your field?',
      'help': 'I can help you create a resume, suggest improvements, or answer questions about our features. What would you like to know?',
      'thanks': 'You\'re welcome! Is there anything else I can help you with?',
      'thank you': 'You\'re welcome! Is there anything else I can help you with?',
      'bye': 'Goodbye! Feel free to come back if you have more questions.'
    };
    
    // Simple keyword matching
    let response = "I'm here to help with your resume needs. You can ask me about creating resumes, templates, or any features of our platform.";
    
    const lowercaseMessage = message.toLowerCase();
    for (const [keyword, reply] of Object.entries(responses)) {
      if (lowercaseMessage.includes(keyword)) {
        response = reply;
        break;
      }
    }
    
    // Track chatbot interaction in analytics
    const analytics = getAnalytics();
    analytics.events.push({
      eventName: 'chatbot_interaction',
      sessionId,
      timestamp: new Date().toISOString(),
      data: {
        userMessage: message,
        botResponse: response
      }
    });
    saveAnalytics(analytics);
    
    // Return response
    res.json({
      response,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error processing chatbot message:', error);
    res.status(500).json({ error: 'Failed to process message', details: error.message });
  }
});

// Serve static files from the frontend directory
app.use('/test', express.static(path.join(__dirname, 'resume_frontend/public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Initialize databases
initUsers();
initAnalytics();
initQuestions();

// Start the server
app.listen(port, () => {
  console.log(`Resume backend server running at http://localhost:${port}`);
  console.log(`API endpoints:`);
  console.log(`- Authentication: http://localhost:${port}/api/v1/auth/login`);
  console.log(`- Resume generation: http://localhost:${port}/api/v1/resume/generate`);
  console.log(`- Analytics tracking: http://localhost:${port}/api/v1/analytics/track`);
  console.log(`- Chatbot API: http://localhost:${port}/api/v1/chatbot/message`);
}); 