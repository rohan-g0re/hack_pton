#!/usr/bin/env bash
# =============================================================================
# infra/aws/setup.sh — complete one-shot AWS infrastructure provisioner
#
# Creates (all idempotent — safe to re-run):
#   • S3 bucket  (caretaker-snapshots-<account>)
#   • Web security group  (caretaker-web-sg)   — inbound 22, 3000 from 0.0.0.0/0
#   • Worker security group (caretaker-worker-sg) — inbound 22 from your IP, 3031+3040 from web-sg
#   • EC2 #1: web    (Ubuntu 24.04, t3.small)  + Elastic IP
#   • EC2 #2: worker (Ubuntu 24.04, t3.medium) + no EIP (private comms + SSH)
#   • Writes infra/.instances.json with all IDs + IPs for deploy scripts
#
# Prerequisites:
#   aws configure done (region us-east-1 recommended)
#   key pair "caretaker-key" already exists (aws ec2 create-key-pair …)
#
# Usage:
#   cd infra/aws && chmod +x setup.sh && ./setup.sh
#   Or with overrides:
#     KEY_NAME=my-key REGION=us-east-1 WEB_PORT=3000 ./setup.sh
# =============================================================================
set -euo pipefail

# ── Configuration (override via env) ─────────────────────────────────────────
REGION="${AWS_REGION:-us-east-1}"
KEY_NAME="${KEY_NAME:-caretaker-key}"
WEB_INSTANCE_TYPE="${WEB_INSTANCE_TYPE:-t3.small}"
WORKER_INSTANCE_TYPE="${WORKER_INSTANCE_TYPE:-t3.small}"
WEB_PORT="${WEB_PORT:-3000}"
PROJECT_TAG="hack-princeton-2026"

# ── Resolve account + AMI ────────────────────────────────────────────────────
echo "→ Resolving AWS account and Ubuntu 24.04 AMI …"
ACCOUNT_ID=$(aws sts get-caller-identity \
  --query Account --output text --region "$REGION")
echo "  Account: $ACCOUNT_ID  Region: $REGION"

# Latest Ubuntu 24.04 LTS (Noble) amd64 HVM SSD via AWS SSM public parameter
# Per: https://docs.aws.amazon.com/cli/latest/reference/ssm/get-parameter.html
AMI_ID=$(aws ssm get-parameter \
  --name "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id" \
  --region "$REGION" \
  --query "Parameter.Value" --output text 2>/dev/null || echo "")

if [[ -z "$AMI_ID" || "$AMI_ID" == "None" ]]; then
  # Fallback: describe-images filter
  # Per: https://docs.aws.amazon.com/cli/latest/reference/ec2/describe-images.html
  AMI_ID=$(aws ec2 describe-images \
    --owners 099720109477 \
    --filters \
      "Name=name,Values=ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*" \
      "Name=state,Values=available" \
      "Name=architecture,Values=x86_64" \
    --query "sort_by(Images, &CreationDate)[-1].ImageId" \
    --output text \
    --region "$REGION")
fi
echo "  AMI: $AMI_ID (Ubuntu 24.04 LTS)"

# ── Default VPC + public subnet ──────────────────────────────────────────────
VPC_ID=$(aws ec2 describe-vpcs \
  --filters "Name=isDefault,Values=true" \
  --query "Vpcs[0].VpcId" --output text --region "$REGION")

# Find AZs that support BOTH instance types we need.
# Per: https://docs.aws.amazon.com/cli/latest/reference/ec2/describe-instance-type-offerings.html
SUPPORTED_AZS=$(aws ec2 describe-instance-type-offerings \
  --location-type availability-zone \
  --filters "Name=instance-type,Values=$WEB_INSTANCE_TYPE,$WORKER_INSTANCE_TYPE" \
  --query "InstanceTypeOfferings[].Location" --output text --region "$REGION")

# Pick a default subnet whose AZ is in SUPPORTED_AZS.
SUBNET_ID=""
for AZ in $SUPPORTED_AZS; do
  CANDIDATE=$(aws ec2 describe-subnets \
    --filters \
      "Name=vpc-id,Values=$VPC_ID" \
      "Name=defaultForAz,Values=true" \
      "Name=availability-zone,Values=$AZ" \
    --query "Subnets[0].SubnetId" --output text --region "$REGION" 2>/dev/null || echo "None")
  if [[ -n "$CANDIDATE" && "$CANDIDATE" != "None" ]]; then
    SUBNET_ID="$CANDIDATE"
    SUBNET_AZ="$AZ"
    break
  fi
