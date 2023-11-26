import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { dsAssignment1Stack } from '../lib/ds-assignment-1-stack';

const app = new cdk.App();
new dsAssignment1Stack(app, 'dsAssignment1Stack', {
  env: {region: "eu-west-1"}
});