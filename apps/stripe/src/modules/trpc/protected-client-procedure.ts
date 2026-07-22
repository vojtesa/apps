import { verifyJWT } from "@saleor/app-sdk/auth";
import { ObservabilityAttributes } from "@saleor/apps-otel/src/observability-attributes";
import { setSentrySaleorUser } from "@saleor/sentry-utils";
import { setTag } from "@sentry/nextjs";
import { TRPCError } from "@trpc/server";

import { createInstrumentedGraphqlClient } from "@/lib/graphql-client";
import { createLogger } from "@/lib/logger";
import { saleorApp } from "@/lib/saleor-app";

import { middleware, procedure } from "./trpc-server";

const logger = createLogger("protectedClientProcedure");

const attachAppToken = middleware(async ({ ctx, next }) => {
  if (!ctx.saleorApiUrl) {
    logger.debug("ctx.saleorApiUrl not found, throwing");

    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Missing saleorApiUrl in request",
    });
  }

  const authData = await saleorApp.apl.get(ctx.saleorApiUrl);

  if (!authData) {
    logger.debug("authData not found, throwing 401");

    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Missing auth data",
    });
  }

  setSentrySaleorUser(authData.saleorApiUrl);

  return next({
    ctx: {
      appToken: authData.token,
      saleorApiUrl: authData.saleorApiUrl,
      appId: authData.appId,
    },
  });
});

const attachSharedServices = middleware(async ({ ctx, next }) => {
  const gqlClient = createInstrumentedGraphqlClient({
    saleorApiUrl: ctx.saleorApiUrl!, // Will be defined, previous middleware will ensure it
    token: ctx.token,
  });

  return next({
    ctx: {
      apiClient: gqlClient,
    },
  });
});

const validateClientToken = middleware(async ({ ctx, next, meta }) => {
  logger.debug("Calling validateClientToken middleware with permissions required", {
    permissions: meta?.requiredClientPermissions,
  });

  // Skip JWT verification if dashboard token is missing (Dashboard ↔ app protocol incompatibility)
  if (!ctx.token || !ctx.appId) {
    logger.debug("Skipping JWT verification - missing token or appId");
    return next({
      ctx: {
        saleorApiUrl: ctx.saleorApiUrl,
      },
    });
  }

  if (!ctx.saleorApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "Missing saleorApiUrl in request. This middleware can be used after auth is attached",
    });
  }

  setTag(ObservabilityAttributes.SALEOR_API_URL, ctx.saleorApiUrl);

  try {
    logger.debug("trying to verify JWT token from frontend", {
      token: ctx.token ? `${ctx.token[0]}...` : undefined,
    });

    await verifyJWT({
      appId: ctx.appId,
      token: ctx.token,
      saleorApiUrl: ctx.saleorApiUrl,
      requiredPermissions: meta?.requiredClientPermissions,
    });
  } catch (e) {
    logger.warn("JWT verification failed, throwing", { error: e });
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "JWT verification failed",
    });
  }

  return next({
    ctx: {
      saleorApiUrl: ctx.saleorApiUrl,
    },
  });
});

/**
 * Construct common graphQL client and attach it to the context
 *
 * Can be used only if called from the frontend (react-query),
 * otherwise jwks validation will fail (if createCaller used)
 *
 * TODO: Rethink middleware composition to enable safe server-side router calls
 */
export const protectedClientProcedure = procedure
  .use(attachAppToken)
  .use(validateClientToken)
  .use(attachSharedServices);
