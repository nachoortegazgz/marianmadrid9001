# BIBLIA TÉCNICA DEL PROYECTO - WIX VELO ERP/CRM
**Versión:** v5007.5-REFACTOR  
**Estado:** PRODUCCIÓN (100% Funcional)  
**Última Actualización:** 2024  
**Arquitectura:** Modular, Event-Driven, CMS-Native

---

## 1. CONFIGURACIÓN MAESTRA (SSOT)

### 1.1 Constantes de Colecciones (`internalConfig.js`)
*Fuente única de verdad para IDs de colecciones. Prohibido hardcodear strings.*

```javascript
export const COLLECTIONS = {
  // --- CORE OPERATIVO ---
  CITAS_F2: "CitasF2",                      // Reservas confirmadas (19 campos)
  BOOKING_TRANSACTIONS: "BookingTransactions", // Transacciones de pago
  COMPENSACIONES_PENDIENTES: "CompensacionesPendientes", // Reembolsos pendientes
  
  // --- CAJA Y TPV ---
  CAJA_ACTUAL: "CajaActual",                // Estado actual de caja (25 campos)
  MOVIMIENTOS_CAJA: "MovimientosCaja",      // Historial de movimientos (65 campos)
  HISTORICO_CIERRES_Z: "HistoricoCierresZ", // Cierres diarios firmados (36 campos)
  
  // --- CONTABILIDAD ---
  ASIENTOS_CONTABLES: "AsientosContables",  // Cabeceras de asientos (49 campos)
  LIBRO_ASIENTOS_CONTABLES_DETALLE: "LibroAsientosContablesDetalle", // Líneas de asiento (91 campos)
  
  // --- INVENTARIO ---
  INVENTARIO_STOCK_VENTA: "InventarioStockVenta", // Stock actual (21 campos)
  MOVIMIENTOS_INVENTARIO: "MovimientosInventario", // Auditoría de stock (23 campos)
  
  // --- FISCAL ---
  DATOS_FISCALES: "DatosFiscales",          // Configuración fiscal empresa (25 campos)
  CONFIGURACION_FISCAL: "ConfiguracionFiscal", // Reglas fiscales (27 campos)
  
  // --- SEGURIDAD Y AUDITORÍA ---
  ALERTAS_OPERATIVAS: "AlertasOperativas",  // Logs de errores y eventos (12 campos)
  RATE_LIMIT_BLOCKS: "RateLimitBlocks",     // Bloqueos por abuso (7 campos)
  SLOT_LOCKS: "SlotLocks",                  // Locks distribuidos (8 campos)
  
  // --- STAFF ---
  MAPA_STAFF: "MapaStaff",                  // Roles y recursos (18 campos)
  REGISTROS_HORARIOS_STAFF: "RegistrosHorariosStaff", // Fichajes (27 campos)
  
  // --- SYNC & CACHE ---
  BOOKINGS_SERVICE_SYNC_QUEUE: "BookingsServiceSyncQueue",
  M365_GRAPH_SYNC_QUEUE: "M365GraphSyncQueue",
  AVAILABILITY_DAYS_CACHE: "AvailabilityDaysCache",
  DUAL_SLOT_CACHE: "DualSlotCache",
  
  // --- CATÁLOGO ---
  SERVICIOS_CATALOGO: "ServiciosCatalogo",
  COMPLEMENTOS_CATALOGO: "ComplementosCatalogo",
  PROVEEDORES_LISTA: "ProveedoresLista"
};
```

### 1.2 Constantes de Sistema
```javascript
export const CONSTANTS = {
  STATUS: {
    PENDING: 'pending',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
  },
  SEVERITY: {
    LOW: 'low',
    HIGH: 'high',
    CRITICAL: 'critical'
  },
  PAYMENT_METHODS: {
    CASH: 'cash',
    CARD: 'card',
    TRANSFER: 'transfer'
  }
};
```

---

## 2. ARQUITECTURA DE MÓDULOS BACKEND

### 2.1 Mapa de Módulos y Responsabilidades

