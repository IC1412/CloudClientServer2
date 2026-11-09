import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
    DynamoDBDocumentClient,
    PutCommand,
    ScanCommand
} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const db = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME;

const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

function response(statusCode, body) {
    return {
        statusCode,
        headers,
        body: JSON.stringify(body)
    };
}

// Sanitize and validate user input
function sanitizeInput(value) {
    if (typeof value !== "string") {
        return null;
    }

    const cleaned = value
        .trim()
        .replace(/[\u0000-\u001F\u007F]/g, "");

    if (cleaned.length === 0 || cleaned.length > 500) {
        return null;
    }

    return cleaned;
}

export const handler = async (event) => {
    try {
        if (event.requestContext?.http?.method === "OPTIONS") {
            return response(200, { message: "CORS check successful." });
        }

        if (!TABLE_NAME) {
            return response(500, {
                message: "Database configuration is missing."
            });
        }

        const method = event.requestContext?.http?.method;
        const path = event.rawPath;

        // Retrieve saved messages
        if (method === "POST" && path === "/api/data") {
            const result = await db.send(
                new ScanCommand({
                    TableName: TABLE_NAME,
                    Limit: 50
                })
            );

            const messages = (result.Items || [])
                .sort((a, b) =>
                    b.createdAt.localeCompare(a.createdAt)
                );

            return response(200, {
                message: "Data retrieved successfully.",
                data: messages
            });
        }

        // Save a new message
        if (method === "POST" && path === "/api/message") {
            let body;

            try {
                body = JSON.parse(event.body || "{}");
            } catch {
                return response(400, {
                    message: "Invalid JSON request."
                });
            }

            const message = sanitizeInput(body.data);

            if (!message) {
                return response(400, {
                    message: "Enter a valid message of 1–500 characters."
                });
            }

            const item = {
                messageId: randomUUID(),
                data: message,
                createdAt: new Date().toISOString()
            };

            await db.send(
                new PutCommand({
                    TableName: TABLE_NAME,
                    Item: item
                })
            );

            return response(201, {
                message: "Your message was saved successfully.",
                receivedData: item.data
            });
        }

        return response(404, {
            message: "Endpoint not found."
        });

    } catch (error) {
        console.error("Backend error:", error);

        return response(500, {
            message: "An internal server error occurred."
        });
    }
};