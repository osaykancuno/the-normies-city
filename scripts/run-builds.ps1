# Sequential data build runner — meant to be launched detached so it survives the
# parent session. Logs each stage to a file in the project root.
#
# Launch (from project root):
#   cmd /c start "Normie data build" /min powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-builds.ps1

$ErrorActionPreference = "Continue"
Set-Location -Path "$PSScriptRoot\.."

function Run-Stage($name, $logFile) {
    Write-Output "[chain] starting $name -> $logFile"
    "starting $(Get-Date -Format o)" | Out-File -Encoding utf8 -Append $logFile
    & cmd /c "npm run build:$name >> `"$logFile`" 2>&1"
    "finished $(Get-Date -Format o)" | Out-File -Encoding utf8 -Append $logFile
    Write-Output "[chain] $name done"
}

"chain started $(Get-Date -Format o)" | Out-File -Encoding utf8 build-chain.log
Run-Stage "holders" "build-holders.log"
Run-Stage "atlas" "build-atlas.log"
Run-Stage "traits" "build-traits.log"
"chain finished $(Get-Date -Format o)" | Out-File -Encoding utf8 -Append build-chain.log
