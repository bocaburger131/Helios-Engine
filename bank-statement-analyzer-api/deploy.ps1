# Bank Statement Analyzer API Deployment PowerShell Script
# This script automates the deployment process for the Bank Statement Analyzer API

# Function to display colored text
function Write-ColorOutput {
    param (
        [Parameter(Mandatory=$true)]
        [string]$Message,
        [Parameter(Mandatory=$false)]
        [string]$ForegroundColor = "White"
    )
    
    $originalColor = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    Write-Output $Message
    $host.UI.RawUI.ForegroundColor = $originalColor
}

# Print header
Write-ColorOutput "`n===============================================" -ForegroundColor Yellow
Write-ColorOutput "   Bank Statement Analyzer API Deployment Tool   " -ForegroundColor Yellow
Write-ColorOutput "===============================================`n" -ForegroundColor Yellow

# Check if .env file exists
if (-not (Test-Path ".env")) {
    Write-ColorOutput "Error: .env file not found" -ForegroundColor Red
    Write-ColorOutput "Please create a .env file with the required environment variables."
    Write-ColorOutput "You can use .env.example as a template.`n"
    exit 1
}

# Verify Docker is installed
try {
    $dockerVersion = docker --version
    Write-ColorOutput "Docker detected: $dockerVersion" -ForegroundColor Green
} catch {
    Write-ColorOutput "Error: Docker is not installed or not in PATH" -ForegroundColor Red
    Write-ColorOutput "Please install Docker to continue with deployment.`n"
    exit 1
}

# Verify Docker Compose is installed
try {
    $dockerComposeVersion = docker-compose --version
    Write-ColorOutput "Docker Compose detected: $dockerComposeVersion" -ForegroundColor Green
} catch {
    Write-ColorOutput "Error: Docker Compose is not installed or not in PATH" -ForegroundColor Red
    Write-ColorOutput "Please install Docker Compose to continue with deployment.`n"
    exit 1
}

# Function to run a step with proper formatting
function Run-Step {
    param (
        [int]$StepNum,
        [int]$TotalSteps,
        [string]$Description,
        [scriptblock]$Command
    )
    
    Write-ColorOutput "`n[$StepNum/$TotalSteps] $Description" -ForegroundColor Yellow
    Write-ColorOutput "================================================" -ForegroundColor Yellow
    
    try {
        & $Command
        if ($LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE) {
            Write-ColorOutput "✓ Step completed successfully" -ForegroundColor Green
            return $true
        } else {
            Write-ColorOutput "✗ Step failed with exit code $LASTEXITCODE" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-ColorOutput "✗ Step failed with error: $_" -ForegroundColor Red
        return $false
    }
}

# Deployment steps
$TOTAL_STEPS = 6

# Step 1: Verify environment variables
$step1 = Run-Step -StepNum 1 -TotalSteps $TOTAL_STEPS -Description "Verifying environment variables" -Command {
    node scripts/verify-env.js
}
if (-not $step1) {
    Write-ColorOutput "Deployment aborted." -ForegroundColor Red
    exit 1
}

# Step 2: Run tests
$step2 = Run-Step -StepNum 2 -TotalSteps $TOTAL_STEPS -Description "Running tests" -Command {
    npm test
}
if (-not $step2) {
    Write-ColorOutput "Deployment aborted." -ForegroundColor Red
    exit 1
}

# Step 3: Build Docker image
$step3 = Run-Step -StepNum 3 -TotalSteps $TOTAL_STEPS -Description "Building Docker image" -Command {
    docker build -t bank-statement-analyzer-api:latest .
}
if (-not $step3) {
    Write-ColorOutput "Deployment aborted." -ForegroundColor Red
    exit 1
}

# Step 4: Stop existing containers
$step4 = Run-Step -StepNum 4 -TotalSteps $TOTAL_STEPS -Description "Stopping existing containers" -Command {
    docker-compose down --remove-orphans
}
if (-not $step4) {
    Write-ColorOutput "Deployment aborted." -ForegroundColor Red
    exit 1
}

# Step 5: Start services with Docker Compose
$step5 = Run-Step -StepNum 5 -TotalSteps $TOTAL_STEPS -Description "Starting services with Docker Compose" -Command {
    docker-compose up -d
}
if (-not $step5) {
    Write-ColorOutput "Deployment aborted." -ForegroundColor Red
    exit 1
}

# Step 6: Verify services are running
$step6 = Run-Step -StepNum 6 -TotalSteps $TOTAL_STEPS -Description "Verifying services are running" -Command {
    docker-compose ps
}
if (-not $step6) {
    Write-ColorOutput "Deployment aborted." -ForegroundColor Red
    exit 1
}

# Deployment complete
Write-ColorOutput "`n✅ Deployment completed successfully!" -ForegroundColor Green
Write-ColorOutput "📊 Access the API at: http://localhost:3000/api-docs" -ForegroundColor Green
Write-ColorOutput "🔍 Grafana dashboard available at: http://localhost:3100" -ForegroundColor Green
Write-ColorOutput "📈 Prometheus metrics available at: http://localhost:9090`n" -ForegroundColor Green
