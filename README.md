# ServerlessREST Assignment - Distributed Systems

__Name:__ Máté Domonics

This repository contains the implementation of a serverless REST API for the AWS platform. A CDK stack creates the infrastructure. The domain context of the API is movie reviews.

## API endpoints

[ Provide a bullet-point list of the app's endpoints (excluding the Auth API endpoints).]
e.g.

+ POST /movies/reviews - add a movie review.
+ GET /movies/{movieId}/reviews - Get all the reviews for a movie with the specified id.
+ GET /movies/{movieId}/reviews?minRating=n - Get all the reviews for the movie with the specified ID with a rating greater than the minRating.
+ GET /movies/{movieId}/reviews/{reviewerName} - Get the review for the movie with the specified movie ID and written by the named reviewer.
+ GET /movies/{movieId}/reviews/{year} - Get the review for the movie with the specified movie ID and with the given year.

[Include screenshots from the AWS console (API Gateway service) that clearly show the deployed API ( have legible font size). ]

![](./images/AuthService%20pic.png)

![](./images/restAPI%20pic.png)

### Authentication

[Include a screenshot from the AWS console (Cognito User Pools) showing a confirmed user account.]

![](./images/User%20confirmed.png)

### Independent learning (If relevant)
