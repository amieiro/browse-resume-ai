# Removes the Browse Resume AI native messaging host on Windows. Safe to run more than once.
param(
  [string]$DataDir = $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'browse-resume-ai' } else { '' }),
  [switch]$SkipRegistry
)
$ErrorActionPreference = 'Stop'
$HostName = 'com.browse_resume_ai.host'

if (-not $SkipRegistry) {
  foreach ($key in @(
      "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName",
      "HKCU:\Software\Chromium\NativeMessagingHosts\$HostName"
    )) {
    if (Test-Path $key) { Remove-Item -Path $key -Force }
  }
}
if ($DataDir -and (Test-Path $DataDir)) { Remove-Item -Path $DataDir -Recurse -Force }
Write-Output "Removed $HostName"