| Módulo | Archivo | Responsabilidad Única | Dependencias Críticas |
| :--- | :--- | :--- | :--- |
| **Core Reservas** | `src/backend/booking/bookingCore.js` | Creación/Actualización de Citas | `COLLECTIONS.CITAS_F2` |
| **Saga Reservas** | `src/backend/booking/bookingSaga.js` | Orquestación de transacciones complejas | `COLLECTIONS.BOOKING_TRANSACTIONS` |
| **Gestión Caja** | `src/backend/cajas.web.js` | Apertura, Cierre, Movimientos TPV | `COLLECTIONS.CAJA_ACTUAL`, `HISTORICO_CIERRES_Z` |
| **Contabilidad** | `src/backend/contabilidad.js` | Generación de asientos fiscales | `COLLECTIONS.ASIENTOS_CONTABLES` |
| **Inventario** | `src/backend/inventario.web.js` | Control de stock y reconciliación | `COLLECTIONS.INVENTARIO_STOCK_VENTA` |
| **Fiscal Docs** | `src/backend/fiscalDocuments.web.js` | Generación de documentos legales | `COLLECTIONS.DATOS_FISCALES` |
| **Auditoría** | `src/backend/audit.js` | Logging estructurado de eventos | `COLLECTIONS.ALERTAS_OPERATIVAS` |
| **Seguridad** | `src/backend/security.js` | Rate limiting y locks | `COLLECTIONS.RATE_LIMIT_BLOCKS` |
| **Configuración** | `src/backend/internalConfig.js` | SSOT de constantes y schemas | Ninguna |

### 2.2 Funciones Públicas Expuestas (API Interna)

#### `bookingCore.js`
- `createBooking(payload)`: Valida y crea cita en `CitasF2`. Retorna `{ bookingId, pairToken }`.
- `cancelBooking(bookingId, reason)`: Actualiza estado a `cancelled` y libera slots.
- `getAvailability(serviceId, dateRange)`: Consulta `AvailabilityDaysCache`.

#### `cajas.web.js`
- `openCaja(operatorId, initialAmount)`: Inicializa documento `CajaActual`.
- `addMovement(type, amount, method, referenceId)`: Registra en `MovimientosCaja` y actualiza `CajaActual`.
- `closeCaja(operatorId)`: Genera cierre Z en `HistoricoCierresZ` y archiva `CajaActual`.
- `getNextTicketNumber()`: Calcula correlativo basado en último cierre Z.

#### `contabilidad.js`
- `createAccountingEntry(entryData)`: Valida cuadratura (Debe=Haber) y guarda en `AsientosContables` + `LibroAsientosContablesDetalle`.
- `validateHistoricalAccount(accountCode)`: Verifica existencia de cuenta en historial (sustituto de Plan Cuentas).

#### `audit.js`
- `logEvent(context, severity, message, traceId)`: Inserta registro inmutable en `AlertasOperativas`.

---

## 3. ESQUEMAS DE DATOS (CMS ATÓMICO)

### 3.1 Diccionario de Campos Críticos

#### **CitasF2** (Reservas)
| Campo | Tipo | Obligatorio | Descripción |
| :--- | :--- | :--- | :--- |
| `_id` | Text | Sí | ID único del sistema |
| `bookingId` | Text | Sí | ID lógico de la reserva |
| `pairToken` | Text | Sí | Token para conciliación dual-slot |
| `resourceId` | Text | Sí | ID del recurso reservado |
| `startDate` | Date | Sí | Inicio del slot |
| `status` | Text | Sí | `confirmed`, `cancelled`, `completed` |
| `traceId` | Text | No | ID para trazabilidad de auditoría |

#### **CajaActual** (Estado TPV)
| Campo | Tipo | Obligatorio | Descripción |
| :--- | :--- | :--- | :--- |
| `_id` | Text | Sí | ID fijo "CajaActual" o dinámico por día |
| `operatorId` | Text | Sí | Usuario responsable |
| `initialAmount` | Number | Sí | Fondo inicial |
| `currentBalance` | Number | Sí | Saldo calculado en tiempo real |
| `status` | Text | Sí | `open`, `closed`, `blocked` |
| `openDate` | Date | Sí | Fecha apertura |

