import { ObjectId } from 'mongodb';

export interface BaseItem {
    _id?: ObjectId;
    data: { message: string };
    used: boolean;
    assignedTo?: string;
    createdBy?: string;
    createdAt?: Date;
}
