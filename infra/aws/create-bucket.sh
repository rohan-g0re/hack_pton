#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}"
BUCKET="${S3_BUCKET_NAME:-caretaker-snapshots-${ACCOUNT_ID}}"
CORS_ORIGIN="${CORS_ORIGIN:-*}"

if ! aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  if [[ "$REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION"
  else
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION"
  fi
  echo "Created bucket $BUCKET"
else
  echo "Bucket $BUCKET already exists"
fi

aws s3api put-public-access-block \
  --bucket "$BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true \
  2>/dev/null || true

aws s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration "{
  \"CORSRules\": [{
    \"AllowedHeaders\": [\"*\"],
    \"AllowedMethods\": [\"GET\", \"PUT\", \"HEAD\"],
    \"AllowedOrigins\": [\"${CORS_ORIGIN}\"],
    \"ExposeHeaders\": [\"ETag\"]
  }]
}"

aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration "{
  \"Rules\": [{
    \"ID\": \"expire-demo-snapshots\",
    \"Status\": \"Enabled\",
    \"Filter\": {\"Prefix\": \"\"},
    \"Expiration\": {\"Days\": 7}
  }]
}"

echo "Bucket ready: $BUCKET (region $REGION)"
echo "Export: export AWS_S3_BUCKET=$BUCKET"
