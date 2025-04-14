import express, { Request, Response, Router } from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const router = Router();
const PORT = 3000;

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || '';
const dbName = process.env.MONGODB_DB || 'events_db';
const collectionName = process.env.MONGODB_COLLECTION || 'events';

if (!mongoUri) {
    console.error('Missing required MONGODB_URI environment variable');
    process.exit(1);
}

const client = new MongoClient(mongoUri);

// Define types
interface GetEventRequest {
    userId: string;
}

interface Event {
    _id?: ObjectId;
    data: { message: string };
    used: boolean;
    assignedTo?: string;
}

// Enable CORS and JSON body parsing
app.use(cors());
app.use(express.json());

// Connect to MongoDB
async function connectToMongo() {
    try {
        await client.connect();
        console.log('Connected to MongoDB');
        
        // Check if we have any events, if not, initialize some
        const db = client.db(dbName);
        const collection = db.collection<Event>(collectionName);
        const count = await collection.countDocuments();
        
        if (count === 0) {
            await collection.insertMany([
                { data: { message: 'Event 1' }, used: false },
                { data: { message: 'Event 2' }, used: false },
                { data: { message: 'Event 3' }, used: false }
            ]);
            console.log('Initialized sample events');
        }
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
        const db = client.db(dbName);
        const collection = db.collection<Event>(collectionName);

        // Find an unused event not assigned to this user
        const event = await collection.findOne({
            used: false,
            assignedTo: { $ne: userId }
        });

        if (event) {
            // Mark event as used and assign to user
            await collection.updateOne(
                { _id: event._id },
                { 
                    $set: { 
                        used: true,
                        assignedTo: userId
                    }
                }
            );

            res.json({
                success: true,
                data: event.data
            });
            return;
        }

        // If no unused events found, reset all events
        await collection.updateMany(
            {},
            { 
                $set: { 
                    used: false,
                    assignedTo: undefined
                }
            }
        );

        // Try to get the first available event
        const resetEvent = await collection.findOne({});
        
        if (resetEvent) {
            await collection.updateOne(
                { _id: resetEvent._id },
                { 
                    $set: { 
                        used: true,
                        assignedTo: userId
                    }
                }
            );

            res.json({
                success: true,
                data: resetEvent.data
            });
            return;
        }

        res.json({
            success: false,
            data: { error: 'No events available' }
        });
    } catch (error) {
        console.error('MongoDB operation failed:', error);
        res.status(500).json({
            success: false,
            data: { error: 'Internal server error' }
        });
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

// Health check endpoint
router.get('/health', async (req: Request, res: Response) => {
    try {
        await client.db(dbName).command({ ping: 1 });
        res.json({ status: 'ok', mongodb: 'connected' });
    } catch (error) {
        res.status(500).json({ status: 'error', mongodb: 'disconnected' });
    }
});

// Use router
app.use(router);

// Start server after connecting to MongoDB
connectToMongo().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
});
