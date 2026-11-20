# Runs inside the test/windows container (PowerShell on Linux).
$ErrorActionPreference = 'Stop'
function Assert($condition, $message) { if (-not $condition) { throw "FAIL: $message" } }

Write-Output '== Parse the scripts'
foreach ($script in 'native-host/install.ps1', 'native-host/uninstall.ps1') {
  $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $script), [ref]$null, [ref]$errors) | Out-Null
  Assert ($errors.Count -eq 0) "$script has syntax errors: $errors"
}

Write-Output '== Stand-in CLIs: claude as an executable, codex as an npm .cmd shim'
$bin = Join-Path $HOME 'bin'
New-Item -ItemType Directory -Force -Path $bin | Out-Null
Set-Content -Path (Join-Path $bin 'claude') -Value "#!/bin/sh`necho claude"
chmod +x (Join-Path $bin 'claude')
Copy-Item native-host/test/fixtures/shims/codex.cmd (Join-Path $bin 'codex.cmd')
chmod +x (Join-Path $bin 'codex.cmd')
$env:PATH = "$bin$([System.IO.Path]::PathSeparator)$env:PATH"

Write-Output '== Install'
$data = Join-Path $HOME 'data'
& ./native-host/install.ps1 -DataDir $data -SkipRegistry

$manifest = Get-Content (Join-Path $data 'com.browse_resume_ai.host.json') -Raw | ConvertFrom-Json
Assert ($manifest.name -eq 'com.browse_resume_ai.host') 'manifest name'
Assert ($manifest.type -eq 'stdio') 'manifest type'
Assert ($manifest.path -eq (Join-Path $data 'launcher.bat')) 'manifest path'
Assert (@($manifest.allowed_origins).Count -eq 1) 'allowed_origins is a one-item array'
Assert ($manifest.allowed_origins[0] -eq 'chrome-extension://pdokiakaaeffjlabmofdppjakdhaimpi/') 'allowed origin'

$bytes = [System.IO.File]::ReadAllBytes((Join-Path $data 'launcher.bat'))
Assert (-not ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB)) 'launcher.bat has no BOM'
$launcher = [System.Text.Encoding]::UTF8.GetString($bytes)
Write-Output $launcher
Assert ($launcher.StartsWith('@echo off')) 'launcher starts with @echo off'
Assert ($launcher.Contains("`r`n")) 'launcher uses CRLF'
Assert ($launcher -match 'set "CLAUDE_BIN=.*/bin/claude"') 'CLAUDE_BIN is the executable'
Assert ($launcher -match 'set "CODEX_BIN=.*node_modules.*codex\.js"') 'CODEX_BIN is the JavaScript entry of the shim'
Assert ($launcher -match 'host\.mjs" %\*') 'launcher runs host.mjs with the arguments'

Write-Output '== Uninstall'
& ./native-host/uninstall.ps1 -DataDir $data -SkipRegistry
Assert (-not (Test-Path $data)) 'data folder removed'

Write-Output 'Windows scripts: all checks passed'
