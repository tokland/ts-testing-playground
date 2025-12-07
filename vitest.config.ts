import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true, // allows using describe/it/expect without imports
        environment: 'node', // or 'happy-dom' for browser-like tests
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html']
        }
    }
});
