import { CollectionConfig } from '../db/operations';
import { eventSampleData } from '../models/event';
import { questionSampleData } from '../models/question';

export const COLLECTIONS: Record<string, CollectionConfig> = {
    events: {
        name: 'events',
        sampleData: eventSampleData
    },
    questions: {
        name: 'questions',
        sampleData: questionSampleData
    }
} as const;
