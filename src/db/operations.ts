import { Collection, MongoClient, ObjectId } from 'mongodb';

export interface BaseItem {
    _id?: ObjectId;
    data: { message: string };
    used: boolean;
    assignedTo?: string;
    createdBy?: string;
    createdAt?: Date;
}

export interface CollectionConfig {
    name: string;
    sampleData: ReadonlyArray<Omit<BaseItem, '_id'>>;
}

/**
 * Generic function to get an unused item from a collection
 * @param collection MongoDB collection to query
 * @param userId User ID to check assignment against
 * @param sampleData Sample data to initialize collection if empty
 * @returns Object containing success status and data/error message
 */
export async function getItemFromCollection<T extends BaseItem>(
    collection: Collection<T>,
    userId: string,
    sampleData: Array<Omit<T, '_id'>>
): Promise<{ success: boolean; data: any }> {
    try {
        // Initialize collection if empty
        const count = await collection.countDocuments();
        if (count === 0) {
            await collection.insertMany(sampleData as any[]);
            console.log(`Initialized sample ${collection.collectionName}`);
        }

        // Find an unused item not assigned to this user
        const item = await collection.findOne<T>({
            used: false,
            assignedTo: { $ne: userId }
        } as any);

        if (item) {
            // Mark item as used and assign to user
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

        // If no unused items found, reset all items
        await collection.updateMany(
            {},
            { 
                $set: { 
                    used: false,
                    assignedTo: undefined
                } as Partial<T>
            }
        );

        // Try to get the first available item
        const resetItem = await collection.findOne<T>({});
        
        if (resetItem) {
            await collection.updateOne(
                { _id: resetItem._id } as any,
                { 
                    $set: { 
                        used: true,
                        assignedTo: userId
                    } as Partial<T>
                }
            );

            return {
                success: true,
                data: resetItem.data
            };
        }

        return {
            success: false,
            data: { error: `No ${collection.collectionName} available` }
        };
    } catch (error) {
        console.error(`MongoDB operation failed for ${collection.collectionName}:`, error);
        throw error;
    }
}

/**
 * Create new items in the collection
 * @param collection MongoDB collection to insert into
 * @param userId User ID creating the items
 * @param items Array of items to create
 * @returns Object containing success status and created items or error message
 */
export async function createItems<T extends BaseItem>(
    collection: Collection<T>,
    userId: string,
    items: Array<Omit<T, '_id' | 'used' | 'assignedTo' | 'createdBy' | 'createdAt'>>
): Promise<{ success: boolean; data: any }> {
    try {
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
    } catch (error) {
        console.error(`MongoDB operation failed for ${collection.collectionName}:`, error);
        throw error;
    }
}

/**
 * Initialize MongoDB collections with sample data if they are empty
 * @param client MongoDB client
 * @param dbName Database name
 * @param collections Collection configurations
 */
export async function initializeCollections(
    client: MongoClient,
    dbName: string,
    collections: Record<string, CollectionConfig>
): Promise<void> {
    try {
        const db = client.db(dbName);
        await Promise.all(
            Object.values(collections).map(async ({ name, sampleData }) => {
                const collection = db.collection(name);
                const count = await collection.countDocuments();
                if (count === 0) {
                    await collection.insertMany([...sampleData]);
                    console.log(`Initialized sample ${name}`);
                }
            })
        );
    } catch (error) {
        console.error('Failed to initialize collections:', error);
        throw error;
    }
}
