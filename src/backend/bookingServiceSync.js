/*
=============================================================================
MODULE: backend/bookingServiceSync.js
VERSION: v5007.4-FINAL
BASE: BIBLIA v5002.5 Bloque 12.12 + DIRECTRICES V19
RESPONSIBILITY: Cola de sincronizacion entre ServiciosCatalogo y Wix Bookings.
STANDARDS: G10 ASCII Strict.
=============================================================================
*/

import wixData from "wix-data";

import {
    COLLECTIONS,
    SDK_CONFIG,
} from "backend/internalConfig";

import {
    makeTraceId,
    _safeTrim,
    _looksLikeGuid,
} from "public/mmUtils";

import { logger } from "backend/logger";

const log = logger;

const QUEUE_COL =
    COLLECTIONS.BOOKINGS_SERVICE_SYNC_QUEUE;

const MAX_ATTEMPTS =
    Number(
        SDK_CONFIG?.JOBS?.BOOKINGS_SERVICE_SYNC_MAX_ATTEMPTS
    ) || 5;

const BATCH_SIZE =
    Number(
        SDK_CONFIG?.JOBS?.BOOKINGS_SERVICE_SYNC_BATCH_SIZE
    ) || 20;

const BACKOFF_MS =
    Number(
        SDK_CONFIG?.JOBS?.BOOKINGS_SERVICE_SYNC_BACKOFF_MS
    ) || 300000;

const MAX_BATCH_SIZE = 100;
const PROCESSING_TIMEOUT_MS = 15 * 60 * 1000;

// =============================================================================
// BLOQUE 1 - VALIDACION
// =============================================================================

function _cleanGuid(value, errorCode) {
    const clean = _safeTrim(value);

    if (!clean || !_looksLikeGuid(clean)) {
        throw new Error(`${errorCode}: GUID invalido o ausente`);
    }

    return clean;
}

function _cleanGuidList(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return Array.from(
        new Set(
            value
            .map((item) => _safeTrim(item))
            .filter((item) => _looksLikeGuid(item))
        )
    );
}

function _numberOrZero(value) {
    const number = Number(value);

    return Number.isFinite(number) && number >= 0 ?
        number :
        0;
}

function _booleanValue(...values) {
    return values.some((value) => value === true);
}

function _normalizeStatus(value) {
    return _safeTrim(value).toUpperCase();
}

// =============================================================================
// BLOQUE 2 - PROYECCION DESEADA
// =============================================================================

function _buildDesiredProjection(item = {}) {
    const serviceId = _cleanGuid(
        item.serviceId || item._id,
        "INVALID_SERVICE_ID"
    );

    const linkedPhases = _safeTrim(
        item.linkedPhases || item.linkedServiceId
    );

    if (
        linkedPhases &&
        !_looksLikeGuid(linkedPhases)
    ) {
        throw new Error(
            "INVALID_LINKED_PHASE_SERVICE_ID: GUID invalido"
        );
    }

    return {
        serviceId,
        title: _safeTrim(
            item.title || item.tituloServicio
        ),
        tagLine: _safeTrim(
            item.tagLine || item.etiquetaServicio
        ),
        description: _safeTrim(
            item.description || item.descripcionServicio
        ),
        price: _numberOrZero(
            item.price ?? item.precioServicio
        ),
        currency: _safeTrim(
            item.currency || item.moneda
        ) || "EUR",
        totalDuration: _numberOrZero(
            item.totalDuration
        ),
        phase1Duration: _numberOrZero(
            item.phase1Duration
        ),
        exposureDuration: _numberOrZero(
            item.exposureDuration
        ),
        phase2Duration: _numberOrZero(
            item.phase2Duration
        ),
        buffer: _numberOrZero(item.buffer),
        hidden: _booleanValue(
            item.hidden,
            item.servicioOculto
        ),
        onlinePayment: _booleanValue(
            item.onlinePayment,
            item.onlinePago
        ),
        inPersonPayment: _booleanValue(
            item.inPersonPayment,
            item.presencialPago
        ),
        categoryId: _safeTrim(
            item.categoryId?._id ||
            item.categoryId
        ),
        availableStaff: _cleanGuidList(
            item.availableStaff
        ),
        linkedPhases: linkedPhases || null,
        allowCombine: _booleanValue(
            item.allowCombine,
            item.permitirCombinar
        ),
    };
}

