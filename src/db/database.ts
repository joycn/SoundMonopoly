import { Collection, MongoClient, ObjectId } from 'mongodb';
import { Database } from 'sqlite';
import { BaseItem } from '../models/base';

export type DatabaseType = 'mongodb' | 'sqlite';

export interface DatabaseConfig {
    type: DatabaseType;
    mongoUri?: string;
    sqliteFile?: string;
}

export interface DatabaseClient {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    getCollection<T extends BaseItem>(name: string): Promise<Collection<T> | Database>;
    isConnected(): boolean;
}

export class MongoDBClient implements DatabaseClient {
    private client: MongoClient;
    private dbName: string;
    private isConnectedFlag: boolean = false;

    constructor(mongoUri: string, dbName: string) {
        this.client = new MongoClient(mongoUri);
        this.dbName = dbName;
    }

    async connect(): Promise<void> {
        await this.client.connect();
        this.isConnectedFlag = true;
    }

    async disconnect(): Promise<void> {
        await this.client.close();
        this.isConnectedFlag = false;
    }

    async getCollection<T extends BaseItem>(name: string): Promise<Collection<T>> {
        return this.client.db(this.dbName).collection<T>(name);
    }

    isConnected(): boolean {
        return this.isConnectedFlag;
    }
}

export class SQLiteClient implements DatabaseClient {
    private db: Database | null = null;
    private dbFile: string;

    constructor(dbFile: string) {
        if (!dbFile) {
            throw new Error('sqlite: filename cannot be null / undefined');
        }
        this.dbFile = dbFile;
    }

    async connect(): Promise<void> {
        const sqlite3 = require('sqlite3');
        const { open } = require('sqlite');
        
        this.db = await open({
            filename: this.dbFile,
            driver: sqlite3.Database
        });
        
        // Create tables if they don't exist
        if (this.db) {
            await this.db.exec(`
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    data TEXT NOT NULL,
                    used BOOLEAN DEFAULT FALSE,
                    assignedTo TEXT,
                    createdBy TEXT,
                    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                
                CREATE TABLE IF NOT EXISTS questions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    data TEXT NOT NULL,
                    used BOOLEAN DEFAULT FALSE,
                    assignedTo TEXT,
                    createdBy TEXT,
                    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            `);
        }
    }

    async disconnect(): Promise<void> {
        if (this.db) {
            await this.db.close();
            this.db = null;
        }
    }

    async getCollection<T extends BaseItem>(name: string): Promise<Database> {
        if (!this.db) {
            throw new Error('Database not connected');
        }
        return this.db;
    }

    isConnected(): boolean {
        return this.db !== null;
    }
}

export function createDatabaseClient(config: DatabaseConfig): DatabaseClient {
    switch (config.type) {
        case 'mongodb':
            if (!config.mongoUri) {
                throw new Error('MongoDB URI is required for MongoDB client');
            }
            return new MongoDBClient(config.mongoUri, process.env.MONGODB_DB || 'events_db');
            
        case 'sqlite':
            if (!config.sqliteFile) {
                throw new Error('SQLite file path is required for SQLite client');
            }
            return new SQLiteClient(config.sqliteFile);
            
        default:
            throw new Error(`Unsupported database type: ${config.type}`);
    }
}
