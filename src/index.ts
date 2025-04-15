// Load environment variables first, before any other imports
import dotenv from 'dotenv';
import path from 'path';
dotenv.config();

import express, { Router, NextFunction, RequestHandler } from 'express';
import cors from 'cors';
import { getItemFromCollection, createItems, deleteItemsByUser } from './db/operations';
import { MonopolyChatBot } from './services/openai';
import { Event } from './models/event';
import { Question } from './models/question';
import { COLLECTIONS } from './config/collections';
import { requestLogger } from './middleware/logging';
import { createDatabaseClient, DatabaseType } from './db/database';

const app = express();
const router = Router();
const PORT = process.env.PORT || 3000;

// Database configuration
const dbType = (process.env.DB_TYPE || 'mongodb') as DatabaseType;
const dbConfig = {
    type: dbType,
    mongoUri: process.env.MONGODB_URI,
    sqliteFile: dbType === 'sqlite' ? path.resolve(process.env.SQLITE_FILE || './data.db') : undefined
};

if (dbType === 'mongodb' && !dbConfig.mongoUri) {
    console.error('Missing required MONGODB_URI environment variable');
    process.exit(1);
}

if (dbType === 'sqlite' && !dbConfig.sqliteFile) {
    console.error('Missing required SQLITE_FILE environment variable');
    process.exit(1);
}

const dbClient = createDatabaseClient(dbConfig);

// Enable CORS and JSON body parsing
app.use(cors());
app.use(express.json());

// Add logging middleware
app.use(requestLogger);

// Initialize services
async function initializeServices() {
    try {
        // Initialize database
        await dbClient.connect();
        console.log(`Connected to ${dbType}`);
        // await initializeCollections(dbClient, COLLECTIONS);

        // Initialize MonopolyChatBot
        try {
            const chatBot = MonopolyChatBot.getInstance();
            chatBot.initialize({
                apiKey: process.env.OPENAI_API_KEY || '',
                baseURL: process.env.OPENAI_BASE_URL || '',
                model: process.env.OPENAI_MODEL || ''
            });
            console.log('MonopolyChatBot initialized');
        } catch (error) {
            console.warn('MonopolyChatBot initialization failed:', error instanceof Error ? error.message : error);
            console.warn('Game event creation with AI will be unavailable');
        }
    } catch (error) {
        if (error instanceof Error) {
            console.error(`Failed to initialize services:`, error.message);
        } else {
            console.error(`Failed to initialize services:`, error);
        }
        process.exit(1);
    }
}

// Define request types
interface UserIdRequest {
    userId: string;
}

interface CreateEventRequest extends UserIdRequest {
    message: string;
}

// Health check endpoint
const healthCheck: RequestHandler = async (_req, res, next: NextFunction): Promise<void> => {
    try {
        if (!dbClient.isConnected()) {
            throw new Error('Database not connected');
        }
        res.json({ status: 'ok', message: 'Server is healthy' });
    } catch (error) {
        if (error instanceof Error) {
            res.status(500).json({ status: 'error', message: error.message });
        } else {
            res.status(500).json({ status: 'error', message: 'An unknown error occurred' });
        }
    }
    next();
};

// Get event endpoint
const getEvent: RequestHandler<{}, any, {}, UserIdRequest> = async (req, res, next: NextFunction): Promise<void> => {
    try {
        const { userId } = req.query;
        if (!userId) {
            res.status(400).json({ error: 'userId is required' });
            return next();
        }

        const result = await getItemFromCollection<Event>(
            dbClient,
            COLLECTIONS.events.name,
            userId,
            COLLECTIONS.events.sampleData as Event[]
        );

        res.json(result);
    } catch (error) {
        if (error instanceof Error) {
            res.status(500).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'An unknown error occurred' });
        }
    }
    next();
};

// Get question endpoint
const getQuestion: RequestHandler<{}, any, {}, UserIdRequest> = async (req, res, next: NextFunction): Promise<void> => {
    try {
        const { userId } = req.query;
        if (!userId) {
            res.status(400).json({ error: 'userId is required' });
            return next();
        }

        const result = await getItemFromCollection<Question>(
            dbClient,
            COLLECTIONS.questions.name,
            userId,
            COLLECTIONS.questions.sampleData as Question[]
        );

        res.json(result);
    } catch (error) {
        if (error instanceof Error) {
            res.status(500).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'An unknown error occurred' });
        }
    }
    next();
};