// =============================================================================
// BLOQUE 3 - COLA
// =============================================================================

function _buildQueueId(serviceId, payloadHash) {
    const servicePart = _safeTrim(serviceId);
    const hashPart = _safeTrim(payloadHash);

    return `sync_${servicePart}_${hashPart}_${Date.now()}`.slice(
        0,
        190
    );
}

async function _findPendingEquivalent(
    serviceId,
    payloadHash
) {
    const result = await wixData
        .query(QUEUE_COL)
        .eq("serviceId", serviceId)
        .eq("payloadHash", payloadHash)
        .hasSome("status", [
            "PENDING",
            "PROCESSING",
        ])
        .limit(1)
        .find({ suppressAuth: true });

    return result?.items?.[0] || null;
}

export async function enqueueBookingsServiceSync(
    serviceItem
) {
    const traceId = makeTraceId("svc-sync");

    try {
        const desiredPayload =
            _buildDesiredProjection(serviceItem);

        const payloadHash = _safeTrim(
            serviceItem?.payloadHash ||
            serviceItem?._updatedDate ||
            serviceItem?._id ||
            desiredPayload.serviceId
        );

        if (!payloadHash) {
            throw new Error(
                "INVALID_SYNC_PAYLOAD_HASH"
            );
        }

        const existing = await _findPendingEquivalent(
            desiredPayload.serviceId,
            payloadHash
        );

        if (existing) {
            return {
                status: "SUCCESS",
                data: {
                    queueId: existing._id,
                    deduplicated: true,
                },
                error: null,
            };
        }

        const queueId = _buildQueueId(
            desiredPayload.serviceId,
            payloadHash
        );

        const now = new Date();

        const item = await wixData.insert(
            QUEUE_COL, {
                _id: queueId,
                serviceId: desiredPayload.serviceId,
                desiredPayload,
                payloadHash,
                status: "PENDING",
                attempts: 0,
                nextAttemptAt: now,
                completedAt: null,
                failedAt: null,
                errorCode: null,
                errorMessage: null,
                processingStartedAt: null,
                traceId,
                _createdDate: now,
                _updatedDate: now,
            }, { suppressAuth: true }
        );

        log.info("Service sync enqueued", {
            serviceId: desiredPayload.serviceId,
            traceId,
        });

        return {
            status: "SUCCESS",
            data: {
                queueId: item?._id || queueId,
                deduplicated: false,
            },
            error: null,
        };
    } catch (error) {
        log.error("enqueueBookingsServiceSync failed", {
            message: error?.message || String(error),
            traceId,
        });

        return {
            status: "ERROR",
            data: null,
            error: {
                code: "SYNC_ENQUEUE_FAIL",
                message: error?.message || "No se pudo encolar la sincronizacion",
            },
        };
    }
}

// =============================================================================
// BLOQUE 4 - RECUPERACION DE ITEMS ATASCADOS
// =============================================================================

function _isProcessingExpired(item, now) {
    if (_normalizeStatus(item?.status) !== "PROCESSING") {
        return false;
    }

    const startedAt = item?.processingStartedAt ?
        new Date(item.processingStartedAt) :
        null;

    return (
        startedAt &&
        !Number.isNaN(startedAt.getTime()) &&
        now - startedAt.getTime() > PROCESSING_TIMEOUT_MS
    );
}

async function _recoverStaleProcessingItems(traceId) {
    const now = new Date();

    const result = await wixData
        .query(QUEUE_COL)
        .eq("status", "PROCESSING")
        .lt(
            "processingStartedAt",
            new Date(
                now.getTime() - PROCESSING_TIMEOUT_MS
            )
        )
        .limit(MAX_BATCH_SIZE)
        .find({ suppressAuth: true });

    let recovered = 0;

    for (const item of result?.items || []) {
        item.status = "PENDING";
        item.nextAttemptAt = now;
        item.processingStartedAt = null;
        item.errorCode = "PROCESSING_TIMEOUT";
        item.errorMessage =
            "El proceso anterior expiro y se reintentara.";
        item._updatedDate = now;

        await wixData.update(
            QUEUE_COL,
            item, { suppressAuth: true }
        );

        recovered += 1;
    }

    if (recovered > 0) {
        log.warn("Stale service sync items recovered", {
            recovered,
            traceId,
        });
    }

    return recovered;
}

