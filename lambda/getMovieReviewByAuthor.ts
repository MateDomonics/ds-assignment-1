import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, QueryCommandInput } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {

try {
    console.log("Event: ", event);
    const movieId = event?.pathParameters?.movieId ? parseInt(event?.pathParameters?.movieId) : undefined;
    const reviewerOrYearParam = event?.pathParameters?.reviewerName ? event.pathParameters.reviewerName: undefined;
    console.log("reviewerOrYearParam", reviewerOrYearParam)

    let isInputYear = false //Using a boolean value to check if regex succeeds.
    const yrRegex = new RegExp(/^\d{4}$/) //Check if the first four characters are numbers

    if (!movieId || !reviewerOrYearParam) {
        return {
            statusCode: 404,
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({ Message: "Missing movie Id or reviewer name" }),
        };
    }

    //Check if the parameter inputted passes the regex or not.
    //https://stackoverflow.com/questions/16648679/regexp-in-typescript
    if (yrRegex.test(reviewerOrYearParam)) {
        isInputYear = true
    }

    console.log("isInputYear", isInputYear)
    //As done previously, create the base of the input.
    let commandInput: QueryCommandInput = {
        TableName: process.env.TABLE_NAME,
    }

    console.log("commanInputBefore", commandInput)
    //If the regex is passed, then we know a year was inputted, so return the movie review that has the year inputted.
    if (isInputYear) {
        commandInput = {
            ...commandInput,
            KeyConditionExpression: "movieId = :m AND begins_with(reviewDate, :yr)", //https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.KeyConditionExpressions.html
            ExpressionAttributeValues: {
                ":m": movieId,
                ":yr": reviewerOrYearParam
            },
        }
    //Otherwise, just return the movie review that matches the reviewer name.
    } else {
        commandInput = {
            ...commandInput,
            KeyConditionExpression: "movieId = :m",
            FilterExpression: "reviewerName = :revN",
            ExpressionAttributeValues: {
                ":m": movieId,
                ":revN": reviewerOrYearParam
            }
        }
    }

    console.log("commandInputAfter", commandInput)
    //Feed the command input into the query.
    const commandOutput = await ddbDocClient.send(
        new QueryCommand(commandInput)
    )
    
    console.log("commandOutput", commandOutput)
    const body = {
        data: commandOutput.Items
    }

    console.log("body", body)
    return {
        statusCode: 200,
        headers: {
            "content-type": "application/json"
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
        body: JSON.stringify({ error: error.message || 'Internal Server Error' }),
    };
}

}
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