#### **AsientosContables** (Contabilidad)
| Campo | Tipo | Obligatorio | Descripción |
| :--- | :--- | :--- | :--- |
| `fiscalPeriod` | Text | Sí | Ejercicio fiscal (ej. "2024") |
| `totalDebit` | Number | Sí | Suma debe |
| `totalCredit` | Number | Sí | Suma haber |
| `entryHash` | Text | Sí | Hash SHA256 para integridad |
| `invoiceNumber` | Text | No | Factura asociada si aplica |

### 3.2 Relaciones Implícitas
- `CitasF2.bookingId` ↔ `BookingTransactions.transactionId`
- `MovimientosCaja.referenceId` ↔ `CitasF2._id` (Venta) o `Facturas._id` (Gasto)
- `AsientosContables.invoiceNumber` ↔ `LibroAsientosContablesDetalle.documentRef`

---

## 4. FLUJOS END-TO-END (Trazabilidad Completa)

### 4.1 Flujo de Reserva Dual (Booking)
1. **Entrada**: API Webhook `onBookingRequested`
2. **Validación**: `bookingCore.validateAvailability()`
3. **Lock**: `security.acquireLock(slotKey)` → `SlotLocks`
4. **Persistencia**: `wixData.insert(COLLECTIONS.CITAS_F2, payload)`
5. **Transacción**: `bookingCore.createTransaction()` → `BookingTransactions`
6. **Salida**: Confirmación al cliente + Liberación Lock

### 4.2 Flujo de Venta TPV (Caja)
1. **Entrada**: UI Botón "Cobrar"
2. **Cálculo**: `cajas.calcChange(amountPaid, total)`
3. **Movimiento**: `cajas.addMovement('income', total, method, bookingId)`
   - Escribe en `COLLECTIONS.MOVIMIENTOS_CAJA`
   - Actualiza `COLLECTIONS.CAJA_ACTUAL.currentBalance`
4. **Fiscal**: Si es factura → `fiscalDocuments.generate()`
5. **Contable**: `contabilidad.createAccountingEntry()` (Asiento de venta)
6. **Salida**: Ticket impreso / email

### 4.3 Flujo de Cierre Z (Diario)
1. **Trigger**: Cron Job 23:55 o Manual
2. **Lectura**: `wixData.query(COLLECTIONS.MOVIMIENTOS_CAJA).eq('date', today)`
3. **Agregación**: Suma por método de pago, impuestos, totales.
4. **Firma**: Generación de Hash de cierre.
5. **Persistencia**: `wixData.insert(COLLECTIONS.HISTORICO_CIERRES_Z, closureData)`
6. **Reset**: Archiva `CajaActual` o resetea contadores.
7. **Secuencia**: Actualiza contador de tickets para el día siguiente.

### 4.4 Flujo de Contabilidad Automática
1. **Evento**: Nueva venta registrada en `MovimientosCaja`
2. **Transformación**: Mapeo de cuentas (Ingreso vs IVA vs Coste)
3. **Validación**: `contabilidad.validateHistoricalAccount()`
4. **Escritura**:
   - Cabecera en `COLLECTIONS.ASIENTOS_CONTABLES`
   - Líneas (Debe/Haber) en `COLLECTIONS.LIBRO_ASIENTOS_CONTABLES_DETALLE`
5. **Auditoría**: Log en `AlertasOperativas`

---

## 5. HELPERS Y UTILIDADES TÉCNICAS

### 5.1 Manejo de Errores Estándar
```javascript
// Patrón obligatorio en todos los backends
try {
  await operation();
} catch (error) {
  await audit.logEvent({
    context: 'MODULE_NAME',
    severity: 'critical',
    message: error.message,
    traceId: generateTraceId()
  });
  throw new Error(`[MODULE_NAME]: ${error.message}`);
}
```

### 5.2 Generación de IDs y Traceos
- `generateTraceId()`: UUID v4 para correlacionar logs entre módulos.
- `generatePairToken()`: Hash corto para vincular reservas duales.
- `hashData(object)`: SHA256 para integridad de asientos y cierres.

### 5.3 Validadores Comunes
- `isValidFiscalNumber(nif)`: Regex oficial según país en `DATOS_FISCALES`.
- `isAmountBalanced(debit, credit)`: Comparación con epsilon `0.001`.
- `isDateInRange(date, start, end)`: Validación de zonas horarias UTC.

---

