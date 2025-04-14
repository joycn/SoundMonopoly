import { BaseItem } from './base';

export interface Question extends BaseItem {}

export const questionSampleData: ReadonlyArray<Omit<Question, '_id'>> = [
    { data: { message: 'Question 1' }, used: false },
    { data: { message: 'Question 2' }, used: false },
    { data: { message: 'Question 3' }, used: false }
] as const;