done

if [[ -z "$SUBNET_ID" ]]; then
  echo "ERROR: no default subnet in any AZ that supports $WEB_INSTANCE_TYPE + $WORKER_INSTANCE_TYPE" >&2
  exit 1
fi

echo "  VPC: $VPC_ID  Subnet: $SUBNET_ID  AZ: $SUBNET_AZ"

# ── S3 bucket ────────────────────────────────────────────────────────────────
echo ""
echo "→ S3 bucket …"
BUCKET="caretaker-snapshots-${ACCOUNT_ID}"

if ! aws s3api head-bucket --bucket "$BUCKET" --region "$REGION" 2>/dev/null; then
  if [[ "$REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION"
  else
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION"
  fi
  echo "  Created bucket $BUCKET"
else
  echo "  Bucket $BUCKET already exists"
fi

aws s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration '{
  "CORSRules": [{
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET","PUT","HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"]
  }]
}' 2>/dev/null || true

aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" \
  --lifecycle-configuration '{
    "Rules": [{
      "ID": "expire-demo-snapshots",
      "Status": "Enabled",
      "Filter": {"Prefix": ""},
      "Expiration": {"Days": 7}
    }]
  }' 2>/dev/null || true
echo "  Bucket ready: $BUCKET"

# ── Web security group ───────────────────────────────────────────────────────
echo ""
echo "→ Web security group …"
WEB_SG_NAME="caretaker-web-sg"
WEB_SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=$WEB_SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
  --query "SecurityGroups[0].GroupId" --output text --region "$REGION" 2>/dev/null || echo "")

if [[ -z "$WEB_SG_ID" || "$WEB_SG_ID" == "None" ]]; then
  # Per: https://docs.aws.amazon.com/cli/latest/reference/ec2/create-security-group.html
  WEB_SG_ID=$(aws ec2 create-security-group \
    --group-name "$WEB_SG_NAME" \
    --description "Caretaker web server - SSH + app port" \
    --vpc-id "$VPC_ID" \
    --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=$WEB_SG_NAME},{Key=Project,Value=$PROJECT_TAG}]" \
    --query "GroupId" --output text --region "$REGION")
  echo "  Created web-sg $WEB_SG_ID"
else
  echo "  Existing web-sg $WEB_SG_ID"
fi

# Per: https://docs.aws.amazon.com/cli/latest/reference/ec2/authorize-security-group-ingress.html
authorize_sg_cidr() {
  local sg_id="$1" port="$2" cidr="$3"
  aws ec2 authorize-security-group-ingress \
    --group-id "$sg_id" --protocol tcp --port "$port" --cidr "$cidr" \
    --region "$REGION" 2>/dev/null \
    && echo "  Authorized sg $sg_id port $port from $cidr" || true
}

authorize_sg_cidr "$WEB_SG_ID" 22 "0.0.0.0/0"
authorize_sg_cidr "$WEB_SG_ID" "$WEB_PORT" "0.0.0.0/0"

# ── Worker security group ────────────────────────────────────────────────────
echo ""
echo "→ Worker security group …"
WORKER_SG_NAME="caretaker-worker-sg"
WORKER_SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=$WORKER_SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
  --query "SecurityGroups[0].GroupId" --output text --region "$REGION" 2>/dev/null || echo "")

if [[ -z "$WORKER_SG_ID" || "$WORKER_SG_ID" == "None" ]]; then
  WORKER_SG_ID=$(aws ec2 create-security-group \
    --group-name "$WORKER_SG_NAME" \
    --description "Caretaker worker + notifier - SSH + health + notify" \
    --vpc-id "$VPC_ID" \
    --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=$WORKER_SG_NAME},{Key=Project,Value=$PROJECT_TAG}]" \
    --query "GroupId" --output text --region "$REGION")
  echo "  Created worker-sg $WORKER_SG_ID"
else
  echo "  Existing worker-sg $WORKER_SG_ID"
fi

authorize_sg_cidr "$WORKER_SG_ID" 22 "0.0.0.0/0"

# Health (3031) and notifier (3040) from web SG only
# Per: https://docs.aws.amazon.com/cli/latest/reference/ec2/authorize-security-group-ingress.html
for PORT in 3031 3040; do
  aws ec2 authorize-security-group-ingress \
    --group-id "$WORKER_SG_ID" --protocol tcp --port "$PORT" \
    --source-group "$WEB_SG_ID" \
    --region "$REGION" 2>/dev/null \
    && echo "  Authorized worker-sg port $PORT from web-sg" || true
