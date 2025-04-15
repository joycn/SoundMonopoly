import { BaseItem } from './base';

export interface Event extends BaseItem {
    data: {
        message: string;
        type: 'chance' | 'community_chest' | 'trade' | 'auction' | 'property' | 'system';
        amount?: number;
        property?: string;
        baseAmount?: number;  // Original amount before random variation
    };
    used: boolean;
    assignedTo?: string;
    createdBy?: string;
    createdAt?: Date;
}

export const eventSampleData: ReadonlyArray<Omit<Event, '_id'>> = [
    { 
        data: { 
            message: 'Pay luxury tax', 
            type: 'chance',
            amount: 2400,
            baseAmount: 2000
        }, 
        used: false 
    },
    { 
        data: { 
            message: 'Property auction', 
            type: 'auction',
            amount: 1600,
            baseAmount: 2000,
            property: 'Park Place'
        }, 
        used: false 
    },
    { 
        data: { 
            message: 'Bank error in your favor', 
            type: 'community_chest',
            amount: 1200,
            baseAmount: 1000
        }, 
        used: false 
    }
] as const;
