import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { ClawdJumpStack } from '../lib/clawd-jump-stack';

const template = Template.fromStack(new ClawdJumpStack(new cdk.App(), 'TestStack'));

test('bucket is private and SSL-only', () => {
  template.hasResourceProperties('AWS::S3::Bucket', {
    PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
  });
  template.hasResourceProperties('AWS::S3::BucketPolicy', {
    PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({ Effect: 'Deny', Condition: { Bool: { 'aws:SecureTransport': 'false' } } })]) },
  });
});

test('CloudFront serves index.html over HTTPS via OAC', () => {
  template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({
      DefaultRootObject: 'index.html',
      DefaultCacheBehavior: Match.objectLike({ ViewerProtocolPolicy: 'redirect-to-https' }),
    }),
  });
});

test('frontend is deployed with cache invalidation and URL is output', () => {
  template.hasResourceProperties('Custom::CDKBucketDeployment', { DistributionPaths: ['/*'] });
  template.hasOutput('GameUrl', {});
});