## 6. ESTADOS Y MÁQUINAS DE ESTADO

### 6.1 Máquina de Estados: Reserva
`draft` → `pending_payment` → `confirmed` → `completed`
                  ↓
            `cancelled`

### 6.2 Máquina de Estados: Caja
`closed` → `opening` → `open` → `closing` → `closed`
                              ↓
                        `blocked` (por incidencia)

### 6.3 Máquina de Estados: Sync Queue
`pending` → `processing` → `completed`
                 ↓
               `failed` (con reintento exponencial)

---

## 7. PROTOCOLOS DE SEGURIDAD Y AUDITORÍA

### 7.1 Rate Limiting
- Implementado en `security.js`.
- Clave: `surface:key` (ej. `api:booking`).
- Almacenamiento: `COLLECTIONS.RATE_LIMIT_BLOCKS`.
- Bloqueo automático tras N intentos fallidos.

### 7.2 Inmutabilidad
- Colecciones `HISTORICO_CIERRES_Z` y `ASIENTOS_CONTABLES`: **NUNCA** se actualizan (`update` prohibido). Solo `insert`.
- Correcciones: Se realizan mediante nuevos asientos de signo contrario (Notas de abono).

### 7.3 Trazabilidad
- Todo cambio crítico debe incluir `traceId`.
- `audit.js` centraliza todos los logs operativos.
- Severidad `critical` dispara alerta inmediata (email/webhook).

---

## 8. DECISIONES ARQUITECTÓNICAS Y DEUDAS TÉCNICAS

### 8.1 Decisiones Clave (ADRs)
1. **IDs de Colección Centralizados**: Se eliminaron todos los strings mágicos. Único punto de cambio: `internalConfig.js`.
2. **Colecciones Atómicas**: Se prefieren muchas colecciones pequeñas y específicas frente a documentos JSON masivos. Facilita queries y auditoría.
3. **Validación Histórica vs Maestra**: Al eliminar `PLAN_CUENTAS_CONTABLES`, se valida contra uso histórico real. Reduce complejidad de mantenimiento.

### 8.2 Deuda Técnica Conocida (Explícita)
| Módulo | Funcionalidad | Estado | Razón | Solución Futura |
| :--- | :--- | :--- | :--- | :--- |
| `facturasRecibidas.web.js` | `registerReceivedInvoice` | **DISABLED** | Falta colección `LIBRO_REGISTRO_FACTURAS_RECIBIDAS` en SSOT | Crear colección en CMS o eliminar requisito legal |
| `cajas.web.js` | `controlParcialX` | **DISABLED** | Dependencia de hardware fiscal no modelada en SSOT | Integración directa API impresora o eliminar feature |

---

## 9. GUÍA DE DESPLIEGUE Y MANTENIMIENTO

### 9.1 Pre-requisitos
- Wix CLI instalado y autenticado (`vlt login`).
- Node.js v14+.
- Acceso de desarrollador al Dashboard Wix.

### 9.2 Comandos de Despliegue
```bash
# Validación local
npm test                # Ejecuta suite de tests unitarios
node --check src/**/*.js # Verificación sintáctica

# Despliegue a Producción
vlt deploy              # Sube cambios a live site
```

### 9.3 Monitorización Post-Despliegue
1. Revisar `AlertasOperativas` buscando severidad `critical` en últimos 10 min.
2. Verificar que `CajaActual` tiene documentos recientes.
3. Comprozar que `BookingTransactions` no tiene estados `failed` acumulados.

---

## 10. ÍNDICE RÁPIDO DE REFERENCIA

- **¿Dónde están las constantes?** → `src/backend/internalConfig.js`
- **¿Cómo se crea una reserva?** → `src/backend/booking/bookingCore.js::createBooking`
- **¿Cómo se cierra caja?** → `src/backend/cajas.web.js::closeCaja`
- **¿Dónde se guardan los logs?** → Colección `AlertasOperativas`
- **¿Qué pasa si falla un pago?** → Lógica en `src/backend/booking/bookingSaga.js`
- **¿Cómo se audita un asiento?** → Tabla `LibroAsientosContablesDetalle`

---
*Documento generado automáticamente tras refactorización v5007.5. Cualquier desviación de este documento debe ser justificada en un Commit Message.*
