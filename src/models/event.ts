import { BaseItem } from './base';

export interface Event extends BaseItem {}

export const eventSampleData: ReadonlyArray<Omit<Event, '_id'>> = [
    { data: { message: 'Event 1' }, used: false },
    { data: { message: 'Event 2' }, used: false },
    { data: { message: 'Event 3' }, used: false }
] as const;
