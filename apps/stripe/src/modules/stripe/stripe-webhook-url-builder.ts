import { err, ok } from "neverthrow";

import { WebhookParams } from "@/app/api/webhooks/stripe/webhook-params";
import { BaseError } from "@/lib/errors";

/**
 * Builds URL which Stripe will reach
 *
 * Consider merging with WebhookParams, maybe it can be single class like StripeWebhookUrl
 */
export class StripeWebhookUrlBuilder {
  buildUrl({ appUrl, webhookParams }: { appUrl: string; webhookParams: WebhookParams }) {
    try {
      const encodedSaleorApiUrl = encodeURIComponent(webhookParams.saleorApiUrl);
      const webhookUrl = new URL(
        appUrl +
          `/api/webhooks/stripe/${encodedSaleorApiUrl}/${webhookParams.configurationId}/${webhookParams.appId}`,
      );

      return ok(webhookUrl.toString());
    } catch (e) {
      return err(
        new BaseError("Cant build URL", {
          cause: e,
        }),
      );
    }
  }
}