// =============================================================================
// BLOQUE 5 - SINCRONIZACION NATIVA
// =============================================================================

async function _syncServiceWithBookings(item, traceId) {
    /*
     * Provisional: la llamada nativa no se ejecuta hasta confirmar el contrato
     * exacto de la version instalada de Wix Bookings Services V2.
     */
    if (!item?.serviceId || !item?.desiredPayload) {
        throw new Error("INVALID_SYNC_ITEM");
    }

    throw new Error(
        "BOOKINGS_SERVICE_SYNC_HANDLER_NOT_CONFIGURED"
    );
}

// =============================================================================
// BLOQUE 6 - PROCESAMIENTO
// =============================================================================

export async function processBookingsServiceSyncQueue(
    options = {}
) {
    const traceId =
        _safeTrim(options?.traceId) ||
        makeTraceId("svc-sync-proc");

    const requestedBatchSize = Number(
        options?.batchSize
    );

    const batchSize = Math.max(
        1,
        Math.min(
            Number.isFinite(requestedBatchSize) ?
            requestedBatchSize :
            BATCH_SIZE,
            MAX_BATCH_SIZE
        )
    );

    try {
        const recovered =
            await _recoverStaleProcessingItems(traceId);

        const result = await wixData
            .query(QUEUE_COL)
            .eq("status", "PENDING")
            .le("nextAttemptAt", new Date())
            .lt("attempts", MAX_ATTEMPTS)
            .ascending("nextAttemptAt")
            .limit(batchSize)
            .find({ suppressAuth: true });

        const items = result?.items || [];
        let processed = 0;
        let failed = 0;
        let skipped = 0;

        for (const item of items) {
            const now = new Date();

            try {
                const attempts =
                    Number(item.attempts || 0) + 1;

                item.status = "PROCESSING";
                item.attempts = attempts;
                item.processingStartedAt = now;
                item._updatedDate = now;

                await wixData.update(
                    QUEUE_COL,
                    item, { suppressAuth: true }
                );

                await _syncServiceWithBookings(
                    item,
                    traceId
                );

                item.status = "COMPLETED";
                item.completedAt = new Date();
                item.processingStartedAt = null;
                item.errorCode = null;
                item.errorMessage = null;
                item._updatedDate = new Date();

                await wixData.update(
                    QUEUE_COL,
                    item, { suppressAuth: true }
                );

                processed += 1;
            } catch (error) {
                const attempts =
                    Number(item.attempts || 0);

                const terminal =
                    attempts >= MAX_ATTEMPTS;

                item.status = terminal ?
                    "FAILED" :
                    "PENDING";

                item.failedAt = new Date();
                item.processingStartedAt = null;
                item.errorCode =
                    _safeTrim(error?.code) ||
                    "SYNC_FAIL";
                item.errorMessage =
                    _safeTrim(error?.message) ||
                    "Error de sincronizacion";
                item.nextAttemptAt = new Date(
                    Date.now() +
                    BACKOFF_MS *
                    Math.pow(2, Math.max(0, attempts - 1))
                );
                item._updatedDate = new Date();

                await wixData.update(
                    QUEUE_COL,
                    item, { suppressAuth: true }
                );

                failed += 1;

                log.error("Service sync failed", {
                    serviceId: item.serviceId,
                    attempts,
                    terminal,
                    traceId,
                    message: error?.message || String(error),
                });
            }
        }

        if (!items.length) {
            skipped = 0;
        }

        return {
            status: "SUCCESS",
            data: {
                processed,
                failed,
                skipped,
                recovered,
                total: items.length,
            },
            error: null,
        };
    } catch (error) {
        log.error("processBookingsServiceSyncQueue failed", {
            traceId,
            message: error?.message || String(error),
        });

        return {
            status: "ERROR",
            data: null,
            error: {
                code: "SYNC_PROCESS_FAIL",
                message: error?.message ||
                    "No se pudo procesar la cola de sincronizacion",
            },
        };
    }
}