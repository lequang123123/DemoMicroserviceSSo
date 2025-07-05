module.exports = {
    testEnvironment: 'node',
    collectCoverageFrom: [
        'lambda/**/*.js',
        '!lambda/**/node_modules/**',
        '!lambda/**/coverage/**'
    ],
    testMatch: [
        '**/__tests__/**/*.js',
        '**/?(*.)+(spec|test).js'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
}; 