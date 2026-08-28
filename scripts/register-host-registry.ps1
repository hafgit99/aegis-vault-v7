# Native messaging host registry helper (EXT-B2).
# Called by scripts/register-host.js via `powershell -File` so parameters bind
# correctly (unlike `-Command`, which does not bind param() from extra args).
# No machine-specific data is embedded here; values arrive as parameters.
param($regPath, $manifestFile)

if (-not $regPath -or -not $manifestFile) {
  Write-Error 'Both -regPath and -manifestFile parameters are required.'
  exit 2
}

if (!(Test-Path -LiteralPath $regPath)) {
  New-Item -Path $regPath -Force | Out-Null
}
Set-ItemProperty -LiteralPath $regPath -Name '(Default)' -Value $manifestFile -Force
Write-Output "Registered: $regPath -> $manifestFile"