// Create events endpoint
const createEvents: RequestHandler<{}, any, CreateEventRequest> = async (req, res, next: NextFunction): Promise<void> => {
    try {
        const { userId, message } = req.body;
        if (!userId || !message) {
            res.status(400).json({ error: 'userId and message are required' });
            return next();
        }

        try {
            const chatBot = MonopolyChatBot.getInstance();
            const response = await chatBot.createGameEvent(message);

            if (!response.success) {
                res.status(400).json({ error: 'Failed to generate game events' });
                return next();
            }

            const result = await createItems<Event>(
                dbClient,
                COLLECTIONS.events.name,
                userId,
                response.data.map(event => ({
                    data: {
                        message: event.message,
                        type: event.type as Event['data']['type'],
                        ...(event.amount !== undefined && { amount: event.amount }),
                        ...(event.property !== undefined && { property: event.property }),
                        ...(event.baseAmount !== undefined && { baseAmount: event.baseAmount })
                    }
                }))
            );

            res.json(result);
        } catch (error) {
            if (error instanceof Error && error.message.includes('MonopolyChatBot not initialized')) {
                res.status(503).json({ 
                    error: 'MonopolyChatBot service is not available',
                    details: 'Game event creation with AI is currently unavailable'
                });
            } else {
                throw error;
            }
        }
    } catch (error) {
        if (error instanceof Error) {
            res.status(500).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'An unknown error occurred' });
        }
    }
    next();
};

// Update events endpoint - deletes existing events and creates new ones
const updateEvents: RequestHandler<{}, any, CreateEventRequest> = async (req, res, next: NextFunction): Promise<void> => {
    try {
        const { userId, message } = req.body;
        if (!userId || !message) {
            res.status(400).json({ error: 'userId and message are required' });
            return next();
        }

        try {
            // First, delete all existing events created by this user
            const deleteResult = await deleteItemsByUser<Event>(
                dbClient,
                COLLECTIONS.events.name,
                userId
            );

            // Then create new events
            const chatBot = MonopolyChatBot.getInstance();
            const response = await chatBot.createGameEvent(message);

            if (!response.success) {
                res.status(400).json({ error: 'Failed to generate game events' });
                return next();
            }

            const result = await createItems<Event>(
                dbClient,
                COLLECTIONS.events.name,
                userId,
                response.data.map(event => ({
                    data: {
                        message: event.message,
                        type: event.type as Event['data']['type'],
                        ...(event.amount !== undefined && { amount: event.amount }),
                        ...(event.property !== undefined && { property: event.property }),
                        ...(event.baseAmount !== undefined && { baseAmount: event.baseAmount })
                    }
                }))
            );

            res.json({
                success: true,
                data: {
                    deletedEvents: deleteResult.data,
                    newEvents: result.data
                }
            });
        } catch (error) {
            if (error instanceof Error && error.message.includes('MonopolyChatBot not initialized')) {
                res.status(503).json({ 
                    error: 'MonopolyChatBot service is not available',
                    details: 'Game event creation with AI is currently unavailable'
                });
            } else {
                throw error;
            }
        }
    } catch (error) {
        if (error instanceof Error) {
            res.status(500).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'An unknown error occurred' });
        }
    }
    next();
};

// SSE endpoint for events
const eventStream: RequestHandler = (req, res, next: NextFunction): void => {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send a ping every 30 seconds to keep the connection alive
    const pingInterval = setInterval(() => {
        res.write('event: ping\ndata: ping\n\n');
    }, 30000);

    // Clean up on client disconnect
    req.on('close', () => {
        clearInterval(pingInterval);
    });
    next();
};

// Register routes
router.get('/health', healthCheck);
router.get('/getEvent', getEvent);
router.get('/getQuestion', getQuestion);
router.post('/createEvents', createEvents);
router.post('/updateEvents', updateEvents);
router.get('/events', eventStream);

// Use router
app.use(router);

// Start server after connecting to database
initializeServices().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
        console.log('Available endpoints:');
        console.log('  GET  /health     - Check server and MongoDB status');
        console.log('  GET  /getEvent   - Get an unused event');
        console.log('  GET  /getQuestion- Get an unused question');
        console.log('  POST /createEvents- Create a new event using AI');
        console.log('  POST /updateEvents- Update existing events using AI');
    });
});
