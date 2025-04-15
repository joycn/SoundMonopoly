import { Collection, MongoClient, ObjectId } from 'mongodb';
import { Database } from 'sqlite';
import { BaseItem } from '../models/base';
import { DatabaseClient, DatabaseType } from './database';

export interface CollectionConfig {
    name: string;
    sampleData: ReadonlyArray<Omit<BaseItem, '_id'>>;
}

/**
 * Generic function to get a random unused item from a collection
 * @param client Database client
 * @param collectionName Collection name to query
 * @param userId User ID to check assignment against
 * @param sampleData Sample data to initialize collection if empty
 * @returns Object containing success status and data/error message
 */
export async function getItemFromCollection<T extends BaseItem>(
    client: DatabaseClient,
    collectionName: string,
    userId: string,
    sampleData: Array<Omit<T, '_id'>>
): Promise<{ success: boolean; data: any }> {
    try {
        const collection = await client.getCollection<T>(collectionName);

        if (collection instanceof Collection) {
            // MongoDB operations
            const count = await collection.countDocuments();
            if (count === 0) {
                await collection.insertMany(sampleData as any[]);
                console.log(`Initialized sample ${collectionName}`);
            }

            // Get all unused items not assigned to this user
            const items = await collection.find<T>({
                used: { $eq: false },
                assignedTo: { $ne: userId }
            } as any).toArray();

            if (items.length > 0) {
                // Select a random item
                const randomIndex = Math.floor(Math.random() * items.length);
                const item = items[randomIndex];

                // Mark the selected item as used
                await collection.updateOne(
                    { _id: item._id } as any,
                    {
                        $set: {
                            used: true,
                            assignedTo: userId
                        } as Partial<T>
                    }
                );

                return {
                    success: true,
                    data: item.data
                };
            }

            // Reset all items if none are available
            await collection.updateMany(
                {},
                {
                    $set: {
                        used: false,
                        assignedTo: undefined
                    } as Partial<T>
                }
            );

            // Try to get a random item again after reset
            const resetItems = await collection.find<T>({}).toArray();
            if (resetItems.length > 0) {
                const randomIndex = Math.floor(Math.random() * resetItems.length);
                const item = resetItems[randomIndex];
                await collection.updateOne(
                    { _id: item._id } as any,
                    {
                        $set: {
                            used: true,
                            assignedTo: userId
                        } as Partial<T>
                    }
                );

                return {
                    success: true,
                    data: item.data
                };
            }
        } else {
            // SQLite operations
            const db = collection as Database;
            
            // Check if we need to initialize data
            const count = await db.get(`SELECT COUNT(*) as count FROM ${collectionName}`);
            if (count.count === 0) {
                const stmt = await db.prepare(
                    `INSERT INTO ${collectionName} (data, used) VALUES (?, ?)`
                );
                for (const item of sampleData) {
                    await stmt.run(JSON.stringify(item.data), false);
                }
                console.log(`Initialized sample ${collectionName}`);
            }

            // Get a random unused item
            const item = await db.get(
                `SELECT * FROM ${collectionName} 
                WHERE used = FALSE AND (assignedTo IS NULL OR assignedTo != ?) 
                ORDER BY RANDOM() 
                LIMIT 1`,
                [userId]
            );

            if (item) {
                await db.run(
                    `UPDATE ${collectionName} SET used = TRUE, assignedTo = ? WHERE id = ?`,
                    [userId, item.id]
                );

                return {
                    success: true,
                    data: JSON.parse(item.data)
                };
            }

            // Reset all items if none are available
            await db.run(
                `UPDATE ${collectionName} SET used = FALSE, assignedTo = NULL`
            );

            // Try to get a random item again after reset
            const resetItem = await db.get(
                `SELECT * FROM ${collectionName} ORDER BY RANDOM() LIMIT 1`
            );

            if (resetItem) {
                await db.run(
                    `UPDATE ${collectionName} SET used = TRUE, assignedTo = ? WHERE id = ?`,
                    [userId, resetItem.id]
                );

                return {
                    success: true,
                    data: JSON.parse(resetItem.data)
                };
            }
        }

        return {
            success: false,
            data: { error: `No ${collectionName} available` }
        };
    } catch (error) {
        console.error(`Database operation failed for ${collectionName}:`, error);
        throw error;
    }
}

/**
 * Create new items in the collection
 * @param client Database client
 * @param collectionName Collection name to insert into
 * @param userId User ID creating the items
 * @param items Array of items to create
 * @returns Object containing success status and created items or error message
 */
