/**
 * Tests unitarios para internalConfig.js
 * Verifica configuración de colecciones y IDs
 */

// Import ESM dinámico para internalConfig.js
let COLLECTIONS;
beforeAll(async () => {
  const mod = await import('../../src/backend/internalConfig.js');
  COLLECTIONS = mod.COLLECTIONS;
});

describe('internalConfig.js - Configuración de Colecciones', () => {
  
  describe('IDs Críticos', () => {
    test('CAJA_ACTUAL debe ser "CajaActual"', () => {
      expect(COLLECTIONS.CAJA_ACTUAL).toBe('CajaActual');
    });

    test('MOVIMIENTOS_CAJA debe ser "MovimientosCaja"', () => {
      expect(COLLECTIONS.MOVIMIENTOS_CAJA).toBe('MovimientosCaja');
    });

    test('No debe existir CajaActualConsolidada como ID activo', () => {
      const allValues = Object.values(COLLECTIONS);
      expect(allValues).not.toContain('CajaActualConsolidada');
    });

    test('No debe existir MovimientosCajaConsolidada como ID activo', () => {
      const allValues = Object.values(COLLECTIONS);
      expect(allValues).not.toContain('MovimientosCajaConsolidada');
    });
  });

  describe('Colecciones del SSOT', () => {
    const expectedCollections = {
      ALERTAS_OPERATIVAS: 'AlertasOperativas',
      ASIENTOS_CONTABLES: 'AsientosContables',
      AVAILABILITY_DAYS_CACHE: 'AvailabilityDaysCache',
      BOOKINGS_SERVICE_SYNC_QUEUE: 'BookingsServiceSyncQueue',
      BOOKING_TRANSACTIONS: 'BookingTransactions',
      CAJA_ACTUAL: 'CajaActual',
      CITAS_F2: 'CitasF2',
      COMPENSACIONES_PENDIENTES: 'CompensacionesPendientes',
      COMPLEMENTOS_CATALOGO: 'ComplementosCatalogo',
      CONFIGURACION_FISCAL: 'ConfiguracionFiscal',
      DATOS_FISCALES: 'DatosFiscales',
      DUAL_SLOT_CACHE: 'DualSlotCache',
      HISTORICO_CIERRES_Z: 'HistoricoCierresZ',
      INVENTARIO_STOCK_VENTA: 'InventarioStockVenta',
      LIBRO_ASIENTOS_CONTABLES_DETALLE: 'LibroAsientosContablesDetalle',
      M365_GRAPH_SYNC_QUEUE: 'M365GraphSyncQueue',
      MAPA_STAFF: 'MapaStaff',
      MOVIMIENTOS_CAJA: 'MovimientosCaja',
      MOVIMIENTOS_INVENTARIO: 'MovimientosInventario',
      PROVEEDORES_LISTA: 'ProveedoresLista',
      RATE_LIMIT_BLOCKS: 'RateLimitBlocks',
      REGISTROS_HORARIOS_STAFF: 'RegistrosHorariosStaff',
      SERVICIOS_CATALOGO: 'ServiciosCatalogo',
      SLOT_LOCKS: 'SlotLocks'
    };

    test.each(Object.entries(expectedCollections))(
      '%s debe estar definida con valor "%s"',
      (key, expectedValue) => {
        expect(COLLECTIONS[key]).toBeDefined();
        expect(COLLECTIONS[key]).toBe(expectedValue);
      }
    );
  });

  describe('Integridad de configuración', () => {
    test('No debe tener colecciones duplicadas', () => {
      const values = Object.values(COLLECTIONS);
      const uniqueValues = new Set(values);
      expect(values.length).toBe(uniqueValues.size);
    });

    test('Todos los valores deben ser strings no vacíos', () => {
      Object.entries(COLLECTIONS).forEach(([key, value]) => {
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      });
    });

    test('No debe tener IDs deprecated', () => {
      const deprecatedIds = [
        'CajaActualConsolidada',
        'MovimientosCajaConsolidada',
        'CITASF2',
        'COMPENSACIONESPENDIENTES',
        'INVENTARIO_STOCK_VENTA_CIERRE',
        'SECUENCIA_TICKETS',
        'CONTROL_PARCIAL_X',
        'EVENTOS_SISTEMA_FACTURACION',
        'LIBRO_REGISTRO_FACTURAS_RECIBIDAS',
        'PLAN_CUENTAS_CONTABLES'
      ];

      const allValues = Object.values(COLLECTIONS);
      deprecatedIds.forEach(deprecatedId => {
        expect(allValues).not.toContain(deprecatedId);
      });
    });
  });

  describe('Conteo de colecciones', () => {
    test('Debe tener exactamente 24 colecciones declaradas', () => {
      const collectionCount = Object.keys(COLLECTIONS).length;
      expect(collectionCount).toBe(24);
    });
  });
});
