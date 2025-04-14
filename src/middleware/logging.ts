import { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    
    // Log request
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    if (Object.keys(req.body).length > 0) {
        console.log('Request Body:', req.body);
    }

    // Capture response
    const oldSend = res.send;
    res.send = function(data) {
        // Log response
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] Response (${duration}ms):`, 
            typeof data === 'string' ? data.substring(0, 1000) : data);
        
        return oldSend.apply(res, arguments as any);
    };

    next();
}
