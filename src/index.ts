import express, { Request, Response, Router } from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { getItemFromCollection, initializeCollections, createItems } from './db/operations';
import { getCreateEventsChatResponse } from './services/openai';
import { Event } from './models/event';
import { Question } from './models/question';
import { COLLECTIONS } from './config/collections';
import { requestLogger } from './middleware/logging';

// Load environment variables
dotenv.config();

const app = express();
const router = Router();
const PORT = process.env.PORT || 3000;

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || '';
const dbName = process.env.MONGODB_DB || 'events_db';

if (!mongoUri) {
    console.error('Missing required MONGODB_URI environment variable');
    process.exit(1);
}

const client = new MongoClient(mongoUri);

// Define types
interface GetItemRequest {
    userId: string;
}

interface CreateEventsRequest {
    userId: string;
    message: string;
}

// Enable CORS and JSON body parsing
app.use(cors());
app.use(express.json());

// Add logging middleware
app.use(requestLogger);

// Connect to MongoDB
async function connectToMongo() {
    try {
        await client.connect();
        console.log('Connected to MongoDB');
        await initializeCollections(client, dbName, COLLECTIONS);
    } catch (error) {
        console.error('Failed to connect to MongoDB:', error);
        process.exit(1);
    }
}

// Get event endpoint
router.get('/getEvent', async (req: Request, res: Response) => {
    const { userId } = req.body;

    if (!userId || typeof userId !== 'string') {
        res.status(400).json({
            success: false,
            data: { error: 'Invalid userId parameter' }
        });
        return;
    }

    try {
        const collection = client.db(dbName).collection<Event>(COLLECTIONS.events.name);
        const result = await getItemFromCollection<Event>(
            collection,
            userId,
            [...COLLECTIONS.events.sampleData]
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            data: { error: 'Internal server error' }
        });
    }
});

// Get question endpoint
router.get('/getQuestion', async (req: Request, res: Response) => {
    const { userId } = req.body;

    if (!userId || typeof userId !== 'string') {
        res.status(400).json({
            success: false,
            data: { error: 'Invalid userId parameter' }
        });
        return;
    }

    try {
        const collection = client.db(dbName).collection<Question>(COLLECTIONS.questions.name);
        const result = await getItemFromCollection<Question>(
            collection,
            userId,
            [...COLLECTIONS.questions.sampleData]
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            data: { error: 'Internal server error' }
        });
    }
});

// Create events endpoint
router.post('/createEvents', async (req: Request<{}, any, CreateEventsRequest>, res: Response) => {
    const { userId, message } = req.body;

    if (!userId || typeof userId !== 'string') {
        res.status(400).json({
            success: false,
            data: { error: 'Invalid userId parameter' }
        });
        return;
    }

    if (!message || typeof message !== 'string') {
        res.status(400).json({
            success: false,
            data: { error: 'Invalid message parameter' }
        });
        return;
    }

    try {
        // Get response from OpenAI
        const aiResponse = await getCreateEventsChatResponse(message);
        
        // Create event with the AI response
        const collection = client.db(dbName).collection<Event>(COLLECTIONS.events.name);
        const result = await createItems<Event>(
            collection,
            userId,
            [{
                data: { message: aiResponse }
            }]
        );
        
        res.json({
            success: true,
            data: {
                userMessage: message,
                aiResponse,
                ...result.data
            }
        });
    } catch (error) {
        console.error('Failed to process event:', error);
        res.status(500).json({
            success: false,
            data: { error: 'Internal server error' }
        });
    }
});

// Health check endpoint
router.get('/health', async (req: Request, res: Response) => {
    try {
        await client.db(dbName).command({ ping: 1 });
        res.json({ status: 'ok', mongodb: 'connected' });
    } catch (error) {
        res.status(500).json({ status: 'error', mongodb: 'disconnected' });
    }
});

// SSE endpoint
router.get('/events', (req: Request, res: Response) => {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial connection message
    res.write('data: {"message": "Connected to SSE server"}\n\n');

    // Keep connection alive
    const keepAlive = setInterval(() => {
        res.write(': keepalive\n\n');
    }, 30000);

    // Handle client disconnect
    req.on('close', () => {
        clearInterval(keepAlive);
    });
});

// Use router
app.use(router);

// Start server after connecting to MongoDB
connectToMongo().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
        console.log('Available endpoints:');
        console.log('  GET  /health     - Check server and MongoDB status');
        console.log('  GET  /getEvent   - Get an unused event');
        console.log('  GET  /getQuestion- Get an unused question');
        console.log('  POST /createEvents- Create a new event using AI');
    });
});
