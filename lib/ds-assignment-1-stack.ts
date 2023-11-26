import * as cdk from 'aws-cdk-lib';
import * as lambdanode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as custom from "aws-cdk-lib/custom-resources";
import { generateBatch } from '../shared/util';
import { reviews } from '../seed/reviewsSeed';
import { Construct } from 'constructs';
import * as apig from "aws-cdk-lib/aws-apigateway";

export class dsAssignment1Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Stack
    const reviewsTable = new dynamodb.Table(this, "reviewsTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "movieId", type: dynamodb.AttributeType.NUMBER },
      sortKey: { name: "reviewDate", type: dynamodb.AttributeType.STRING }, //Sort key used to allow us to have multiple reviews for one movieId.
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "MovieReviews",
    });

    // Create seed for Table
    new custom.AwsCustomResource(this, "reviewsddbInitData", {
      onCreate: {
        service: "DynamoDB",
        action: "batchWriteItem",
        parameters: {
          RequestItems: {
            [reviewsTable.tableName]: generateBatch(reviews)
          },
        },
        physicalResourceId: custom.PhysicalResourceId.of("reviewsddbInitData"),
      },
      policy: custom.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [reviewsTable.tableArn]
      }),
    });

    //Get all reviews for the movie that matched the inputted ID.
    const getMovieReviews = new lambdanode.NodejsFunction(
      this,
      "getMovieReviewsFn",
      {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_16_X,
        entry: `${__dirname}/../lambda/getMovieReviews.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: reviewsTable.tableName,
          REGION: 'eu-west-1',
        },
      }
    )

    //Create a new review for a movie
    const createReview = new lambdanode.NodejsFunction(
      this,
      "AddReviewFn", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_16_X,
      entry: `${__dirname}/../lambda/addMovieReview.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: reviewsTable.tableName,
        REGION: "eu-west-1",
      },
    });

    //Get review based on author's name
    const getMovieReviewByAuthor = new lambdanode.NodejsFunction(
      this,
      "GetMovieReviewByAuthor", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_16_X,
      entry: `${__dirname}/../lambda/getMovieReviewByAuthor.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: reviewsTable.tableName,
        REGION: "eu-west-1",
      },
    });

    //All table permissions
    reviewsTable.grantReadData(getMovieReviews)
    reviewsTable.grantReadWriteData(createReview)
    reviewsTable.grantReadData(getMovieReviewByAuthor)

    // REST API 
    const api = new apig.RestApi(this, "RestAPI", {
      description: "demo api",
      deployOptions: {
        stageName: "dev",
      },
      //Enabling CORS
      defaultCorsPreflightOptions: {
        allowHeaders: ["Content-Type", "X-Amz-Date"],
        allowMethods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
        allowCredentials: true,
        allowOrigins: ["*"],
      },
    });

    //API Endpoint creation
    const moviesEndpoint = api.root.addResource("movies");

    const movieIDEndpoint = moviesEndpoint.addResource("{movieId}");

    const reviewsEndpoint = moviesEndpoint.addResource("reviews");
    reviewsEndpoint.addMethod(
      "POST",
      new apig.LambdaIntegration(createReview, { proxy: true })
    )

    const movieReviewsEndpoint = movieIDEndpoint.addResource("reviews");
    movieReviewsEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getMovieReviews, { proxy: true })
    )

    const movieReviewByAuthorEndpoint = movieReviewsEndpoint.addResource("{reviewerName}");
    movieReviewByAuthorEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getMovieReviewByAuthor, {proxy: true})
    )
  }
}