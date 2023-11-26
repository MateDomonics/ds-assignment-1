import * as cdk from 'aws-cdk-lib';
import * as lambdanode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as custom from "aws-cdk-lib/custom-resources";
import { generateBatch } from '../shared/util';
import { reviews } from '../seed/reviewsSeed';
import { Construct } from 'constructs';
import * as apig from "aws-cdk-lib/aws-apigateway";
import { UserPool } from "aws-cdk-lib/aws-cognito";
import * as node from "aws-cdk-lib/aws-lambda-nodejs";

export class dsAssignment1Stack extends cdk.Stack {
  private auth: apig.IResource;
  private userPoolId: string;
  private userPoolClientId: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //=======================
    //AUTHORISATION
    //=======================

    const userPool = new UserPool(this, "Assignment1UserPool", {
      signInAliases: { username: true, email: true },
      selfSignUpEnabled: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.userPoolId = userPool.userPoolId;

    const appClient = userPool.addClient("Assignment1AppClient", {
      authFlows: { userPassword: true },
    });

    this.userPoolClientId = appClient.userPoolClientId;

    const authApi = new apig.RestApi(this, "Assignment1AuthServiceApi", {
      description: "Authentication Service RestApi",
      endpointTypes: [apig.EndpointType.REGIONAL],
      defaultCorsPreflightOptions: {
        allowOrigins: apig.Cors.ALL_ORIGINS,
      },
    });

    this.auth = authApi.root.addResource("auth");

    this.addAuthRoute(
      "signup",
      "POST",
      "SignupFn",
      'signup.ts'
    );

    this.addAuthRoute(
      "confirm_signup",
      "POST",
      "ConfirmFn",
      "confirm-signup.ts"
    );

    this.addAuthRoute('signout',
      'GET',
      'SignoutFn',
      'signout.ts'
    );

    this.addAuthRoute('signin',
      'POST',
      'SigninFn',
      'signin.ts'
    );


    // Table
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

    const appCommonFnProps = {
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: "handler",
      environment: {
        USER_POOL_ID: this.userPoolId,
        CLIENT_ID: this.userPoolClientId,
        TABLE_NAME: reviewsTable.tableName,
        REGION: "eu-west-1",
      },
    };

    const authorizerFn = new node.NodejsFunction(this, "AuthorizerFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../lambda/auth/authorizer.ts`,
    });

    const requestAuthorizer = new apig.RequestAuthorizer(
      this,
      "RequestAuthorizer",
      {
        identitySources: [apig.IdentitySource.header("cookie")],
        handler: authorizerFn,
        resultsCacheTtl: cdk.Duration.minutes(0),
      }
    );

    //API Endpoint creation
    const moviesEndpoint = api.root.addResource("movies");

    const movieIDEndpoint = moviesEndpoint.addResource("{movieId}");

    const reviewsEndpoint = moviesEndpoint.addResource("reviews");
    reviewsEndpoint.addMethod(
      "POST",
      new apig.LambdaIntegration(createReview, { proxy: true }),
      {
        authorizer: requestAuthorizer,
        authorizationType: apig.AuthorizationType.CUSTOM
      }
    )

    const movieReviewsEndpoint = movieIDEndpoint.addResource("reviews");
    movieReviewsEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getMovieReviews, { proxy: true })
    )

    const movieReviewByAuthorEndpoint = movieReviewsEndpoint.addResource("{reviewerName}");
    movieReviewByAuthorEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getMovieReviewByAuthor, { proxy: true })
    )
  }

  private addAuthRoute(
    resourceName: string,
    method: string,
    fnName: string,
    fnEntry: string,
    allowCognitoAccess?: boolean
  ): void {
    const commonFnProps = {
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: "handler",
      environment: {
        USER_POOL_ID: this.userPoolId,
        CLIENT_ID: this.userPoolClientId,
        REGION: cdk.Aws.REGION
      },
    };

    const resource = this.auth.addResource(resourceName);

    const fn = new node.NodejsFunction(this, fnName, {
      ...commonFnProps,
      entry: `${__dirname}/../lambda/auth/${fnEntry}`,
    });

    resource.addMethod(method, new apig.LambdaIntegration(fn));
  }  // end private method
}