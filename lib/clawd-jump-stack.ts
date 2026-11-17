import * as path from 'path';
import * as cdk from 'aws-cdk-lib/core';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

/** KEROPPI JUMP: 비공개 S3 버킷 + CloudFront(OAC)로 frontend/index.html 하나를 서빙한다. */
export class ClawdJumpStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 버킷은 공개하지 않는다. CloudFront OAC만 읽을 수 있다.
    const bucket = new s3.Bucket(this, 'GameBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // 캡스톤 정리 용이
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, 'GameDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
    });

    // 배포 시 업로드 후 캐시 무효화 → 재배포하면 바로 새 버전이 보인다
    new s3deploy.BucketDeployment(this, 'DeployGame', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../frontend'))],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/*'],
    });

    new cdk.CfnOutput(this, 'GameUrl', { value: `https://${distribution.distributionDomainName}` });
  }
}
