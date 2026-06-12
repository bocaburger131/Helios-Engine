#!/bin/bash

# Bank Statement Analyzer API Deployment Script
# This script automates the deployment process for the Bank Statement Analyzer API

# Color codes for output formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Print header
echo -e "\n${YELLOW}===============================================${NC}"
echo -e "${YELLOW}   Bank Statement Analyzer API Deployment Tool   ${NC}"
echo -e "${YELLOW}===============================================${NC}\n"

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo -e "Please create a .env file with the required environment variables."
    echo -e "You can use .env.example as a template.\n"
    exit 1
fi

# Verify Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed or not in PATH${NC}"
    echo -e "Please install Docker to continue with deployment.\n"
    exit 1
fi

# Verify Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed or not in PATH${NC}"
    echo -e "Please install Docker Compose to continue with deployment.\n"
    exit 1
fi

# Function to run a step with proper formatting
run_step() {
    step_num=$1
    total_steps=$2
    description=$3
    command=$4

    echo -e "\n${YELLOW}[$step_num/$total_steps] $description${NC}"
    echo -e "${YELLOW}$(printf '=%.0s' $(seq 1 50))${NC}"
    
    if eval $command; then
        echo -e "${GREEN}✓ Step completed successfully${NC}"
    else
        echo -e "${RED}✗ Step failed${NC}"
        echo -e "${RED}Deployment aborted.${NC}"
        exit 1
    fi
}

# Deployment steps
TOTAL_STEPS=6

# Step 1: Verify environment variables
run_step 1 $TOTAL_STEPS "Verifying environment variables" "node scripts/verify-env.js"

# Step 2: Run tests
run_step 2 $TOTAL_STEPS "Running tests" "npm test"

# Step 3: Build Docker image
run_step 3 $TOTAL_STEPS "Building Docker image" "docker build -t bank-statement-analyzer-api:latest ."

# Step 4: Stop existing containers
run_step 4 $TOTAL_STEPS "Stopping existing containers" "docker-compose down --remove-orphans"

# Step 5: Start services with Docker Compose
run_step 5 $TOTAL_STEPS "Starting services with Docker Compose" "docker-compose up -d"

# Step 6: Verify services are running
run_step 6 $TOTAL_STEPS "Verifying services are running" "docker-compose ps"

# Deployment complete
echo -e "\n${GREEN}✅ Deployment completed successfully!${NC}"
echo -e "${GREEN}📊 Access the API at: http://localhost:3000/api-docs${NC}"
echo -e "${GREEN}🔍 Grafana dashboard available at: http://localhost:3100${NC}"
echo -e "${GREEN}📈 Prometheus metrics available at: http://localhost:9090${NC}\n"