done

# ── User-data: install Node 20 + pm2 (runs once at first boot) ───────────────
read -r -d '' USER_DATA_WEB <<'USERDATA_EOF' || true
#!/bin/bash
set -e
apt-get update -y
apt-get install -y ca-certificates curl gnupg rsync
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
  > /etc/apt/sources.list.d/nodesource.list
apt-get update -y
apt-get install -y nodejs
npm install -g pm2
mkdir -p /home/ubuntu/hack_pton
chown ubuntu:ubuntu /home/ubuntu/hack_pton
USERDATA_EOF

# Worker uses same bootstrap script — pm2 starts both worker + notifier
USER_DATA_WORKER="$USER_DATA_WEB"

# ── EC2 #1: web ─────────────────────────────────────────────────────────────
echo ""
echo "→ EC2 #1 (web: $WEB_INSTANCE_TYPE) …"
WEB_INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=caretaker-web" "Name=instance-state-name,Values=running,stopped,stopping,pending" \
  --query "Reservations[0].Instances[0].InstanceId" --output text --region "$REGION" 2>/dev/null || echo "")

if [[ -z "$WEB_INSTANCE_ID" || "$WEB_INSTANCE_ID" == "None" ]]; then
  # Per: https://docs.aws.amazon.com/cli/latest/reference/ec2/run-instances.html
  WEB_INSTANCE_ID=$(aws ec2 run-instances \
    --image-id "$AMI_ID" \
    --instance-type "$WEB_INSTANCE_TYPE" \
    --key-name "$KEY_NAME" \
    --security-group-ids "$WEB_SG_ID" \
    --subnet-id "$SUBNET_ID" \
    --associate-public-ip-address \
    --count 1 \
    --user-data "$USER_DATA_WEB" \
    --tag-specifications \
      "ResourceType=instance,Tags=[{Key=Name,Value=caretaker-web},{Key=Project,Value=$PROJECT_TAG}]" \
      "ResourceType=volume,Tags=[{Key=Project,Value=$PROJECT_TAG}]" \
    --query "Instances[0].InstanceId" --output text --region "$REGION")
  echo "  Launched web instance $WEB_INSTANCE_ID"
else
  echo "  Existing web instance $WEB_INSTANCE_ID"
fi

# ── EC2 #2: worker ──────────────────────────────────────────────────────────
echo ""
echo "→ EC2 #2 (worker: $WORKER_INSTANCE_TYPE) …"
WORKER_INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=caretaker-worker" "Name=instance-state-name,Values=running,stopped,stopping,pending" \
  --query "Reservations[0].Instances[0].InstanceId" --output text --region "$REGION" 2>/dev/null || echo "")

if [[ -z "$WORKER_INSTANCE_ID" || "$WORKER_INSTANCE_ID" == "None" ]]; then
  WORKER_INSTANCE_ID=$(aws ec2 run-instances \
    --image-id "$AMI_ID" \
    --instance-type "$WORKER_INSTANCE_TYPE" \
    --key-name "$KEY_NAME" \
    --security-group-ids "$WORKER_SG_ID" \
    --subnet-id "$SUBNET_ID" \
    --associate-public-ip-address \
    --count 1 \
    --user-data "$USER_DATA_WORKER" \
    --tag-specifications \
      "ResourceType=instance,Tags=[{Key=Name,Value=caretaker-worker},{Key=Project,Value=$PROJECT_TAG}]" \
      "ResourceType=volume,Tags=[{Key=Project,Value=$PROJECT_TAG}]" \
    --query "Instances[0].InstanceId" --output text --region "$REGION")
  echo "  Launched worker instance $WORKER_INSTANCE_ID"
else
  echo "  Existing worker instance $WORKER_INSTANCE_ID"
fi

# ── Wait for both instances to reach "running" ────────────────────────────────
echo ""
echo "→ Waiting for instances to reach running state (up to ~3 min) …"
# Per: https://docs.aws.amazon.com/cli/latest/reference/ec2/wait/instance-running.html
aws ec2 wait instance-running \
  --instance-ids "$WEB_INSTANCE_ID" "$WORKER_INSTANCE_ID" \
  --region "$REGION"
echo "  Both instances running."

# ── Elastic IP for web ────────────────────────────────────────────────────────
echo ""
echo "→ Elastic IP for web instance …"

# Check if web instance already has an EIP
EXISTING_EIP=$(aws ec2 describe-addresses \
  --filters "Name=instance-id,Values=$WEB_INSTANCE_ID" \
  --query "Addresses[0].PublicIp" --output text --region "$REGION" 2>/dev/null || echo "")

