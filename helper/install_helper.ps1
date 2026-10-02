# Registers the Magic Qube helper to start hidden at logon, with the admin rights CPU temperatures need.
# Run from an elevated PowerShell:
#   powershell -ExecutionPolicy Bypass -File helper\install_helper.ps1 -LhmPath "C:\path\to\LibreHardwareMonitor"
# Remove it again with -Uninstall.
param(
    [string]$LhmPath,
    [string]$Python = (Join-Path $PSScriptRoot "..\.venv\Scripts\pythonw.exe"),
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$taskName = "Thermalright Magic Qube Helper"

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed scheduled task '$taskName'."
    return
}

if (-not $LhmPath -or -not (Test-Path (Join-Path $LhmPath "LibreHardwareMonitorLib.dll"))) {
    throw "Pass -LhmPath: the folder from LibreHardwareMonitor.zip that contains LibreHardwareMonitorLib.dll."
}
$Python = (Resolve-Path $Python).Path
$script = (Resolve-Path (Join-Path $PSScriptRoot "magic_qube_helper.py")).Path

$action = New-ScheduledTaskAction -Execute $Python -Argument "`"$script`" --lhm `"$LhmPath`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal `
    -Settings $settings -Force | Out-Null
Write-Host "Registered scheduled task '$taskName'. It starts at your next logon; starting it now too."
Start-ScheduledTask -TaskName $taskName
