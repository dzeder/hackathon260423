/*
 * Jest config for sfdx-lwc-jest (LWC component tests under force-app/**).
 * Other workspaces use Vitest — explicitly scope Jest to LWC __tests__/ so
 * `npm run test:lwc` does not try to parse Vitest specs.
 */
const { jestConfig } = require('@salesforce/sfdx-lwc-jest/config');

module.exports = {
    ...jestConfig,
    testMatch: ['<rootDir>/force-app/**/__tests__/**/*.test.js'],
    testPathIgnorePatterns: [
        '<rootDir>/node_modules/',
        '<rootDir>/packages/'
    ]
};
