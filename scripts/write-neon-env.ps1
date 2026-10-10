# Writes the Neon connection strings into .env without printing them.
# Run from the project root: & .\scripts\write-neon-env.ps1
$ErrorActionPreference = "Stop"
$neon = "C:\Users\admin\AppData\Roaming\npm\neon.cmd"
$project = "dawn-union-72984071"

$prod = (& $neon cs production --project-id $project --pooled).Trim()
$test = (& $neon cs test --project-id $project --pooled).Trim()
if (-not $prod.StartsWith("postgres")) { throw "Could not read the production connection string" }
if (-not $test.StartsWith("postgres")) { throw "Could not read the test connection string" }
if ($prod -eq $test) { throw "Production and test strings are identical - check the 'test' branch" }

$envFile = Join-Path (Get-Location) ".env"
$lines = @()
if (Test-Path $envFile) {
  $lines = Get-Content $envFile | Where-Object { $_ -notmatch '^(NEON_DATABASE_URL|NEON_TEST_DATABASE_URL)=' }
}
$lines += "NEON_DATABASE_URL=$prod"
$lines += "NEON_TEST_DATABASE_URL=$test"
[System.IO.File]::WriteAllLines($envFile, $lines)

$prodHost = ([uri]$prod).Host
$testHost = ([uri]$test).Host
Write-Host "Wrote .env"
Write-Host "  NEON_DATABASE_URL      -> host $prodHost"
Write-Host "  NEON_TEST_DATABASE_URL -> host $testHost"
