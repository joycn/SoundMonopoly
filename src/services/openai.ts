import { OpenAI } from 'openai';

interface OpenAIConfig {
    apiKey: string;
    baseURL: string;
    model: string;
}

export class MonopolyChatBot {
    private static instance: MonopolyChatBot | null = null;
    private openaiClient: OpenAI | null = null;
    private model: string = '';

    private readonly SYSTEM_PROMPT = `You are a Monopoly game master assistant. Your task is to help create engaging and fun Monopoly game events and scenarios.
Your response must be a valid JSON array containing multiple event messages. Each event should follow this TypeScript interface:

interface Event {
    message: string;  // The event message
    type: 'chance' | 'community_chest' | 'trade' | 'auction' | 'property';  // Type of Monopoly event
    amount?: number;  // Monetary amount with random variation
    property?: string;  // Optional property name involved
    baseAmount?: number;  // Original amount before variation
};

Amount Calculation Rules:
1. If a specific amount is mentioned in the user's message, use that as the baseAmount
2. If no amount is mentioned, use 2000 as the baseAmount
3. For the final amount:
   - Generate a random multiplier from these options: 0.6, 0.8, 1.0, 1.2, 1.4
   - Multiply the baseAmount by this multiplier
   - Round to the nearest whole number
4. Include both the final amount and baseAmount in the response

Example response format:
[
    {
        "message": "Advance to Boardwalk! Pay a luxury tax of $2400",
        "type": "chance",
        "property": "Boardwalk",
        "amount": 2400,
        "baseAmount": 2000
    },
    {
        "message": "Property auction on Park Place starting at $1200",
        "type": "auction",
        "property": "Park Place",
        "amount": 1200,
        "baseAmount": 2000
    }
]

Guidelines:
1. Always return 2-4 events in the array
2. Each message should be clear, concise, and actionable
3. Include a mix of different event types
4. Events should be thematically related to the user's input
5. Do not include any metadata or formatting outside the JSON structure
6. Respond in the same language as the user's input
7. Always apply the amount calculation rules to monetary values
8. Include the amount variation in the message naturally`;

    private constructor() {}

    /**
     * Get the singleton instance of MonopolyChatBot
     */
    public static getInstance(): MonopolyChatBot {
        if (!MonopolyChatBot.instance) {
            MonopolyChatBot.instance = new MonopolyChatBot();
        }
        return MonopolyChatBot.instance;
    }

    /**
     * Initialize the OpenAI client with the provided configuration
     * @param config OpenAI configuration object
     * @throws Error if required configuration is missing
     */
    public initialize(config: OpenAIConfig): void {
        if (!config.apiKey) {
            throw new Error('Missing apiKey in OpenAI configuration');
        }

        if (!config.baseURL) {
            throw new Error('Missing baseURL in OpenAI configuration');
        }

        if (!config.model) {
            throw new Error('Missing model in OpenAI configuration');
        }

        this.openaiClient = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseURL
        });

        this.model = config.model;
    }

    /**
     * Create multiple game events using OpenAI
     * @param message User message to generate events from
     * @returns Object with success status and array of events
     * @throws Error if OpenAI client is not initialized
     */
    public async createGameEvent(message: string): Promise<{ 
        success: boolean; 
        data: Array<{ message: string; type: string; amount?: number; property?: string; baseAmount?: number; }> 
    }> {
        if (!this.openaiClient) {
            throw new Error('MonopolyChatBot not initialized. Call initialize() first.');
        }

        try {
            const completion = await this.openaiClient.chat.completions.create({
                model: this.model,
                messages: [
                    { role: 'system', content: this.SYSTEM_PROMPT },
                    { role: 'user', content: message }
                ]
            });

            const content = completion.choices[0]?.message?.content || '';
            try {
                const events = JSON.parse(content);
                if (Array.isArray(events)) {
                    return {
                        success: true,
                        data: events
                    };
                } else {
                    console.warn('Unexpected response format:', content);
                    return {
                        success: false,
                        data: [{ message: 'Invalid game events format', type: 'system' }]
                    };
                }
            } catch (error) {
                console.error('Failed to parse OpenAI response:', error);
                return {
                    success: false,
                    data: [{ message: 'Failed to parse game events', type: 'system' }]
                };
            }
        } catch (error) {
            console.error('OpenAI API error:', error);
            throw error;
        }
    }

    /**
     * Check if the bot is initialized and ready to use
     */
    public isInitialized(): boolean {
        return this.openaiClient !== null;
    }
}