if [[ -z "$EXISTING_EIP" || "$EXISTING_EIP" == "None" ]]; then
  # Per: https://docs.aws.amazon.com/cli/latest/reference/ec2/allocate-address.html
  EIP_ALLOC=$(aws ec2 allocate-address \
    --domain vpc \
    --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=caretaker-web-eip},{Key=Project,Value=$PROJECT_TAG}]" \
    --region "$REGION")
  EIP_ALLOC_ID=$(echo "$EIP_ALLOC" | python3 -c "import sys,json; print(json.load(sys.stdin)['AllocationId'])")
  WEB_PUBLIC_IP=$(echo "$EIP_ALLOC" | python3 -c "import sys,json; print(json.load(sys.stdin)['PublicIp'])")

  # Per: https://docs.aws.amazon.com/cli/latest/reference/ec2/associate-address.html
  aws ec2 associate-address \
    --instance-id "$WEB_INSTANCE_ID" \
    --allocation-id "$EIP_ALLOC_ID" \
    --region "$REGION" > /dev/null
  echo "  Allocated + associated EIP $WEB_PUBLIC_IP (alloc $EIP_ALLOC_ID)"
else
  WEB_PUBLIC_IP="$EXISTING_EIP"
  echo "  Existing EIP $WEB_PUBLIC_IP already attached"
fi

# Worker public IP (no EIP — just use the auto-assigned one)
WORKER_PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids "$WORKER_INSTANCE_ID" \
  --query "Reservations[0].Instances[0].PublicIpAddress" --output text --region "$REGION")

# ── Write connection info ─────────────────────────────────────────────────────
# Script lives at infra/aws/setup.sh → two levels up is the repo root
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
INSTANCES_JSON="$REPO_ROOT/infra/.instances.json"
cat > "$INSTANCES_JSON" <<JSON
{
  "web": {
    "instanceId": "$WEB_INSTANCE_ID",
    "publicIp": "$WEB_PUBLIC_IP",
    "type": "$WEB_INSTANCE_TYPE",
    "securityGroup": "$WEB_SG_ID",
    "appPort": $WEB_PORT
  },
  "worker": {
    "instanceId": "$WORKER_INSTANCE_ID",
    "publicIp": "$WORKER_PUBLIC_IP",
    "type": "$WORKER_INSTANCE_TYPE",
    "securityGroup": "$WORKER_SG_ID"
  },
  "s3Bucket": "$BUCKET",
  "region": "$REGION",
  "keyName": "$KEY_NAME",
  "accountId": "$ACCOUNT_ID"
}
JSON
echo ""
echo "  Saved to infra/.instances.json"

# ── Also write scripts/.deploy.env if it doesn't exist ───────────────────────
DEPLOY_ENV="$REPO_ROOT/scripts/.deploy.env"
if [[ ! -f "$DEPLOY_ENV" ]]; then
  cat > "$DEPLOY_ENV" <<DEPLOY
WEB_HOST=${WEB_PUBLIC_IP}
WORKER_HOST=${WORKER_PUBLIC_IP}
SSH_KEY=\${SSH_KEY:-\$HOME/.ssh/caretaker-key.pem}
DEPLOY
  echo "  Created scripts/.deploy.env"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════"
echo "  Infrastructure ready!"
echo ""
echo "  S3 bucket:     $BUCKET"
echo "  Web EC2:       $WEB_INSTANCE_ID  ($WEB_PUBLIC_IP)"
echo "  Worker EC2:    $WORKER_INSTANCE_ID  ($WORKER_PUBLIC_IP)"
echo ""
echo "  SSH web:       ssh -i ~/.ssh/caretaker-key.pem ubuntu@$WEB_PUBLIC_IP"
echo "  SSH worker:    ssh -i ~/.ssh/caretaker-key.pem ubuntu@$WORKER_PUBLIC_IP"
echo ""
echo "  Next steps:"
echo "  1. Copy per-box .env files:"
echo "     scripts/sync-env.sh ubuntu@$WEB_PUBLIC_IP apps/web.env.example"
echo "     scripts/sync-env.sh ubuntu@$WORKER_PUBLIC_IP apps/workers.env.example"
echo "  2. Deploy:"
echo "     scripts/deploy-all.sh"
echo "  3. Verify:"
echo "     curl http://$WEB_PUBLIC_IP:$WEB_PORT/api/state"
echo "════════════════════════════════════════════════"
