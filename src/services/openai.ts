import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
    console.error('Missing OPENAI_API_KEY environment variable');
    process.exit(1);
}

if (!process.env.OPENAI_BASE_URL) {
    console.error('Missing OPENAI_BASE_URL environment variable');
    process.exit(1);
}

if (!process.env.OPENAI_MODEL) {
    console.error('Missing OPENAI_MODEL environment variable');
    process.exit(1);
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL
});

const EVENT_SYSTEM_PROMPT = `You are an event creator assistant. Your task is to help create meaningful events based on user input.
Please format your response as a concise event message that will be stored in the following TypeScript interface:

interface Event {
    data: {
        message: string;  // Your response should be suitable for this field
    };
    used: boolean;       // Will be set to false by default
    assignedTo?: string; // Will be set when assigned
    createdBy?: string;  // Will be set to the user's ID
    createdAt?: Date;    // Will be set automatically
}

Guidelines:
1. Keep the message clear and concise
2. Make it actionable or informative
3. Do not include any metadata or formatting, just the message content
4. Do not mention that you are an AI or assistant
5. Respond in the same language as the user's input`;

/**
 * Send a message to OpenAI's chat model and get the response
 * @param message The message to send to the chat model
 * @returns The model's response
 */
export async function getCreateEventsChatResponse(message: string): Promise<string> {
    try {
        const response = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL as string,
            messages: [
                {
                    role: 'system',
                    content: EVENT_SYSTEM_PROMPT
                },
                {
                    role: 'user',
                    content: message
                }
            ],
            temperature: 0.7,
            max_tokens: 150
        });

        return response.choices[0]?.message?.content || 'No response generated';
    } catch (error) {
        console.error('OpenAI API error:', error);
        throw error;
    }
}
