import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommandInput, QueryCommand } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
    try {
        console.log("Event: ", event);
        const parameters = event?.queryStringParameters;
        const movieId = event?.pathParameters?.movieId ? parseInt(event.pathParameters.movieId) : undefined;

        const minRatingParameter = event?.queryStringParameters?.minRating;
        const minRating = minRatingParameter ? parseInt(minRatingParameter) : undefined;

        if (!movieId) {
            return {
                statusCode: 404,
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({ Message: "Missing movie Id" }),
            };
        }

        //Create the base of the input
        let commandInput: QueryCommandInput = { //Query command is used to return a group of items rather than just one.
            TableName: process.env.TABLE_NAME
        }

        // If minRating is present, then feed in the Filter Expression that checks for ratings higher than the number, along with the movieId.
        if (minRating) {
            commandInput = {
                ...commandInput,
                FilterExpression: "rating >= :r",               //I found out about filter expressions from this AWS docs page:
                KeyConditionExpression: "movieId = :m",         //https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_Query.html
                ExpressionAttributeValues: {
                    ":r": minRating,
                    ":m": movieId
                },
            }
        //If it's not present, only look for the movieId.
        } else {
            commandInput = {
                ...commandInput,
                KeyConditionExpression: "movieId = :m",
                ExpressionAttributeValues:
                    { ":m": movieId },
            }
        }

        //Feed the commandInput into the query.
        const commandOutput = await ddbDocClient.send(
            new QueryCommand(commandInput)
        )

        const body = {
            data: commandOutput.Items,
        };

        // Return Response
        return {
            statusCode: 200,
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify(body),
        };
    } catch (error: any) {
        console.log(JSON.stringify(error));
        return {
            statusCode: 500,
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({ error }),
        };
    }
};

function createDDbDocClient() {
    const ddbClient = new DynamoDBClient({ region: process.env.REGION });
    const marshallOptions = {
        convertEmptyValues: true,
        removeUndefinedValues: true,
        convertClassInstanceToMap: true,
    };
    const unmarshallOptions = {
        wrapNumbers: false,
    };
    const translateConfig = { marshallOptions, unmarshallOptions };
    return DynamoDBDocumentClient.from(ddbClient, translateConfig);
}
