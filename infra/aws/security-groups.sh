#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
VPC_ID="${VPC_ID:-$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text --region "$REGION")}"
NAME="${WORKER_SG_NAME:-caretaker-worker-sg}"

# SSH: default to current public IP /32, or override SG_ALLOW_SSH_FROM=0.0.0.0/0 for demos
MY_IP="${SG_ALLOW_SSH_FROM:-$(curl -s -4 https://ifconfig.me 2>/dev/null || echo "0.0.0.0")}"
if [[ "$MY_IP" != *"/"* ]]; then
  MY_IP="${MY_IP}/32"
fi

WEB_SG="${WEB_SG_ID:-}"

# Ports worker + notifier listen on — restrict to web SG when set
APP_CIDR="${APP_PORT_SOURCE:-0.0.0.0/0}"
if [[ -n "$WEB_SG" ]]; then
  APP_CIDR=""
fi

EXISTING=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=$NAME" "Name=vpc-id,Values=$VPC_ID" \
  --query 'SecurityGroups[0].GroupId' --output text --region "$REGION" 2>/dev/null || echo "None")

if [[ "$EXISTING" == "None" || "$EXISTING" == "null" ]]; then
  SG_ID=$(aws ec2 create-security-group \
    --group-name "$NAME" \
    --description "Caretaker worker + notifier (hackathon)" \
    --vpc-id "$VPC_ID" \
    --region "$REGION" \
    --query GroupId --output text)
  echo "Created security group $SG_ID"
else
  SG_ID="$EXISTING"
  echo "Using existing security group $SG_ID"
fi

authorize() {
  local port=$1
  local cidr=$2
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol tcp --port "$port" --cidr "$cidr" --region "$REGION" 2>/dev/null \
    && echo "Authorized $port from $cidr" || echo "Rule may already exist: $port $cidr"
}

authorize 22 "$MY_IP"

if [[ -n "$WEB_SG" ]]; then
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol tcp --port 3031 \
    --source-group "$WEB_SG" --region "$REGION" 2>/dev/null \
    && echo "Authorized 3031 from web sg $WEB_SG" || true
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol tcp --port 3040 \
    --source-group "$WEB_SG" --region "$REGION" 2>/dev/null \
    && echo "Authorized 3040 from web sg $WEB_SG" || true
else
  authorize 3031 "${APP_CIDR:-0.0.0.0/0}"
  authorize 3040 "${APP_CIDR:-0.0.0.0/0}"
fi

echo "Worker security group id: $SG_ID"
echo "Attach $SG_ID to the worker EC2 instance (and set WORKER_SG_ID=$SG_ID when re-running to idempotent-add rules)."
