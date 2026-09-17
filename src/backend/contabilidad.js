/*
=============================================================================
MODULE: backend/contabilidad.js
VERSION: v5007.4-FINAL
BASE: BIBLIA v5002.5 Bloque 12 + DOSSIER CAJA Flujos 11-17
RESPONSIBILITY: Proyeccion contable de movimientos de caja, partida doble,
libro mayor y conciliacion contable.
STANDARDS: G10 ASCII Strict.
CORRECTIONS:
[CONT-01] hashOrigen conservado en la construccion del asiento.
[CONT-02] Funciones criptograficas asincronas correctamente esperadas.
[CONT-03] _asAccountingLine convertida en async.
[CONT-04] Validacion de mapa contable y equilibrio reforzada.
[CONT-05] Idempotencia de lineas y asientos.
=============================================================================
*/

import wixData from "wix-data";
import { getSecret } from "wix-secrets-backend";

import {
    COLLECTIONS,
    SDK_CONFIG,
    TIPO_MOVIMIENTO,
} from "backend/internalConfig";

import { SECRETS } from "backend/mmSecrets";

import {
    hmacSha256Hex,
    hashChain,
} from "backend/securityEngine";

import {
    _roundMoney,
    _cleanText,
    _safeTrim,
    makeTraceId,
} from "public/mmUtils";

import { logger } from "backend/logger";

const log = logger;

const MONEY_EPSILON = 0.005;
const TIME_ZONE = SDK_CONFIG?.TZ || "Europe/Madrid";
const SCHEMA_VERSION = "ASIENTO_V1";
const INTEGRITY_ALGORITHM_VERSION = "HMAC_SHA256_V1";

// =============================================================================
// HELPERS
// =============================================================================

function _normalizeDate(value) {
    const date =
        value instanceof Date ? value : new Date(value || Date.now());

    return Number.isNaN(date.getTime()) ? new Date() : date;
}

function _toFiscalKeys(date) {
    const localDate = date.toLocaleDateString("sv-SE", {
        timeZone: TIME_ZONE,
    });

    return {
        diaKey: localDate.slice(0, 10),
        fiscalYear: Number(localDate.slice(0, 4)),
        fiscalPeriod: localDate.slice(0, 7),
    };
}

function _safeAmount(value) {
    const amount = Number(value);

    return Number.isFinite(amount) ? amount : 0;
}

function _getSourceHash(movimiento) {
    return (
        _safeTrim(
            movimiento?.hashCadena ||
            movimiento?.currentRecordHash ||
            movimiento?.sourceHash
        ) || ""
    );
}

function _linePayload(line) {
    return [
        line.journalEntryId,
        line.lineNumber,
        line.accountCode,
        line.debitAmount,
        line.creditAmount,
        line.taxableAmount,
        line.taxRate,
        line.taxAmount,
        line.traceId,
    ].join("|");
}

// =============================================================================
// LINEAS CONTABLES
// =============================================================================

async function _asAccountingLine(
    base,
    number,
    accountCode,
    accountName,
    debit,
    credit,
    tax = null
) {
    const line = {
        _id: `${base.journalEntryId}_L${String(number).padStart(3, "0")}`,
        journalEntryId: base.journalEntryId,
        lineNumber: number,
        operationDate: base.operationDate,
        accountCode: _cleanText(accountCode, 40),
        accountName: _cleanText(accountName, 120),
        accountGroup: "",
        debitAmount: _roundMoney(debit),
        creditAmount: _roundMoney(credit),
        netAmount: _roundMoney(_safeAmount(debit) - _safeAmount(credit)),
        operationCategory: base.operationCategory,
        costCenterId: base.costCenterId || null,
        operationalResponsibleId: base.operationalResponsibleId || null,
        productServiceCode: null,
        lineDescription: base.description,
        taxableAmount: tax?.taxableAmount ?? null,
        taxRate: tax?.taxRate ?? null,
        taxAmount: tax?.taxAmount ?? null,
        vatOperationKey: null,
        counterpartNif: null,
        counterpartName: null,
        externalReference: base.externalReference || null,
        traceId: base.traceId,
        registeredAt: base.registeredAt,
    };

    if (!line.accountCode || !line.accountName) {
        throw new Error("ACCOUNTING_PROJECTION_INVALID_ACCOUNT");
    }

    line.lineHash = await hashChain(
        base.hashOrigen,
        _linePayload(line)
    );

    return line;
}

