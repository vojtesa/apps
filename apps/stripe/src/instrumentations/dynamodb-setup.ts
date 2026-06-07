import { CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { createLogger } from "@/lib/logger";
import { createDynamoDBClient } from "@/modules/dynamodb/dynamodb-client";
import { env } from "@/lib/env";

const logger = createLogger("DynamoDBSetup");

export const ensureDynamoTable = async () => {
  const tableName = env.DYNAMODB_MAIN_TABLE_NAME;

  const client = createDynamoDBClient({
    connectionTimeout: env.DYNAMODB_CONNECTION_TIMEOUT_MS,
    requestTimeout: env.DYNAMODB_REQUEST_TIMEOUT_MS,
  });

  try {
    await client.send(
      new CreateTableCommand({
        TableName: tableName,
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        KeySchema: [
          { AttributeName: "PK", KeyType: "HASH" },
          { AttributeName: "SK", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: "PK", AttributeType: "S" },
          { AttributeName: "SK", AttributeType: "S" },
        ],
      }),
    );
    logger.info("Created DynamoDB table", { tableName });
  } catch (e: any) {
    if (e.name === "ResourceInUseException") {
      logger.debug("DynamoDB table already exists", { tableName });
    } else {
      logger.error("Failed to create DynamoDB table", { error: e, tableName });
    }
  } finally {
    client.destroy();
  }
};
