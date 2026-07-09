<#
remove-services.ps1

Fully removes the RBSBackend / RBSFrontend Windows services. Only needed if
you're changing service config (paths, ports, service names) rather than
just shipping new code — for a routine code update, use update-package.ps1
instead, which is safer (keeps .env, doesn't touch service registration).

Run this ON THE TARGET MACHINE, elevated.

Usage:
    .\remove-services.ps1 -NssmPath 'C:\tools\nssm\nssm.exe'
#>

param(
  [string]$NssmPath = ''
)

$ErrorActionPreference = "Stop"

function Find-Nssm {
  param([string]$Provided)
  if ($Provided -and (Test-Path $Provided)) { return (Resolve-Path $Provided).Path }
  $onPath = Get-Command nssm -ErrorAction SilentlyContinue
  if ($onPath) { return $onPath.Path }
  return $null
}

$nssm = Find-Nssm -Provided $NssmPath
if (-not $nssm) {
  Write-Error "nssm.exe not found. Pass -NssmPath 'C:\path\to\nssm.exe'"
  exit 1
}

foreach ($svc in @("RBSBackend", "RBSFrontend")) {
  $existing = Get-Service -Name $svc -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "Stopping and removing $svc..." -ForegroundColor Cyan
    & $nssm stop $svc
    Start-Sleep -Seconds 1
    & $nssm remove $svc confirm
  } else {
    Write-Host "$svc not installed, skipping." -ForegroundColor Yellow
  }
}

Write-Host "Done. Re-run install-services.ps1 pointing at the new package to reinstall." -ForegroundColor Green