// =============================================================================
// MAPA DE CUENTAS
// =============================================================================

function _isApprovedMap(map) {
    return Boolean(
        map?.activa &&
        map?.validadaPorGestoria &&
        _cleanText(map?.codigoCuentaDebePredeterminada, 40) &&
        _cleanText(map?.nombreCuentaDebePredeterminada, 120) &&
        _cleanText(map?.codigoCuentaHaberPredeterminada, 40) &&
        _cleanText(map?.nombreCuentaHaberPredeterminada, 120)
    );
}

async function _findAccountMap(movementType) {
    const result = await wixData
        .query(// COLLECTIONS.PLAN_CUENTAS_CONTABLES - ELIMINADA: no existe en SSOT)
        .eq(
            "categoriaOperacion",
            String(movementType || "").toUpperCase()
        )
        .eq("activa", true)
        .limit(1)
        .find({ suppressAuth: true });

    return result?.items?.[0] || null;
}

// =============================================================================
// IDEMPOTENCIA
// =============================================================================

async function _getExisting(journalEntryId) {
    return wixData
        .get(
            COLLECTIONS.ASIENTOS_CONTABLES,
            journalEntryId, {
                suppressAuth: true,
                consistentRead: true,
            }
        )
        .catch(() => null);
}

async function _insertLineIfMissing(line) {
    const existing = await wixData
        .get(
            COLLECTIONS.LIBRO_ASIENTOS_CONTABLES_DETALLE,
            line._id, {
                suppressAuth: true,
                consistentRead: true,
            }
        )
        .catch(() => null);

    if (existing) {
        return {
            idempotent: true,
            item: existing,
        };
    }

    const inserted = await wixData.insert(
        COLLECTIONS.LIBRO_ASIENTOS_CONTABLES_DETALLE,
        line, { suppressAuth: true }
    );

    return {
        idempotent: false,
        item: inserted,
    };
}

// =============================================================================
// BASE DEL ASIENTO
// =============================================================================

function _buildBase(movimiento) {
    const operationDate = _normalizeDate(
        movimiento?.registeredAt || movimiento?.operationDate
    );

    const fiscalKeys = _toFiscalKeys(operationDate);
    const sourceId = _cleanText(movimiento?._id, 120);
    const movementType = String(
        movimiento?.movementType ||
        movimiento?.tipoMovimiento ||
        "AJUSTE"
    ).toUpperCase();

    const hashOrigen = _getSourceHash(movimiento);

    return {
        journalEntryId: `ASIENTO_${sourceId}`,
        sequenceNumber: Number(movimiento?.sequenceNumber) || 0,
        fiscalYear: fiscalKeys.fiscalYear,
        fiscalPeriod: fiscalKeys.fiscalPeriod,
        operationDate,
        registeredAt: new Date(),
        timezone: TIME_ZONE,
        entryType: movementType,
        operationCategory: movementType,
        operationSubcategory: null,
        description: _cleanText(
            movimiento?.description ||
            movimiento?.concepto ||
            movementType,
            500
        ),
        recordSource: _cleanText(
            movimiento?.recordSource ||
            movimiento?.origen ||
            "MOVIMIENTO_CAJA",
            80
        ),
        sourceId,
        transactionId: _cleanText(
            movimiento?.transactionId,
            120
        ),
        wixOrderId: _cleanText(movimiento?.orderId, 120) || null,
        wixRefundId: _cleanText(movimiento?.refundId, 120) || null,
        wixBookingId: _cleanText(
            movimiento?.reservaIdVinculada ||
            movimiento?.reservationIdLinked,
            120
        ) || null,
        externalReference: _cleanText(
            movimiento?.invoiceNumber ||
            movimiento?.numTicketFactura,
            120
        ) || null,
        invoiceSeries: null,
        invoiceNumber: _cleanText(
            movimiento?.invoiceNumber ||
            movimiento?.numTicketFactura,
            120
        ) || null,
        invoiceIssueDate: operationDate,
        fiscalOperationDate: operationDate,
        invoiceType: null,
        rectifiedEntryId: null,
        rectificationReason: null,
        currency: _cleanText(
            movimiento?.currency || "EUR",
            3
        ),
        totalDocumentAmount: _roundMoney(
            Math.abs(
                _safeAmount(
                    movimiento?.accountingAmount ??
                    movimiento?.totalAmount
                )
            )
        ),
        paymentMethod: _cleanText(movimiento?.paymentMethod, 40) || null,
        entryStatus: "CONFIRMADO",
        operationalResponsibleId: _cleanText(movimiento?.resourceId, 120) || null,
        recordingMemberId: "SYSTEM_FISCAL_LEDGER",
        recorderName: "SISTEMA_FISCAL",
        costCenterId: null,
        iaeActivityCode: null,
        schemaVersion: SCHEMA_VERSION,
        integrityAlgorithmVersion: INTEGRITY_ALGORITHM_VERSION,
        previousHash: _safeTrim(
            movimiento?.previousRecordHash ||
            movimiento?.hashCadena
        ) || null,
        sourceHash: hashOrigen,
        hashOrigen,
        traceId: _cleanText(
            movimiento?.traceId || makeTraceId("contabilidad"),
            120
        ),
    };
}

// =============================================================================
// CONSTRUCCION DE LINEAS
// =============================================================================

async function _buildLines(base, movimiento, map) {
    const signedTotal = _safeAmount(
        movimiento?.accountingAmount ??
        movimiento?.totalAmount
    );

    const total = Math.abs(signedTotal);
    const vat = Math.abs(
        _safeAmount(
            movimiento?.taxAmount ??
            movimiento?.cuotaIva
        )
    );

    const taxableFromSource = Math.abs(
        _safeAmount(
            movimiento?.taxableAmount ??
            movimiento?.baseImponible
        )
    );

    const net = _roundMoney(
        taxableFromSource > MONEY_EPSILON ?
        taxableFromSource :
        total - vat
    );

    const taxRateValue = Number(
        movimiento?.taxRate ??
        movimiento?.tasaIva
    );

    const taxRate = Number.isFinite(taxRateValue) ?
        taxRateValue :
        null;

    if (
        total <= MONEY_EPSILON ||
        net < -MONEY_EPSILON ||
        vat > total + MONEY_EPSILON
    ) {
        throw new Error(
            "ACCOUNTING_PROJECTION_INVALID_AMOUNT"
        );
    }

    const tax = {
        taxableAmount: net,
        taxRate,
        taxAmount: vat || null,
    };

    const vatCode = _cleanText(
        map?.codigoCuentaIvaRepercutido,
        40
    );

    const vatName = _cleanText(
        map?.nombreCuentaIvaRepercutido,
        120
    );

    if (vat > MONEY_EPSILON && (!vatCode || !vatName)) {
        throw new Error(
            "ACCOUNTING_PROJECTION_MISSING_VAT_ACCOUNT"
        );
    }

    const lines = [];
    const isRefund = signedTotal < 0;

    if (!isRefund) {
        lines.push(
            await _asAccountingLine(
                base,
                1,
                map.codigoCuentaDebePredeterminada,
                map.nombreCuentaDebePredeterminada,
                total,
                0,
                null
            )
        );

        lines.push(
            await _asAccountingLine(
                base,
                2,
                map.codigoCuentaHaberPredeterminada,
                map.nombreCuentaHaberPredeterminada,
                0,
                net,
                tax
            )
        );

        if (vat > MONEY_EPSILON) {
            lines.push(
                await _asAccountingLine(
                    base,
                    3,
                    vatCode,
                    vatName,
                    0,
                    vat,
                    tax
                )
            );
        }
    } else {
        lines.push(
            await _asAccountingLine(
                base,
                1,
                map.codigoCuentaHaberPredeterminada,
                map.nombreCuentaHaberPredeterminada,
                net,
                0,
                tax
            )
        );

        if (vat > MONEY_EPSILON) {
            lines.push(
                await _asAccountingLine(
                    base,
                    2,
                    vatCode,
                    vatName,
                    vat,
                    0,
                    tax
                )
            );
        }

        lines.push(
            await _asAccountingLine(
                base,
                vat > MONEY_EPSILON ? 3 : 2,
                map.codigoCuentaDebePredeterminada,
                map.nombreCuentaDebePredeterminada,
                0,
                total,
                null
            )
        );
    }

    const totalDebe = _roundMoney(
        lines.reduce(
            (sum, line) => sum + Number(line.debitAmount || 0),
            0
        )
    );

    const totalHaber = _roundMoney(
        lines.reduce(
            (sum, line) => sum + Number(line.creditAmount || 0),
            0
        )
    );

    if (Math.abs(totalDebe - totalHaber) > MONEY_EPSILON) {
        throw new Error(
            "ACCOUNTING_PROJECTION_UNBALANCED"
        );
    }

    return {
        lines,
        totalDebe,
        totalHaber,
    };
}

// =============================================================================
// PROYECCION PRINCIPAL
// =============================================================================

export async function projectLedgerMovementToAccounting(
    movimiento
) {
    const traceId = makeTraceId("contabilidad");

    try {
        const sourceId = _cleanText(movimiento?._id, 120);
        const sourceHash = _getSourceHash(movimiento);
        const transactionId = _cleanText(
            movimiento?.transactionId,
            120
        );

        if (!sourceId || !sourceHash || !transactionId) {
            return {
                status: "SKIPPED",
                reason: "INVALID_SOURCE_LEDGER",
            };
        }

        if (
            movimiento?.movementType === TIPO_MOVIMIENTO.PROPINA ||
            movimiento?.taxTreatment ===
            "PROPINA_PENDIENTE_GESTORIA"
        ) {
            return {
                status: "SKIPPED",
                reason: "TIP_TREATMENT_PENDING_PROFESSIONAL_REVIEW",
            };
        }

        if (SDK_CONFIG?.ACCOUNTING?.ENABLED !== true) {
            return {
                status: "SKIPPED",
                reason: "ACCOUNTING_DISABLED",
            };
        }

        const base = _buildBase(movimiento);
        const existing = await _getExisting(
            base.journalEntryId
        );

        if (existing) {
            return {
                status: "SUCCESS",
                idempotent: true,
                idAsiento: base.journalEntryId,
            };
        }

        const map = await _findAccountMap(
            base.operationCategory
        );

        if (!_isApprovedMap(map)) {
            return {
                status: "SKIPPED",
                reason: "NO_APPROVED_ACCOUNT_MAP",
            };
        }

        const projected = await _buildLines(
            base,
            movimiento,
            map
        );

        const fiscalKey = await getSecret(
            SECRETS.FISCAL_KEY
        );

        if (!fiscalKey) {
            throw new Error(
                "ACCOUNTING_PROJECTION_SIGNING_KEY_MISSING"
            );
        }

        const headerPayload = [
            base.journalEntryId,
            base.sequenceNumber,
            base.sourceId,
            base.transactionId,
            projected.totalDebe,
            projected.totalHaber,
            ...projected.lines.map((line) => line.lineHash),
        ].join("|");

        const hashAsiento = await hashChain(
            base.hashOrigen,
            headerPayload
        );

        const firmaAsiento = [
            await hmacSha256Hex(
                fiscalKey,
                headerPayload
            ),
            hashAsiento,
        ].join("|");

        const header = {
            ...base,
            totalDebe: projected.totalDebe,
            totalHaber: projected.totalHaber,
            hashAsiento,
            firmaAsiento,
        };

        for (const line of projected.lines) {
            await _insertLineIfMissing(line);
        }

        const savedHeader = await wixData.insert(
            COLLECTIONS.ASIENTOS_CONTABLES,
            header, { suppressAuth: true }
        );

        return {
            status: "SUCCESS",
            idempotent: false,
            idAsiento: savedHeader?._id || base.journalEntryId,
            lineCount: projected.lines.length,
        };
    } catch (error) {
        log.error(
            "projectLedgerMovementToAccounting failed", {
                traceId,
                message: error?.message || String(error),
            }
        );

        throw error;
    }
}

// =============================================================================
// CLASIFICACION DE ERRORES
// =============================================================================

export function isAccountingProjectionError(error) {
    return String(
        error?.message || error || ""
    ).startsWith("ACCOUNTING_PROJECTION_");
}