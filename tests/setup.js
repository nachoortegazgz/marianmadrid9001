/**
 * Setup global para tests unitarios
 * Configura mocks de APIs de Wix Velo antes de cada test
 */

const mockWixData = require('./mocks/wixData');

// Configurar mocks globales
beforeEach(() => {
  global.wixData = mockWixData;
  mockWixData.__reset();
});

afterEach(() => {
  mockWixData.__reset();
});

// Mock de wixUsers (básico)
global.wixUsers = {
  currentUser: jest.fn().mockReturnValue({
    loggedIn: true,
    id: 'mock-user-id',
    getRoles: jest.fn().mockResolvedValue(['MEMBER'])
  })
};

// Mock de console para silenciar logs en tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};
