/**
 * Configuración de Jest para tests unitarios
 */
module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  moduleDirectories: ['node_modules', 'src'],
  verbose: true,
  testTimeout: 10000
};
