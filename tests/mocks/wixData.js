/**
 * Mock de wix-data para tests unitarios
 * Simula la API de datos de Wix Velo sin conexión real al CMS
 */

const mockResults = new Map();
const mockQueries = new Map();

module.exports = {
  // Resetear mocks entre tests
  __reset: () => {
    mockResults.clear();
    mockQueries.clear();
    module.exports.query.mockClear();
    module.exports.get.mockClear();
    module.exports.insert.mockClear();
    module.exports.update.mockClear();
    module.exports.remove.mockClear();
    module.exports.save.mockClear();
  },

  // Configurar resultado esperado para una colección
  __mockCollection: (collectionId, items = []) => {
    mockResults.set(collectionId, [...items]);
  },

  // Query - devuelve un objeto con métodos encadenables
  query: jest.fn((collectionId) => ({
    eq: jest.fn().mockReturnThis(),
    ne: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    ge: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    le: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    hasSome: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    find: jest.fn().mockImplementation(async () => {
      const items = mockResults.get(collectionId) || [];
      return { items, totalCount: items.length };
    }),
    findOne: jest.fn().mockImplementation(async () => {
      const items = mockResults.get(collectionId) || [];
      return items.length > 0 ? items[0] : null;
    })
  })),

  // Get - obtener un documento por ID
  get: jest.fn().mockImplementation(async (collectionId, itemId) => {
    const items = mockResults.get(collectionId) || [];
    return items.find(item => item._id === itemId) || null;
  }),

  // Insert - insertar un nuevo documento
  insert: jest.fn().mockImplementation(async (collectionId, item) => {
    const items = mockResults.get(collectionId) || [];
    const newItem = { ...item, _id: item._id || `mock_${Date.now()}` };
    items.push(newItem);
    mockResults.set(collectionId, items);
    return newItem;
  }),

  // Update - actualizar un documento existente
  update: jest.fn().mockImplementation(async (collectionId, item) => {
    const items = mockResults.get(collectionId) || [];
    const index = items.findIndex(i => i._id === item._id);
    if (index === -1) {
      throw new Error(`Document not found: ${item._id}`);
    }
    items[index] = { ...items[index], ...item };
    mockResults.set(collectionId, items);
    return items[index];
  }),

  // Remove - eliminar un documento
  remove: jest.fn().mockImplementation(async (collectionId, itemId) => {
    const items = mockResults.get(collectionId) || [];
    const filtered = items.filter(i => i._id !== itemId);
    if (filtered.length === items.length) {
      throw new Error(`Document not found: ${itemId}`);
    }
    mockResults.set(collectionId, filtered);
    return { _id: itemId };
  }),

  // Save - guardar (insert o update)
  save: jest.fn().mockImplementation(async (collectionId, item) => {
    const items = mockResults.get(collectionId) || [];
    const index = items.findIndex(i => i._id === item._id);
    
    if (index === -1) {
      // Insert
      const newItem = { ...item, _id: item._id || `mock_${Date.now()}` };
      items.push(newItem);
      mockResults.set(collectionId, items);
      return newItem;
    } else {
      // Update
      items[index] = { ...items[index], ...item };
      mockResults.set(collectionId, items);
      return items[index];
    }
  })
};