export async function createItems<T extends BaseItem>(
    client: DatabaseClient,
    collectionName: string,
    userId: string,
    items: Array<Omit<T, '_id' | 'used' | 'assignedTo' | 'createdBy' | 'createdAt'>>
): Promise<{ success: boolean; data: any }> {
    try {
        const collection = await client.getCollection<T>(collectionName);

        if (collection instanceof Collection) {
            // MongoDB operations
            const itemsToInsert = items.map(item => ({
                ...item,
                used: false,
                assignedTo: undefined,
                createdBy: userId,
                createdAt: new Date()
            }));

            const result = await collection.insertMany(itemsToInsert as any[]);

            return {
                success: true,
                data: {
                    insertedCount: result.insertedCount,
                    insertedIds: result.insertedIds
                }
            };
        } else {
            // SQLite operations
            const db = collection as Database;
            const results = [];

            for (const item of items) {
                const result = await db.run(
                    `INSERT INTO ${collectionName} (data, used, createdBy, createdAt) VALUES (?, FALSE, ?, CURRENT_TIMESTAMP)`,
                    [JSON.stringify(item.data), userId]
                );
                results.push(result.lastID);
            }

            return {
                success: true,
                data: {
                    insertedCount: results.length,
                    insertedIds: results
                }
            };
        }
    } catch (error) {
        console.error(`Database operation failed for ${collectionName}:`, error);
        throw error;
    }
}

/**
 * Initialize collections with sample data if they are empty
 * @param client Database client
 * @param collections Collection configurations
 */
export async function initializeCollections(
    client: DatabaseClient,
    collections: Record<string, CollectionConfig>
): Promise<void> {
    try {
        await Promise.all(
            Object.values(collections).map(async ({ name, sampleData }) => {
                const collection = await client.getCollection(name);

                if (collection instanceof Collection) {
                    // MongoDB initialization
                    const count = await collection.countDocuments();
                    if (count === 0) {
                        await collection.insertMany([...sampleData]);
                        console.log(`Initialized sample ${name}`);
                    }
                } else {
                    // SQLite initialization
                    const db = collection as Database;
                    const result = await db.get(`SELECT COUNT(*) as count FROM ${name}`);
                    if (result.count === 0) {
                        const stmt = await db.prepare(
                            `INSERT INTO ${name} (data, used) VALUES (?, FALSE)`
                        );
                        for (const item of sampleData) {
                            await stmt.run(JSON.stringify(item.data));
                        }
                        console.log(`Initialized sample ${name}`);
                    }
                }
            })
        );
    } catch (error) {
        console.error('Failed to initialize collections:', error);
        throw error;
    }
}

/**
 * Mark all items in a collection as used
 * @param client Database client
 * @param collectionName Collection name to update
 * @returns Object containing success status and update count
 */
export async function markAllItemsAsUsed<T extends BaseItem>(
    client: DatabaseClient,
    collectionName: string
): Promise<{ success: boolean; data: any }> {
    try {
        const collection = await client.getCollection<T>(collectionName);

        if (collection instanceof Collection) {
            // MongoDB operations
            const result = await collection.updateMany(
                { used: { $eq: false } } as any,
                {
                    $set: {
                        used: true
                    } as Partial<T>
                }
            );

            return {
                success: true,
                data: {
                    modifiedCount: result.modifiedCount
                }
            };
        } else {
            // SQLite operations
            const db = collection as Database;
            const result = await db.run(
                `UPDATE ${collectionName} SET used = TRUE WHERE used = FALSE`
            );

            return {
                success: true,
                data: {
                    modifiedCount: result.changes
                }
            };
        }
    } catch (error) {
        console.error(`Database operation failed for ${collectionName}:`, error);
        throw error;
    }
}

/**
 * Delete all items created by a specific user
 * @param client Database client
 * @param collectionName Collection name to delete from
 * @param userId User ID who created the items
 * @returns Object containing success status and deletion count
 */
export async function deleteItemsByUser<T extends BaseItem>(
    client: DatabaseClient,
    collectionName: string,
    userId: string
): Promise<{ success: boolean; data: any }> {
    try {
        const collection = await client.getCollection<T>(collectionName);

        if (collection instanceof Collection) {
            // MongoDB operations
            const result = await collection.deleteMany(
                { createdBy: userId } as any
            );

            return {
                success: true,
                data: {
                    deletedCount: result.deletedCount
                }
            };
        } else {
            // SQLite operations
            const db = collection as Database;
            const result = await db.run(
                `DELETE FROM ${collectionName} WHERE createdBy = ?`,
                [userId]
            );

            return {
                success: true,
                data: {
                    deletedCount: result.changes
                }
            };
        }
    } catch (error) {
        console.error(`Database operation failed for ${collectionName}:`, error);
        throw error;
    }
}
