// lib/errors.ts
export type AppErrorCode =
    | "MACHINES_TIMEOUT"
    | "MACHINES_NETWORK"
    | "MACHINES_AUTH"
    | "MACHINES_DB"
    | "CONFIG_MISSING"
    | "API_HTTP"
    | "API_AUTH"
    | "API_RESPONSE"
    | "UNKNOWN";

export type AppError = {
    code: AppErrorCode;
    title: string;
    message: string;
    /** Raw details for expandable "Vis detaljer" */
    details?: Record<string, any>;
};

export function isAppError(e: unknown): e is AppError {
    return !!e && typeof e === "object" && "code" in e && "message" in e;
}

function applyOverrides(base: AppError, overrides?: Partial<AppError>): AppError {
    if (!overrides) return base;
    return {
        ...base,
        ...overrides,
        title: overrides.title ?? base.title,
        message: overrides.message ?? base.message,
        code: (overrides.code as AppErrorCode | undefined) ?? base.code,
        details: overrides.details ?? base.details,
    };
}

/** Turn any thrown value into a user-friendly AppError */
export function normalizeError(e: unknown, overrides?: Partial<AppError>): AppError {
    if (isAppError(e)) {
        return applyOverrides(e, overrides);
    }

    // Try to pick common Node / pg fields
    const any = e as any;
    const code = (any?.code as string) || "";
    const status = Number(any?.status || any?.statusCode || 0);
    const name = any?.name as string | undefined;
    const messageFromError = typeof any?.message === "string" ? any.message : undefined;

    // Timeout / connect issues (like ETIMEDOUT screenshot)
    if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT") {
        return applyOverrides({
            code: "MACHINES_TIMEOUT",
            title: "Tidsavbrudd mot databasen",
            message:
                "Det tok for lang tid a koble til databasen. Dette kan skje ved ustabilt nett eller midlertidig drift hos Azure.",
            details: { code, errno: any?.errno, syscall: any?.syscall, address: any?.address, port: any?.port, digest: any?.digest },
        }, overrides);
    }

    // DNS / network
    if (code === "ENOTFOUND" || code === "ECONNRESET" || code === "EAI_AGAIN") {
        return applyOverrides({
            code: "MACHINES_NETWORK",
            title: "Nettverksfeil",
            message:
                "Klarte ikke a na tjenesten. Sjekk nettverket ditt og prøv igjen.",
            details: { code, errno: any?.errno, syscall: any?.syscall, address: any?.address, port: any?.port },
        }, overrides);
    }

    // Auth/session problems
    if (status === 401 || status === 403 || name === "AuthError") {
        return applyOverrides({
            code: "MACHINES_AUTH",
            title: "Mangler tilgang",
            message:
                "Okten din er utlopt eller mangler rettigheter. Logg inn pa nytt for a fortsette.",
            details: { status, name, code },
        }, overrides);
    }

    // PostgreSQL / query errors
    if (name === "DatabaseError" || code?.startsWith("P") /* pg */) {
        return applyOverrides({
            code: "MACHINES_DB",
            title: "Databasefeil",
            message:
                "En databasefeil oppstod under henting av maskindata. Prøv igjen, og kontakt oss hvis feilen vedvarer.",
            details: { name, code, detail: any?.detail, where: any?.where },
        }, overrides);
    }

    // Fallback
    return applyOverrides({
        code: "UNKNOWN",
        title: "Uventet feil",
        message:
            messageFromError && messageFromError.trim().length > 0
                ? messageFromError
                : "Noe gikk galt under lasting av data. Prov pa nytt. Dersom feilen vedvarer, kontakt support.",
        details: { name, code, status, message: any?.message, stack: any?.stack },
    }, overrides);
}
